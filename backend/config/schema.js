/**
 * Schema introspection.
 *
 * Reads the real table/column layout straight out of app.db (the same schema
 * documented in schema.txt). Nothing is created or modified — this is purely a
 * read of sqlite_master + PRAGMA table_info so the generic REST layer uses the
 * actual columns that already exist.
 */
const { db } = require('./db');

// PocketBase system tables live under an underscore prefix (auth origins, mfa,
// otps, superusers, migrations, ...). They are not application collections and
// are intentionally not exposed over REST.
const SYSTEM_PREFIX = '_';

const tables = new Map();

function loadSchema() {
  tables.clear();
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();

  for (const { name } of rows) {
    if (name.startsWith(SYSTEM_PREFIX)) continue;
    const cols = db.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all();
    const columns = new Set(cols.map((c) => c.name));
    const colMeta = new Map(
      cols.map((c) => [c.name, { type: c.type || '', notnull: !!c.notnull, dflt: c.dflt_value }]),
    );
    const pk = cols.find((c) => c.pk)?.name || 'id';
    tables.set(name, {
      name,
      columns,
      colMeta,
      pk,
      hasColumn: (c) => columns.has(c),
    });
  }
  return tables;
}

loadSchema();

function getTable(name) {
  return tables.get(name) || null;
}

function listCollections() {
  return [...tables.keys()];
}

function isKnownTable(name) {
  return tables.has(name);
}

module.exports = { loadSchema, getTable, listCollections, isKnownTable, tables };
