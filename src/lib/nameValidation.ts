// Name normalization and plantilla-vs-masterfile comparison engine.

export type ValidationStatus =
  | 'MATCHED'
  | 'NAME_MISMATCH'
  | 'MISSING_IN_MASTERFILE'
  | 'MISSING_IN_PLANTILLA'
  | 'POSSIBLE_VARIATION';

const SUFFIXES = ['JR', 'SR', 'II', 'III', 'IV', 'V'];

/**
 * Normalize a name for comparison only.
 *  - uppercase
 *  - trim + collapse spaces
 *  - strip periods, commas, hyphens
 *  - drop suffixes (JR, SR, II, III, IV)
 *  - convert Ñ → N
 */
export function normalizeName(raw: string): string {
  if (!raw) return '';
  let s = raw.toUpperCase().trim();
  s = s.replace(/[.,\-]/g, ' ');
  s = s.replace(/\u00D1/g, 'N'); // Ñ → N
  s = s.replace(/\s+/g, ' ').trim();
  // Remove trailing suffix tokens
  const tokens = s.split(' ').filter(Boolean);
  const cleaned = tokens.filter(t => !SUFFIXES.includes(t));
  return cleaned.join(' ');
}

export interface ParsedName {
  first: string;
  middle: string;
  last: string;
}

// ── Filipino surname / middle-name vocabulary ──────────────────────────────
// Compound surnames are multi-word and must stay together when splitting.
// Middle-name markers are particles that, when present, indicate the words
// from that particle onward form the mother's maiden name (used as middle name
// in Philippine naming convention).
const COMPOUND_SURNAMES = new Set([
  'DELA CRUZ', 'DELA ROSA', 'DEL ROSARIO', 'DE LA CRUZ', 'DE LA ROSA',
  'DE LOS SANTOS', 'DELOS SANTOS', 'DE LOS REYES', 'DELOS REYES',
  'DE JESUS', 'DE DIOS', 'DE GUZMAN', 'DE LEON', 'DE CASTRO',
  'DE VERA', 'DE ASIS', 'DE OCAMPO', 'DEL PILAR', 'DEL ROSARIO',
  'VILLANUEVA', 'SANTOS', 'GONZALES', 'GONZALEZ',
]);

const MIDDLE_NAME_MARKERS = new Set([
  'DELA', 'DE LA', 'DEL', 'DE', 'DELOS', 'DE LOS', 'DE LAS', 'DELAS',
  'LABRADOR', 'MACARAEG', 'MACAPAGAL', 'PAGDANGANAN',
]);

/**
 * Given the tokens *after* the comma in "LAST, FIRST MIDDLE", split them into
 * first name and middle name. The middle name is usually the mother's maiden
 * surname and is detected via compound-surname / particle markers.
 */
function splitFirstMiddle(tokens: string[]): { first: string; middle: string } {
  if (tokens.length === 0) return { first: '', middle: '' };
  if (tokens.length === 1) return { first: tokens[0], middle: '' };

  const upper = tokens.map(t => t.toUpperCase());

  // Scan for the first position where a middle-name marker or known compound
  // surname begins. Everything from there to the end is the middle name.
  let splitAt = -1;
  for (let i = 1; i < tokens.length; i++) {
    const rest = upper.slice(i).join(' ');

    // Compound surname match (e.g. "DELA CRUZ", "DE LOS SANTOS")
    for (const cs of COMPOUND_SURNAMES) {
      if (rest === cs || rest.startsWith(cs + ' ')) {
        splitAt = i;
        break;
      }
    }
    if (splitAt >= 0) break;

    // Single-particle marker (DE, DELA, DEL, etc.)
    if (MIDDLE_NAME_MARKERS.has(upper[i])) {
      splitAt = i;
      break;
    }
  }

  if (splitAt > 0) {
    return {
      first: tokens.slice(0, splitAt).join(' '),
      middle: tokens.slice(splitAt).join(' '),
    };
  }

  // Fallback: the last token is the middle-name (mother's maiden surname).
  // This handles single-word middle names like "Santos, Mary Jane Cruz".
  return {
    first: tokens.slice(0, -1).join(' '),
    middle: tokens[tokens.length - 1],
  };
}

