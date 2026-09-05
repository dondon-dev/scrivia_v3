// DBF (dBASE III) file encoder — produces .dbf binary files openable in Microsoft Excel
// and readable by Visual FoxPro / dBASE / FoxPro legacy applications.
// Supports the field types needed for payroll reports: Character (C), Numeric (N), Date (D), Logical (L).
// Character fields are encoded as Windows-1252 (ANSI) for legacy compatibility.
// Header uses dBASE III version byte (0x03) so Microsoft Excel's DBF import reads the
// file natively; FoxPro remains backward-compatible with dBASE III structures.

type DbfFieldType = 'C' | 'N' | 'D' | 'L';

interface DbfField {
  name: string;          // max 10 chars, uppercase, no special chars
  type: DbfFieldType;
  length: number;        // field width
  decimals: number;      // decimal places (for numeric)
}

interface DbfRecord {
  [key: string]: string | number | boolean | null;
}

// Windows-1252 (ANSI) character mapping — single-byte encoding compatible with Visual FoxPro.
// Maps Unicode code points above U+007F to their Windows-1252 byte equivalents.
const CP1252_MAP: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9f, 0x00a0: 0xa0, 0x00a1: 0xa1, 0x00a2: 0xa2, 0x00a3: 0xa3,
  0x00a4: 0xa4, 0x00a5: 0xa5, 0x00a6: 0xa6, 0x00a7: 0xa7, 0x00a8: 0xa8, 0x00a9: 0xa9,
  0x00aa: 0xaa, 0x00ab: 0xab, 0x00ac: 0xac, 0x00ad: 0xad, 0x00ae: 0xae, 0x00af: 0xaf,
  0x00b0: 0xb0, 0x00b1: 0xb1, 0x00b2: 0xb2, 0x00b3: 0xb3, 0x00b4: 0xb4, 0x00b5: 0xb5,
  0x00b6: 0xb6, 0x00b7: 0xb7, 0x00b8: 0xb8, 0x00b9: 0xb9, 0x00ba: 0xba, 0x00bb: 0xbb,
  0x00bc: 0xbc, 0x00bd: 0xbd, 0x00be: 0xbe, 0x00bf: 0xbf, 0x00c0: 0xc0, 0x00c1: 0xc1,
  0x00c2: 0xc2, 0x00c3: 0xc3, 0x00c4: 0xc4, 0x00c5: 0xc5, 0x00c6: 0xc6, 0x00c7: 0xc7,
  0x00c8: 0xc8, 0x00c9: 0xc9, 0x00ca: 0xca, 0x00cb: 0xcb, 0x00cc: 0xcc, 0x00cd: 0xcd,
  0x00ce: 0xce, 0x00cf: 0xcf, 0x00d0: 0xd0, 0x00d1: 0xd1, 0x00d2: 0xd2, 0x00d3: 0xd3,
  0x00d4: 0xd4, 0x00d5: 0xd5, 0x00d6: 0xd6, 0x00d7: 0xd7, 0x00d8: 0xd8, 0x00d9: 0xd9,
  0x00da: 0xda, 0x00db: 0xdb, 0x00dc: 0xdc, 0x00dd: 0xdd, 0x00de: 0xde, 0x00df: 0xdf,
  0x00e0: 0xe0, 0x00e1: 0xe1, 0x00e2: 0xe2, 0x00e3: 0xe3, 0x00e4: 0xe4, 0x00e5: 0xe5,
  0x00e6: 0xe6, 0x00e7: 0xe7, 0x00e8: 0xe8, 0x00e9: 0xe9, 0x00ea: 0xea, 0x00eb: 0xeb,
  0x00ec: 0xec, 0x00ed: 0xed, 0x00ee: 0xee, 0x00ef: 0xef, 0x00f0: 0xf0, 0x00f1: 0xf1,
  0x00f2: 0xf2, 0x00f3: 0xf3, 0x00f4: 0xf4, 0x00f5: 0xf5, 0x00f6: 0xf6, 0x00f7: 0xf7,
  0x00f8: 0xf8, 0x00f9: 0xf9, 0x00fa: 0xfa, 0x00fb: 0xfb, 0x00fc: 0xfc, 0x00fd: 0xfd,
  0x00fe: 0xfe, 0x00ff: 0xff,
};

// Encode a string into a single-byte Windows-1252 (ANSI) byte array.
function encodeAnsi(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (CP1252_MAP[code] !== undefined) {
      bytes.push(CP1252_MAP[code]);
    } else {
      bytes.push(0x3f); // '?' for unmappable characters
    }
  }
  return new Uint8Array(bytes);
}

