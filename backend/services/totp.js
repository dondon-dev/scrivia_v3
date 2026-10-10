/**
 * totp.js — self-contained TOTP (RFC 6238) core for the PocketBase JS hooks.
 *
 * Why this exists rather than using a helper from the JSVM:
 *
 *  - The v0.23 JSVM `$security` helpers expose MD5, SHA-256, SHA-512 and
 *    HMAC-**SHA-256** (`hs256`) but no SHA-1 and no generic HMAC. TOTP's
 *    default digest is SHA-1, so `hs256` cannot produce standard TOTP codes.
 *  - `$security.sha256(text)` hashes the **UTF-8 encoding** of a JS string, so
 *    feeding it HMAC's binary ipad/opad blocks through `String.fromCharCode`
 *    silently corrupts every byte >= 0x80 (U+00C8 becomes two bytes, not one).
 *
 * So SHA-256, HMAC-SHA256, base32 and HOTP are implemented here over plain
 * byte arrays — no strings as byte containers, no encoding round-trips.
 *
 * The digest is SHA-256, so enrolment URIs carry `algorithm=SHA256`. That is
 * part of RFC 6238 and is supported by Google Authenticator, Microsoft
 * Authenticator, Authy, 1Password, Bitwarden and FreeOTP.
 *
 * This file is plain CommonJS so the *same* code runs in Node (see
 * scripts/test-totp.mjs, which checks it against the RFC 4231 HMAC vectors and
 * the RFC 6238 SHA-256 TOTP vectors) and inside the PocketBase JSVM.
 */

'use strict';

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ── SHA-256 ────────────────────────────────────────────────────────────────

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** SHA-256 of a byte array, returning 32 bytes as an array of ints 0-255. */
function sha256Bytes(msg) {
  const len = msg.length;
  const bitLen = len * 8;
  const padded = ((len + 9 + 63) >> 6) << 6; // smallest multiple of 64 that fits 0x80 + 8-byte length

  const m = new Array(padded);
  for (let i = 0; i < padded; i += 1) m[i] = 0;
  for (let i = 0; i < len; i += 1) m[i] = msg[i] & 0xff;
  m[len] = 0x80;

  // 64-bit big-endian message length. Our inputs are always tiny, so the high
  // word is usually 0, but write it out properly rather than assuming.
  const high = Math.floor(bitLen / 0x100000000);
  const low = bitLen >>> 0;
  m[padded - 8] = (high >>> 24) & 0xff;
  m[padded - 7] = (high >>> 16) & 0xff;
  m[padded - 6] = (high >>> 8) & 0xff;
  m[padded - 5] = high & 0xff;
  m[padded - 4] = (low >>> 24) & 0xff;
  m[padded - 3] = (low >>> 16) & 0xff;
  m[padded - 2] = (low >>> 8) & 0xff;
  m[padded - 1] = low & 0xff;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Array(64);

  for (let off = 0; off < padded; off += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = off + i * 4;
      w[i] = ((m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = [];
  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < words.length; i += 1) {
    const x = words[i];
    out.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
  }
  return out;
}

/** HMAC-SHA256 (RFC 2104), byte array in, byte array out. */
function hmacSha256(key, msg) {
  let k = key.slice();
  if (k.length > 64) k = sha256Bytes(k);
  while (k.length < 64) k.push(0);

  const inner = [];
  const outer = [];
  for (let i = 0; i < 64; i += 1) {
    inner.push(k[i] ^ 0x36);
    outer.push(k[i] ^ 0x5c);
  }
  const innerHash = sha256Bytes(inner.concat(msg));
  return sha256Bytes(outer.concat(innerHash));
}

function toHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const h = bytes[i].toString(16);
    s += h.length === 1 ? '0' + h : h;
  }
  return s;
}

