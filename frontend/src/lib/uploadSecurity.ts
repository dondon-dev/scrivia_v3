import { scanFileForThreats } from './threatScan';
import { isUploadBlocked, recordThreatEvent } from './lockdown';

export interface UploadValidationResult {
  valid: boolean;
  error: string | null;
}

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = ['.dbf', '.xlsx', '.csv', '.pdf', '.txt', '.prn', '.dat'];

const MAGIC_BYTES: Record<string, number[]> = {
  dbf: [0x03],
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  pdf: [0x25, 0x50, 0x44, 0x46],
};

export function validateFileExtension(filename: string): UploadValidationResult {
  const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `File type not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}` };
  }
  return { valid: true, error: null };
}

export function validateFileSize(file: File): UploadValidationResult {
  if (file.size > MAX_UPLOAD_SIZE) {
    return { valid: false, error: `File too large. Maximum size is ${MAX_UPLOAD_SIZE / 1024 / 1024}MB.` };
  }
  if (file.size === 0) {
    return { valid: false, error: 'File is empty.' };
  }
  return { valid: true, error: null };
}

export async function validateFileSignature(file: File): Promise<UploadValidationResult> {
  const ext = filenameToExt(file.name);
  const expected = MAGIC_BYTES[ext];
  if (!expected) return { valid: true, error: null };

  const header = await file.slice(0, Math.max(...expected) + 1).arrayBuffer();
  const bytes = new Uint8Array(header);
  for (let i = 0; i < expected.length; i++) {
    if (bytes[i] !== expected[i]) {
      return { valid: false, error: 'File content does not match its extension. The file may be corrupted or misnamed.' };
    }
  }
  return { valid: true, error: null };
}

export function generateSecureFileName(originalName: string): string {
  const ext = originalName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  const random = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
  return `upload_${hex}${ext}`;
}

function filenameToExt(filename: string): string {
  return (filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');
}

export async function validateUpload(file: File): Promise<UploadValidationResult> {
  // Emergency lockdown gate: no uploads while the database is locked.
  const lock = isUploadBlocked();
  if (lock.blocked) return { valid: false, error: lock.reason ?? 'System is locked.' };

  const extCheck = validateFileExtension(file.name);
  if (!extCheck.valid) return extCheck;

  const sizeCheck = validateFileSize(file);
  if (!sizeCheck.valid) return sizeCheck;

  const sigCheck = await validateFileSignature(file);
  if (!sigCheck.valid) return sigCheck;

  // Threat scan: hardcoded script / command / SQL / formula-injection rules.
  const threat = await scanFileForThreats(file);
  if (threat.blocked) {
    void recordThreatEvent(threat.reasons.slice(0, 3).join('; ') + ` (${file.name})`, 'upload');
    return {
      valid: false,
      error: `⚠️ Suspicious file blocked — possible ${threat.reasons.slice(0, 3).join(', ')}. The file will not be uploaded.`,
    };
  }

  return { valid: true, error: null };
}