// Encode a string into a fixed-width buffer, right-truncated / right-padded with spaces.
// Uses Windows-1252 (ANSI) encoding so each character is exactly one byte —
// field lengths match FoxPro expectations exactly.
function padField(value: string, length: number): Uint8Array {
  const buf = new Uint8Array(length);
  const str = value ?? '';
  const encoded = encodeAnsi(str);
  const copyLen = Math.min(encoded.length, length);
  buf.set(encoded.subarray(0, copyLen));
  for (let i = copyLen; i < length; i++) {
    buf[i] = 0x20; // space pad
  }
  return buf;
}

// Encode a numeric value as a right-aligned ASCII string with leading spaces.
function padNumeric(value: number, length: number, decimals: number): Uint8Array {
  const buf = new Uint8Array(length);
  let str: string;
  if (value === null || value === undefined || Number.isNaN(value)) {
    str = ''.padStart(length);
  } else if (decimals > 0) {
    str = value.toFixed(decimals);
  } else {
    str = Math.round(value).toString();
  }
  if (str.length > length) str = str.slice(-length); // truncate from left (keep least-significant)
  // right-align
  const start = length - str.length;
  for (let i = 0; i < start; i++) buf[i] = 0x20;
  for (let i = 0; i < str.length; i++) buf[start + i] = str.charCodeAt(i);
  return buf;
}

function padDate(value: string | null): Uint8Array {
  const buf = new Uint8Array(8);
  let str = '        ';
  if (value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      str = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  for (let i = 0; i < 8; i++) buf[i] = str.charCodeAt(i);
  return buf;
}

function padLogical(value: boolean | null): Uint8Array {
  const buf = new Uint8Array(1);
  buf[0] = value === null ? 0x3f : value ? 0x54 : 0x46; // '?', 'T', 'F'
  return buf;
}

// Decode a Windows-1252 (ANSI) byte array back into a JavaScript string.
function decodeAnsi(bytes: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte <= 0x7f) {
      chars.push(String.fromCharCode(byte));
    } else {
      const code = ANSI_TO_UNICODE[byte];
      chars.push(String.fromCharCode(code ?? 0x3f));
    }
  }
  return chars.join('');
}

// Reverse map: Windows-1252 byte → Unicode code point.
// Built from CP1252_MAP at module load time.
const ANSI_TO_UNICODE: Record<number, number> = {};
for (const [unicode, ansi] of Object.entries(CP1252_MAP)) {
  ANSI_TO_UNICODE[ansi as number] = parseInt(unicode, 10);
}
// Fill the identity range 0xA0-0xFF (already identical in both encodings).
for (let b = 0xa0; b <= 0xff; b++) {
  if (ANSI_TO_UNICODE[b] === undefined) ANSI_TO_UNICODE[b] = b;
}