/**
 * Parse a "LAST, FIRST MIDDLE" string (plantilla / PSIPOP employee_name format)
 * or a plain "FIRST MIDDLE LAST" string into components.
 *
 * Philippine naming convention: FIRST [SECOND...] [MIDDLE/mother's maiden] LAST
 * The comma format from PSIPOP is "SURNAME, GIVEN NAMES MIDDLE/MOTHER'S MAIDEN".
 */
export function parseName(displayName: string): ParsedName {
  const empty: ParsedName = { first: '', middle: '', last: '' };
  if (!displayName) return empty;
  const raw = displayName.trim();
  const commaIdx = raw.indexOf(',');

  if (commaIdx >= 0) {
    const last = raw.slice(0, commaIdx).trim();
    const rest = raw.slice(commaIdx + 1).trim();
    const parts = rest.split(/\s+/).filter(Boolean);
    const { first, middle } = splitFirstMiddle(parts);
    return {
      first: normalizeName(first),
      middle: normalizeName(middle),
      last: normalizeName(last),
    };
  }

  // No comma: "FIRST [MIDDLE...] LAST"
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return empty;
  if (parts.length === 1) return { first: normalizeName(parts[0]), middle: '', last: '' };
  if (parts.length === 2) return { first: normalizeName(parts[0]), middle: '', last: normalizeName(parts[1]) };

  // Try to detect a compound surname at the end (e.g. "Mary Jane Dela Cruz")
  const upper = parts.map(p => p.toUpperCase());
  const lastTwo = upper.slice(-2).join(' ');
  const lastThree = upper.slice(-3).join(' ');
  if (COMPOUND_SURNAMES.has(lastThree)) {
    return {
      first: normalizeName(parts.slice(0, -3).join(' ') || parts[0]),
      middle: '',
      last: normalizeName(lastThree),
    };
  }
  if (COMPOUND_SURNAMES.has(lastTwo)) {
    return {
      first: normalizeName(parts.slice(0, -2).join(' ')),
      middle: '',
      last: normalizeName(lastTwo),
    };
  }

  const first = parts.slice(0, -1).join(' ');
  const last = parts[parts.length - 1];
  return { first: normalizeName(first), middle: '', last: normalizeName(last) };
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1, 0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Similarity ratio between two first names (0–1).
 * Uses Levenshtein distance relative to the longer name, plus a bonus
 * if one name starts with the other (handles nicknames / shortened forms
 * like "Maria" vs "Maria Cristina").
 */
function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  let ratio = 1 - dist / maxLen;
  // Prefix bonus: "Maria" vs "Maria Cristina" should score high
  if (a.startsWith(b) || b.startsWith(a)) {
    ratio = Math.max(ratio, 0.85);
  }
  // Single-character initial match: "M" vs "Maria"
  if ((a.length === 1 || b.length === 1) && a[0] === b[0]) {
    ratio = Math.max(ratio, 0.65);
  }
  return ratio;
}

export interface PlantillaRecord {
  id: string;
  employee_name: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  item_number?: string;
  position_title?: string;
  salary_grade?: number;
}

export interface MasterfileRecord {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  employee_id?: string;
  station?: string;
  position?: string;
}

export interface ComparisonResult {
  id: string;
  status: ValidationStatus;
  plantilla: PlantillaRecord | null;
  masterfile: MasterfileRecord | null;
  plantillaName: string;
  masterfileName: string;
  plantillaPosition: string;
  employeeId: string;
  remarks: string;
  suggestedCorrection: string;
}

/**
 * Compare plantilla records against masterfile records.
 * Returns one result row per plantilla record (matched or not), plus one row
 * per masterfile record with no plantilla counterpart.
 */
