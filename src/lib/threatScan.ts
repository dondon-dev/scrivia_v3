/**
 * Threat scan for uploaded data files.
 *
 * Hardcoded, client-side first gate that checks uploaded files for script,
 * command, SQL-injection, spreadsheet-formula and disguised-executable payloads
 * before a file reaches the import pipeline. This is defense-in-depth only —
 * always pair it with server-side validation and row-level security.
 *
 * The rules live here on purpose: they are a static, auditable blocklist that
 * cannot be tampered with through the UI.
 */

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ThreatRule {
  pattern: RegExp;
  label: string;
  severity: ThreatSeverity;
}

export interface ThreatScanResult {
  /** True when at least one rule fired. */
  suspicious: boolean;
  /** True when the file must be rejected (severity medium or higher). */
  blocked: boolean;
  /** Human-readable list of what was found (deduplicated). */
  reasons: string[];
  rulesHit: { label: string; severity: ThreatSeverity }[];
  bytesScanned: number;
}

const SEVERITY_ORDER: Record<ThreatSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** How much of the file head is scanned (keep bounded — payloads hide here). */
const HEAD_SCAN_BYTES = 512 * 1024;
/** Tail is also scanned for trailing payloads on files larger than 1 MB. */
const TAIL_SCAN_BYTES = 64 * 1024;

/* ---------------------------------------------------------------------------
 * Hardcoded rules
 * ------------------------------------------------------------------------- */

