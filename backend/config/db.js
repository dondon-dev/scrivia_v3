/**
 * SQLite connection — reuses the EXISTING PocketBase database file.
 *
 * The database (app.db) is a copy of pocketbase_bin/pb_data/data.db and already
 * contains every table and row. We open it read/write but NEVER create, alter,
 * drop or migrate schema here.
 */
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'app.db');

const db = new Database(DB_PATH);

// WAL keeps concurrent readers fast and matches the engine PocketBase used.
db.pragma('journal_mode = WAL');
// PocketBase manages referential integrity in application code; keep SQLite's
// FK enforcement off so deletes/updates behave exactly as they did before.
db.pragma('foreign_keys = OFF');
db.pragma('busy_timeout = 5000');

module.exports = { db, DB_PATH };
