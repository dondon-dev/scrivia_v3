/**
 * SQLite connection — reuses the EXISTING PocketBase database file.
 *
 * The database (app.db) is a copy of pocketbase_bin/pb_data/data.db and already
 * contains every table and row. We open it read/write but NEVER create, alter,
 * drop or migrate schema here.
 */
const path = require('path');
const Database = require('better-sqlite3');

/**
 * Resolve where app.db lives, in order of preference:
 *   1. DB_PATH env var (e.g. set in Hostinger hPanel > Node.js env vars).
 *   2. Hostinger layout: each deploy is rewritten to
 *      <domain>/hbuilds/versions/<id>/nodejs, so a DB there would reset to an
 *      empty file on every release. Use the persistent sibling <domain>/data.
 *   3. Local checkout default: backend/app.db.
 */
function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const host = __dirname.replace(/\\/g, '/').match(/^(.*\/domains\/[^/]+)\/hbuilds\/versions\/[^/]+\/nodejs\/config$/);
  if (host) return path.join(host[1], 'data', 'app.db');
  return path.join(__dirname, '..', 'app.db');
}

const DB_PATH = resolveDbPath();

const db = new Database(DB_PATH);

// WAL keeps concurrent readers fast and matches the engine PocketBase used.
db.pragma('journal_mode = WAL');
// PocketBase manages referential integrity in application code; keep SQLite's
// FK enforcement off so deletes/updates behave exactly as they did before.
db.pragma('foreign_keys = OFF');
db.pragma('busy_timeout = 5000');

module.exports = { db, DB_PATH };
