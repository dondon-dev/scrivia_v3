/**
 * Identifier + timestamp helpers that mirror PocketBase's on-disk conventions,
 * so newly inserted rows are indistinguishable from rows created by the old
 * engine (15-char [a-z0-9] ids prefixed with 'r').
 */
const crypto = require('crypto');

/** PocketBase-style id: 'r' + 14 lowercase hex chars = 15 chars. */
function newId() {
  return 'r' + crypto.randomBytes(7).toString('hex');
}

/** ISO-8601 UTC timestamp matching PocketBase's `created`/`updated` format. */
function nowIso() {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1Z');
}

const cryptoRandom = crypto;

module.exports = { newId, nowIso, crypto: cryptoRandom };