/** UTF-8 encode a string into a byte array (for test vectors and ASCII input). */
function utf8Bytes(str) {
  const out = [];
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    let c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
      i += 1;
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

// ── Base32 (RFC 4648, unpadded) ────────────────────────────────────────────

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | (bytes[i] & 0xff);
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Tolerant base32 decode: ignores case, spaces and any '=' padding. */
function base32Decode(input) {
  const clean = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < clean.length; i += 1) {
    const idx = B32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out;
}

// ── HOTP / TOTP ────────────────────────────────────────────────────────────

function hotp(secretBytes, counter, digits) {
  const msg = [
    0,
    0,
    0,
    0,
    (counter >>> 24) & 0xff,
    (counter >>> 16) & 0xff,
    (counter >>> 8) & 0xff,
    counter & 0xff,
  ];
  const digest = hmacSha256(secretBytes, msg);
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) >>>
    0;
  const code = binary % Math.pow(10, digits);
  let s = String(code);
  while (s.length < digits) s = '0' + s;
  return s;
}

function totpAt(secret, unixSeconds, options) {
  const opts = options || {};
  const step = opts.step || 30;
  const digits = opts.digits || 6;
  const counter = Math.floor(Number(unixSeconds) / step);
  return hotp(base32Decode(secret), counter, digits);
}

/**
 * Verify a submitted code.
 * @returns the matched counter/step, or -1 when the code is wrong. Callers use
 *          the returned step for replay protection (never accept a step that
 *          has already been used).
 */
function verifyTotp(secret, code, unixSeconds, options) {
  const opts = options || {};
  const step = opts.step || 30;
  const digits = opts.digits || 6;
  const window = opts.window === undefined ? 1 : opts.window;

  const submitted = String(code || '').replace(/[\s-]/g, '');
  if (submitted.length !== digits || !/^[0-9]+$/.test(submitted)) return -1;

  const secretBytes = base32Decode(secret);
  if (!secretBytes.length) return -1;

  const counter = Math.floor(Number(unixSeconds) / step);
  for (let i = -window; i <= window; i += 1) {
    const candidate = counter + i;
    if (candidate < 0) continue;
    if (hotp(secretBytes, candidate, digits) === submitted) return candidate;
  }
  return -1;
}

/** Group a secret for manual entry: "ABCDEFGH..." -> "ABCD EFGH ..." */
function formatSecret(secret) {
  return String(secret || '')
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * Build the otpauth:// URI an authenticator app consumes.
 * Algorithm is pinned to SHA256 to match this implementation.
 */
function otpauthUri(accountLabel, secret, issuer, digits, period) {
  const d = digits || 6;
  const p = period || 30;
  const issuerName = issuer || 'SCRIVIA CLOUD';
  const label = encodeURIComponent(issuerName + ':' + accountLabel);
  const params = [
    'secret=' + String(secret).toUpperCase(),
    'issuer=' + encodeURIComponent(issuerName),
    'algorithm=SHA256',
    'digits=' + d,
    'period=' + p,
  ];
  return 'otpauth://totp/' + label + '?' + params.join('&');
}

module.exports = {
  B32_ALPHABET: B32_ALPHABET,
  sha256Bytes: sha256Bytes,
  sha256Hex: function (input) {
    const bytes = typeof input === 'string' ? utf8Bytes(input) : input;
    return toHex(sha256Bytes(bytes));
  },
  hmacSha256: hmacSha256,
  hmacSha256Hex: function (key, message) {
    const k = typeof key === 'string' ? utf8Bytes(key) : key;
    const m = typeof message === 'string' ? utf8Bytes(message) : message;
    return toHex(hmacSha256(k, m));
  },
  toHex: toHex,
  utf8Bytes: utf8Bytes,
  base32Encode: base32Encode,
  base32Decode: base32Decode,
  hotp: hotp,
  totpAt: totpAt,
  verifyTotp: verifyTotp,
  formatSecret: formatSecret,
  otpauthUri: otpauthUri,
};