export function compareRecords(
  plantilla: PlantillaRecord[],
  masterfile: MasterfileRecord[],
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  // Index masterfile by normalized full-name key and by last name
  const mfByName = new Map<string, MasterfileRecord[]>();
  const mfByLastFirst = new Map<string, MasterfileRecord[]>();
  const mfByLast = new Map<string, MasterfileRecord[]>();
  for (const m of masterfile) {
    const full = normalizeName(`${m.first_name} ${m.middle_name ?? ''} ${m.last_name}`.trim());
    if (full) {
      const arr = mfByName.get(full) ?? [];
      arr.push(m);
      mfByName.set(full, arr);
    }
    const lastFirst = `${normalizeName(m.last_name)}|${normalizeName(m.first_name)}`;
    const arr2 = mfByLastFirst.get(lastFirst) ?? [];
    arr2.push(m);
    mfByLastFirst.set(lastFirst, arr2);

    const lastKey = normalizeName(m.last_name);
    if (lastKey) {
      const arr3 = mfByLast.get(lastKey) ?? [];
      arr3.push(m);
      mfByLast.set(lastKey, arr3);
    }
  }

  const matchedMfIds = new Set<string>();

  // Minimum similarity ratio (0–1) for first names to be considered the same person
  const FIRST_NAME_SIMILARITY_THRESHOLD = 0.6;

  for (const p of plantilla) {
    const pParsed = parseName(p.employee_name || `${p.last_name ?? ''}, ${p.first_name ?? ''} ${p.middle_name ?? ''}`);
    const pFull = [pParsed.first, pParsed.middle, pParsed.last].filter(Boolean).join(' ');
    const pNorm = normalizeName(pFull);

    // 1. Exact full-name match
    const exact = mfByName.get(pNorm);
    if (exact && exact.length > 0) {
      const m = exact[0];
      matchedMfIds.add(m.id);
      results.push(buildResult('MATCHED', p, m, pParsed, parseName(`${m.first_name} ${m.middle_name ?? ''} ${m.last_name}`)));
      continue;
    }

    // 2. Same last + first name — check middle name
    const lastFirstKey = `${pParsed.last}|${pParsed.first}`;
    const candidates = mfByLastFirst.get(lastFirstKey) ?? [];
    if (candidates.length > 0) {
      const m = candidates[0];
      matchedMfIds.add(m.id);
      const mParsed = parseName(`${m.first_name} ${m.middle_name ?? ''} ${m.last_name}`);
      if (normalizeName(mParsed.middle) !== normalizeName(pParsed.middle)) {
        results.push(buildResult('POSSIBLE_VARIATION', p, m, pParsed, mParsed));
      } else {
        results.push(buildResult('MATCHED', p, m, pParsed, mParsed));
      }
      continue;
    }

    // 3. Same surname — evaluate first-name similarity across ALL same-surname records
    //    Only pair them if the first names are similar enough to be the same person.
    const sameSurname = mfByLast.get(pParsed.last) ?? [];
    let bestMatch: { m: MasterfileRecord; sim: number; mParsed: ParsedName } | null = null;

    for (const m of sameSurname) {
      if (matchedMfIds.has(m.id)) continue;
      const mFirst = normalizeName(m.first_name);
      const sim = nameSimilarity(pParsed.first, mFirst);
      if (sim < FIRST_NAME_SIMILARITY_THRESHOLD) continue;
      if (!bestMatch || sim > bestMatch.sim) {
        bestMatch = { m, sim, mParsed: parseName(`${m.first_name} ${m.middle_name ?? ''} ${m.last_name}`) };
      }
    }

    if (bestMatch) {
      matchedMfIds.add(bestMatch.m.id);
      // Same surname + similar first name but not identical → name mismatch
      results.push(buildResult('NAME_MISMATCH', p, bestMatch.m, pParsed, bestMatch.mParsed));
      continue;
    }

    // 4. Same surname but first names are NOT similar — different person, do not pair
    //    Treat as missing in masterfile.
    results.push(buildResult('MISSING_IN_MASTERFILE', p, null, pParsed, { first: '', middle: '', last: '' }));
  }

  // Masterfile records with no plantilla counterpart
  for (const m of masterfile) {
    if (matchedMfIds.has(m.id)) continue;
    const mParsed = parseName(`${m.first_name} ${m.middle_name ?? ''} ${m.last_name}`);
    results.push(buildResult('MISSING_IN_PLANTILLA', null, m, { first: '', middle: '', last: '' }, mParsed));
  }

  return results;
}