const SCRIPT_XSS_RULES: ThreatRule[] = [
  { pattern: /<script[\s>]|<\/script>/i, label: 'HTML <script> tag', severity: 'critical' },
  { pattern: /javascript\s*:/i, label: 'javascript: URI', severity: 'high' },
  { pattern: /vbscript\s*:/i, label: 'vbscript: URI', severity: 'high' },
  { pattern: /\bon(load|error|click|mouseover|mouseenter|focus|change|submit|input)\s*=/i, label: 'inline event handler', severity: 'high' },
  { pattern: /document\.(cookie|write|location|execCommand)/i, label: 'DOM manipulation script', severity: 'critical' },
  { pattern: /\beval\s*\(/i, label: 'eval() call', severity: 'critical' },
  { pattern: /\bnew\s+Function\s*\(/i, label: 'Function() constructor', severity: 'critical' },
  { pattern: /\b(atob|btoa|fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/i, label: 'network / encoding API call', severity: 'high' },
];

const COMMAND_EXECUTION_RULES: ThreatRule[] = [
  { pattern: /\brm\s+-(rf|fr|r|f|recursive|force)\b/i, label: 'file deletion command (rm -rf)', severity: 'critical' },
  { pattern: /\b(powershell|pwsh|cmd\.exe|wscript|cscript|mshta|rundll32)\b/i, label: 'shell / script host execution', severity: 'critical' },
  { pattern: /\bcmd\s*\/\s*c\b/i, label: 'cmd /c execution', severity: 'critical' },
  { pattern: /\b(bash|sh|zsh|ash|ksh)\s+-[ec]\b/i, label: 'shell -c / -e execution', severity: 'critical' },
  { pattern: /\b(net\s+user|netsh|whoami|netstat|taskkill|reg\s+add|sc\s+create|shutdown)\b/i, label: 'system manipulation command', severity: 'high' },
  { pattern: /\b(curl|wget|nc|ncat)\s+(https?:)?\/\//i, label: 'download-and-run attempt', severity: 'high' },
  { pattern: /\bchmod\s+(\+x|\d{3,4})\b/i, label: 'permission escalation (chmod)', severity: 'high' },
  { pattern: /\b(del|erase|format|diskpart)\s+[a-z]:\b/i, label: 'drive wipe command', severity: 'critical' },
  { pattern: /\/bin\/(sh|bash|zsh|nc|ncat|perl|python)\b/i, label: 'binary execution path', severity: 'critical' },
  { pattern: /\b(nc|ncat|telnet|ssh)\s+-[a-z]*e\b/i, label: 'reverse shell attempt', severity: 'critical' },
  { pattern: /#!\s*\/?(usr\/)?bin\/(sh|bash|python|perl)/i, label: 'script shebang', severity: 'critical' },
];

const SQL_INJECTION_RULES: ThreatRule[] = [
  { pattern: /\bunion\s+(all\s+)?select\b/i, label: 'SQL UNION SELECT', severity: 'critical' },
  { pattern: /\b(drop|truncate)\s+(table|database|schema)\b/i, label: 'SQL destructive statement', severity: 'critical' },
  { pattern: /\b(xp_cmdshell|pg_sleep|information_schema|pg_catalog)\b/i, label: 'SQL system function', severity: 'critical' },
  { pattern: /;\s*(drop|delete|insert|update|alter|grant|truncate)\b/i, label: 'stacked SQL statement', severity: 'critical' },
  { pattern: /'(\s*--|\s*;|\s*or\s+1\s*=\s*1)/i, label: 'SQL string break / boolean injection', severity: 'critical' },
  { pattern: /\bselect\s+\*\s+from\b/i, label: 'SQL SELECT * dump', severity: 'medium' },
  { pattern: /\bdelete\s+from\b|\bupdate\s+\w+\s+set\b/i, label: 'SQL data modification', severity: 'high' },
];

const FORMULA_INJECTION_RULES: ThreatRule[] = [
  { pattern: /(^|[\r\n,])\s*=\s*(HYPERLINK|WEBSERVICE|IMPORTXML|IMPORTDATA|CMD|EXEC|SHELL|RUN|open)\s*\(/i, label: 'spreadsheet formula injection (dangerous function)', severity: 'critical' },
  { pattern: /(^|[\r\n,])\s*=\s*[^=\s,]+/i, label: 'spreadsheet formula injection (= cell)', severity: 'high' },
  { pattern: /(^|[\r\n,])\s*@\s*[a-z]+(?:\s|\(|$)/i, label: 'spreadsheet formula injection (@ cell)', severity: 'medium' },
  { pattern: /(^|[\r\n,])\s*[+-]\s*(cmd|shell|exec|system|open|http|https|ftp|www|'|1=)/i, label: 'spreadsheet formula injection (+/- cell)', severity: 'high' },
];

const DISGUISED_FILE_RULES: ThreatRule[] = [
  { pattern: /<\?php/i, label: 'PHP code embedded', severity: 'critical' },
  { pattern: /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR/i, label: 'EICAR antivirus test signature', severity: 'critical' },
  { pattern: /%!PS-Adobe-3\.0\s+EPSF|%!PS-Adobe-2\.0\s+EPSF/i, label: 'PostScript / EPS payload', severity: 'high' },
  { pattern: /[A-Za-z0-9+/]{400,}={0,2}/, label: 'large encoded (base64) blob', severity: 'low' },
];

const ALL_RULES: ThreatRule[] = [
  ...SCRIPT_XSS_RULES,
  ...COMMAND_EXECUTION_RULES,
  ...SQL_INJECTION_RULES,
  ...FORMULA_INJECTION_RULES,
  ...DISGUISED_FILE_RULES,
];

/* ---------------------------------------------------------------------------
 * Scanner
 * ------------------------------------------------------------------------- */

/** Binary header checks (exe / ELF) — applied to raw bytes. */
function binaryHeaderHits(bytes: Uint8Array): { label: string; severity: ThreatSeverity }[] {
  const hits: { label: string; severity: ThreatSeverity }[] = [];
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
    hits.push({ label: 'Windows executable header (MZ)', severity: 'critical' });
  }
  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    hits.push({ label: 'Linux ELF executable header', severity: 'critical' });
  }
  return hits;
}

function runTextRules(text: string): { label: string; severity: ThreatSeverity }[] {
  const hits: { label: string; severity: ThreatSeverity }[] = [];
  for (const rule of ALL_RULES) {
    if (rule.pattern.test(text)) {
      hits.push({ label: rule.label, severity: rule.severity });
    }
  }
  return hits;
}

export async function scanFileForThreats(file: File): Promise<ThreatScanResult> {
  const head = await file.slice(0, HEAD_SCAN_BYTES).arrayBuffer();
  const headBytes = new Uint8Array(head);

  let scanned = headBytes.byteLength;
  let tailText = '';
  if (file.size > HEAD_SCAN_BYTES) {
    const tail = await file.slice(Math.max(file.size - TAIL_SCAN_BYTES, HEAD_SCAN_BYTES), file.size).arrayBuffer();
    tailText = decodeText(new Uint8Array(tail));
    scanned += tailText.length;
  }

  const headText = decodeText(headBytes);
  const latin1 = decodeLatin1(headBytes);

  const hits = new Map<string, ThreatSeverity>();
  for (const h of binaryHeaderHits(headBytes)) hits.set(h.label, h.severity);
  for (const h of runTextRules(headText)) hits.set(h.label, h.severity);
  for (const h of runTextRules(latin1)) hits.set(h.label, h.severity);
  for (const h of runTextRules(tailText)) hits.set(h.label, h.severity);

  const rulesHit = [...hits.entries()].map(([label, severity]) => ({ label, severity }));
  rulesHit.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  const reasons = rulesHit.map((r) => r.label);
  const blocked = rulesHit.some((r) => SEVERITY_ORDER[r.severity] >= SEVERITY_ORDER.medium);

  return {
    suspicious: rulesHit.length > 0,
    blocked,
    reasons,
    rulesHit,
    bytesScanned: scanned,
  };
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function decodeLatin1(bytes: Uint8Array): string {
  try {
    return new TextDecoder('latin1').decode(bytes);
  } catch {
    return '';
  }
}

/** Convenience: classify a single string (e.g. a pasted CSV row). */
export function scanTextForThreats(text: string): ThreatScanResult {
  const hits = new Map<string, ThreatSeverity>();
  for (const h of runTextRules(text)) hits.set(h.label, h.severity);
  const rulesHit = [...hits.entries()].map(([label, severity]) => ({ label, severity }));
  rulesHit.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  const reasons = rulesHit.map((r) => r.label);
  const blocked = rulesHit.some((r) => SEVERITY_ORDER[r.severity] >= SEVERITY_ORDER.medium);
  return { suspicious: rulesHit.length > 0, blocked, reasons, rulesHit, bytesScanned: text.length };
}