// Write a 32-bit little-endian integer into a DataView at the given offset.
function writeUint32LE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function writeUint16LE(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

/**
 * Encode records into a dBASE III DBF file openable in Microsoft Excel.
 * Version byte 0x03 (dBASE III), field descriptors with proper layout,
 * Windows-1252 code page marker at byte 29, and 0x1A EOF terminator.
 * FoxPro/dBASE legacy apps remain backward-compatible with dBASE III structures.
 * Returns a Uint8Array ready to be downloaded as a .dbf file.
 */
export function encodeDbf(fields: DbfField[], records: DbfRecord[]): Uint8Array {
  const headerSize = 32 + fields.length * 32 + 1; // header + field descriptors + terminator
  const recordSize = 1 + fields.reduce((sum, f) => sum + f.length, 0); // deletion flag + field bytes
  const recordCount = records.length;

  // Header (32 bytes) — dBASE III format (Excel-compatible)
  const header = new Uint8Array(headerSize);
  const headerView = new DataView(header.buffer);
  const now = new Date();
  header[0] = 0x03; // dBASE III table (no memo) — Excel imports this version
  header[1] = now.getFullYear() - 1900;
  header[2] = now.getMonth() + 1;
  header[3] = now.getDate();
  writeUint32LE(headerView, 4, recordCount);
  writeUint16LE(headerView, 8, headerSize);
  writeUint16LE(headerView, 10, recordSize);
  // bytes 12-28 are reserved/zero in dBASE III
  header[29] = 0x03; // code page marker: Windows-1252 (ANSI) — Excel/legacy compatible

  // Field descriptors (32 bytes each) — dBASE III compatible layout
  fields.forEach((field, i) => {
    const offset = 32 + i * 32;
    // Field name: null-terminated, max 10 chars + null (bytes 0-10)
    const nameUpper = field.name.toUpperCase();
    const nameEncoded = encodeAnsi(nameUpper);
    const nameCopyLen = Math.min(nameEncoded.length, 10);
    header.set(nameEncoded.subarray(0, nameCopyLen), offset);
    // remaining bytes up to offset+10 stay 0x00 (null terminator / padding)
    header[offset + 11] = field.type.charCodeAt(0);
    // bytes 12-15: field data address (reserved, leave zero)
    header[offset + 16] = field.length;
    header[offset + 17] = field.decimals;
    // bytes 18-31: reserved in dBASE III (all zero)
  });
  header[headerSize - 1] = 0x0d; // field descriptor terminator

  // Records
  const recordsBuf = new Uint8Array(recordCount * recordSize + 1);
  let cursor = 0;
  for (const record of records) {
    recordsBuf[cursor++] = 0x20; // not deleted
    for (const field of fields) {
      const value = record[field.name];
      let chunk: Uint8Array;
      if (field.type === 'C') {
        chunk = padField(String(value ?? ''), field.length);
      } else if (field.type === 'N') {
        chunk = padNumeric(Number(value ?? 0), field.length, field.decimals);
      } else if (field.type === 'D') {
        chunk = padDate(value as string | null);
      } else if (field.type === 'L') {
        chunk = padLogical(value as boolean | null);
      } else {
        chunk = padField(String(value ?? ''), field.length);
      }
      recordsBuf.set(chunk, cursor);
      cursor += field.length;
    }
  }
  recordsBuf[cursor] = 0x1a; // end-of-file marker

  // Combine header + records
  const result = new Uint8Array(headerSize + recordsBuf.length);
  result.set(header, 0);
  result.set(recordsBuf, headerSize);
  return result;
}

/**
 * Decode a DBF file (FoxPro / dBASE III/5) into field definitions + records.
 * Reads the binary header, field descriptors, and data records.
 */
export function decodeDbf(data: Uint8Array): { fields: DbfField[]; records: DbfRecord[] } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const recordCount = view.getUint32(4, true);
  const headerSize = view.getUint16(8, true);
  const recordSize = view.getUint16(10, true);

  // Parse field descriptors (32 bytes each, starting at offset 32, until 0x0D terminator)
  const fields: DbfField[] = [];
  let offset = 32;
  while (offset < headerSize - 1) {
    if (data[offset] === 0x0d) break;
    const nameBytes = data.subarray(offset, offset + 11);
    let name = '';
    for (let i = 0; i < 11; i++) {
      if (nameBytes[i] === 0x00) break;
      name += String.fromCharCode(nameBytes[i]);
    }
    const typeChar = String.fromCharCode(data[offset + 11]);
    const length = data[offset + 16];
    const decimals = data[offset + 17];
    fields.push({
      name: name.trim(),
      type: (typeChar as DbfFieldType),
      length,
      decimals,
    });
    offset += 32;
  }

  // Parse records
  const records: DbfRecord[] = [];
  let cursor = headerSize;
  for (let r = 0; r < recordCount; r++) {
    if (cursor + recordSize > data.length) break;
    const deleted = data[cursor] === 0x2a; // '*' means deleted
    cursor += 1; // skip deletion flag

    const record: DbfRecord = {};
    for (const field of fields) {
      const raw = data.subarray(cursor, cursor + field.length);
      cursor += field.length;

      if (deleted) continue;

      if (field.type === 'C') {
        // Character: trim trailing spaces, decode as Windows-1252 (ANSI)
        let end = field.length;
        while (end > 0 && (raw[end - 1] === 0x20 || raw[end - 1] === 0x00)) end--;
        record[field.name] = decodeAnsi(raw.subarray(0, end)).trim();
      } else if (field.type === 'N') {
        const str = decodeAnsi(raw).trim();
        if (str === '' || str === '.') {
          record[field.name] = 0;
        } else {
          const num = parseFloat(str);
          record[field.name] = Number.isNaN(num) ? 0 : num;
        }
      } else if (field.type === 'D') {
        // Date: YYYYMMDD as ASCII
        const str = decodeAnsi(raw).trim();
        if (str.length === 8 && /^\d{8}$/.test(str)) {
          record[field.name] = `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
        } else {
          record[field.name] = null;
        }
      } else if (field.type === 'L') {
        const ch = String.fromCharCode(raw[0]);
        record[field.name] = ch === 'T' || ch === 't' || ch === 'Y' || ch === 'y';
      } else {
        // F (float) or other — treat as string
        let end = field.length;
        while (end > 0 && raw[end - 1] === 0x20) end--;
        record[field.name] = decodeAnsi(raw.subarray(0, end)).trim();
      }
    }
    if (!deleted) records.push(record);
  }

  return { fields, records };
}

export type { DbfField, DbfRecord };