function buildResult(
  status: ValidationStatus,
  p: PlantillaRecord | null,
  m: MasterfileRecord | null,
  pParsed: ParsedName,
  mParsed: ParsedName,
): ComparisonResult {
  const plantillaName = p ? (p.employee_name || [pParsed.last, pParsed.first, pParsed.middle].filter(Boolean).join(', ')) : '-';
  const masterfileName = m ? [mParsed.first, mParsed.middle, mParsed.last].filter(Boolean).join(' ') : '-';
  const plantillaPosition = p?.position_title ?? '';
  const employeeId = m?.employee_id ?? (p?.id ?? '-');

  let remarks = '';
  switch (status) {
    case 'MATCHED': remarks = 'Names match'; break;
    case 'NAME_MISMATCH': remarks = 'Verify correct name spelling'; break;
    case 'MISSING_IN_MASTERFILE': remarks = 'Add employee to Masterfile'; break;
    case 'MISSING_IN_PLANTILLA': remarks = 'Verify plantilla assignment'; break;
    case 'POSSIBLE_VARIATION': remarks = 'Possible name variation — verify middle name'; break;
  }

  // Suggested correction: prefer the longer/more-complete name
  let suggestedCorrection = '';
  if (status === 'NAME_MISMATCH' || status === 'POSSIBLE_VARIATION') {
    const pFull = [pParsed.first, pParsed.middle, pParsed.last].filter(Boolean).join(' ');
    const mFull = [mParsed.first, mParsed.middle, mParsed.last].filter(Boolean).join(' ');
    suggestedCorrection = pFull.length >= mFull.length ? pFull : mFull;
  }

  return {
    id: `${p?.id ?? 'p'}-${m?.id ?? 'm'}`,
    status,
    plantilla: p,
    masterfile: m,
    plantillaName,
    masterfileName,
    plantillaPosition,
    employeeId,
    remarks,
    suggestedCorrection,
  };
}

export const STATUS_LABELS: Record<ValidationStatus, string> = {
  MATCHED: 'Matched',
  NAME_MISMATCH: 'Name Mismatch',
  MISSING_IN_MASTERFILE: 'Missing in Masterfile',
  MISSING_IN_PLANTILLA: 'Missing in Plantilla',
  POSSIBLE_VARIATION: 'Possible Variation',
};

export const STATUS_COLORS: Record<ValidationStatus, string> = {
  MATCHED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  NAME_MISMATCH: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
  MISSING_IN_MASTERFILE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  MISSING_IN_PLANTILLA: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  POSSIBLE_VARIATION: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800',
};

export interface SummaryStats {
  totalPlantilla: number;
  totalMasterfile: number;
  matched: number;
  nameMismatch: number;
  missingInMasterfile: number;
  missingInPlantilla: number;
  possibleVariations: number;
}

export function summarize(results: ComparisonResult[]): SummaryStats {
  const s: SummaryStats = {
    totalPlantilla: 0, totalMasterfile: 0, matched: 0,
    nameMismatch: 0, missingInMasterfile: 0, missingInPlantilla: 0, possibleVariations: 0,
  };
  for (const r of results) {
    if (r.plantilla) s.totalPlantilla++;
    if (r.masterfile) s.totalMasterfile++;
    switch (r.status) {
      case 'MATCHED': s.matched++; break;
      case 'NAME_MISMATCH': s.nameMismatch++; break;
      case 'MISSING_IN_MASTERFILE': s.missingInMasterfile++; break;
      case 'MISSING_IN_PLANTILLA': s.missingInPlantilla++; break;
      case 'POSSIBLE_VARIATION': s.possibleVariations++; break;
    }
  }
  return s;
}
