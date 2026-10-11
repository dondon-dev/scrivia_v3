/**
 * Generic collection service — the SQLite-backed equivalent of PocketBase's
 * record CRUD. All tables are pre-existing; this layer only reads/writes rows.
 *
 * Contract:
 *   - Unknown columns in payloads are dropped (the old API rejected them, but
 *     being lenient keeps client migrations frictionless).
 *   - `profiles` / `users` passwords are bcrypt-hashed on write.
 *   - JSON-looking TEXT values are decoded back to arrays/objects on read.
 *   - `created`/`updated` and `created_at`/`updated_at` are kept in sync so the
 *     frontend's timestamp aliasing continues to work.
 */
const { db } = require('../config/db');
const { getTable } = require('../config/schema');
const { compileFilter, compileSort, resolveColumn } = require('../lib/filter');
const { newId, nowIso } = require('../lib/ids');
const crypto = require('crypto');
const { badRequest, notFound } = require('../lib/http');

const AUTH_TABLES = new Set(['profiles', 'users']);

const RESERVED_KEYS = new Set([
  'expand', 'collectionId', 'collectionName', 'passwordConfirm', '@collectionId', '@collectionName',
]);

/**
 * Tables keyed by `employees.id`.
 *
 * SQLite foreign keys are deliberately OFF here (PocketBase enforced integrity
 * in application code) and the tables declare no FKs either, so deleting an
 * employee left every row pointing at it behind — the screens then rendered
 * those rows as "Unknown" with a blank REG/DIV/EMPNO. Deleting an employee now
 * removes these rows in the same transaction, which also covers the paths that
 * clear the master file (`employees` deleted by stacode) or use delete-all.
 */
const EMPLOYEE_DEPENDENTS = ['deductions', 'payroll_entries', 'payroll_deductions', 'undeducted_obligations'];

/** Delete every dependent row referencing any of the given employee ids. */
function deleteDependentRowsForEmployees(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return;
  for (const tableName of EMPLOYEE_DEPENDENTS) {
    const table = getTable(tableName);
    if (!table || !table.columns.has('employee_id')) continue;
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      const placeholders = chunk.map(() => '?').join(', ');
      db.prepare(`DELETE FROM ${quoteIdent(tableName)} WHERE ${quoteIdent('employee_id')} IN (${placeholders})`).run(
        ...chunk,
      );
    }
  }
}

let bcrypt = null;
function getBcrypt() {
  if (bcrypt) return bcrypt;
  try {
    // eslint-disable-next-line global-require
    bcrypt = require('bcrypt');
  } catch (e) {
    throw new Error('bcrypt module is required for password hashing but could not be loaded');
  }
  return bcrypt;
}

function isBcryptHash(v) {
  return typeof v === 'string' && /^\$2[aby]\$\d\d\$/.test(v);
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/** Decode JSON-looking text values returned by SQLite. */
function decodeValue(v) {
  if (typeof v !== 'string' || v.length < 2) return v;
  const c = v[0];
  if (c !== '[' && c !== '{') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function normalizeRow(tableName, row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = decodeValue(v);
  // Never expose credential material over the generic REST layer. Auth flows
  // read the raw row directly via auth.service.findAuthRecord instead.
  if (AUTH_TABLES.has(tableName)) {
    delete out.password;
    delete out.tokenKey;
    // PocketBase returns these flags as booleans; several frontend checks use
    // `=== true` (e.g. profiles.verified), so match that instead of raw 0/1.
    if ('verified' in out) out.verified = out.verified === true || out.verified === 1 || out.verified === '1';
    if ('email_verified' in out) out.email_verified = out.email_verified === true || out.email_verified === 1 || out.email_verified === '1';
    if ('mfa_enabled' in out) out.mfa_enabled = out.mfa_enabled === true || out.mfa_enabled === 1 || out.mfa_enabled === '1';
    if ('emailVisibility' in out) out.emailVisibility = out.emailVisibility === true || out.emailVisibility === 1 || out.emailVisibility === '1';
  }
  // Timestamp aliasing (both directions) mirrors the old adapter's tsColumn.
  if (row.created !== undefined && out.created_at === undefined) out.created_at = row.created;
  if (row.updated !== undefined && out.updated_at === undefined) out.updated_at = row.updated;
  if (row.created_at !== undefined && out.created === undefined) out.created = row.created_at;
  if (row.updated_at !== undefined && out.updated === undefined) out.updated = row.updated_at;
  return out;
}

function encodeValue(v) {
  if (v === undefined) return null;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

/**
 * PocketBase text columns are `NOT NULL DEFAULT ''` (e.g. profiles.locked_until),
 * so writing an explicit `null` violates the constraint. Coerce nulls to the
 * type-appropriate empty value for NOT NULL columns.
 */
function coerceForColumn(table, col, value) {
  if (value !== null) return value;
  const meta = table.colMeta && table.colMeta.get(col);
  if (!meta || !meta.notnull) return value;
  const type = (meta.type || '').toUpperCase();
  return /INT|REAL|NUM|DEC|FLOA|DOUB/.test(type) ? 0 : '';
}

/** Whitelist + prepare a payload for a table. */
function preparePayload(tableName, input, { isInsert }) {
  const table = getTable(tableName);
  if (!table) throw badRequest(`Unknown collection: ${tableName}`);
  const data = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (k === 'id' && !isInsert) continue;
    if (RESERVED_KEYS.has(k)) continue;
    if (!table.columns.has(k)) {
      // tolerate camelCase -> snake-ish aliases the frontend uses.
      continue;
    }
    data[k] = coerceForColumn(table, k, encodeValue(v));
  }

  if (AUTH_TABLES.has(tableName) && isInsert) {
    // Auth collections carry NOT NULL columns (tokenKey, username) whose DB
    // defaults are NULL, so PocketBase fills them on create and so must we.
    if (table.columns.has('tokenKey') && !data.tokenKey) {
      data.tokenKey = randomTokenKey();
    }
    if (table.columns.has('username') && !data.username) {
      data.username = genUsername(tableName);
    }
  }

  if (AUTH_TABLES.has(tableName) && typeof data.password === 'string' && data.password && !isBcryptHash(data.password)) {
    data.password = getBcrypt().hashSync(data.password, 10);
  }
  return data;
}

function randomTokenKey() {
  return crypto.randomBytes(45).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 60);
}

function genUsername(tableName) {
  return `${tableName}${Math.floor(1000 + Math.random() * 90000)}`;
}

function selectRows(tableName, opts = {}) {
  const table = getTable(tableName);
  if (!table) throw badRequest(`Unknown collection: ${tableName}`);

  const { sql: whereSql, params } = compileFilter(tableName, opts.filter);
  const orderSql = compileSort(tableName, opts.sort);

  let colsSql = '*';
  if (Array.isArray(opts.fields) && opts.fields.length > 0) {
    const ids = new Set(['id']);
    for (const f of opts.fields) {
      if (f === '*') {
        ids.clear();
        break;
      }
      const c = resolveColumn(table, f);
      if (c) ids.add(c);
    }
    colsSql = ids.size ? [...ids].map(quoteIdent).join(', ') : '*';
  }

  let sql = `SELECT ${colsSql} FROM ${quoteIdent(tableName)} WHERE ${whereSql}`;
  if (orderSql) sql += ` ${orderSql}`;
  if (opts.limit != null && opts.limit > 0) sql += ` LIMIT ${Number(opts.limit)}`;
  else if (opts.limit === 0) sql += ' LIMIT -1';
  if (opts.offset) sql += ` OFFSET ${Number(opts.offset)}`;

  const rows = db.prepare(sql).all(...params);
  return rows.map((r) => normalizeRow(tableName, r));
}

function countRows(tableName, filter) {
  const { sql: whereSql, params } = compileFilter(tableName, filter);
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(tableName)} WHERE ${whereSql}`)
    .get(...params);
  return row ? row.c : 0;
}

function getById(tableName, id) {
  const table = getTable(tableName);
  if (!table) throw badRequest(`Unknown collection: ${tableName}`);
  const pk = table.pk || 'id';
  const row = db
    .prepare(`SELECT * FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(pk)} = ?`)
    .get(id);
  return row ? normalizeRow(tableName, row) : null;
}

function insertOne(tableName, input) {
  const table = getTable(tableName);
  if (!table) throw badRequest(`Unknown collection: ${tableName}`);

  const data = preparePayload(tableName, input, { isInsert: true });
  const id = (input && typeof input.id === 'string' && input.id) ? input.id : newId();
  data[table.pk || 'id'] = id;

  const ts = nowIso();
  if (table.columns.has('created') && !data.created) data.created = ts;
  if (table.columns.has('updated') && !data.updated) data.updated = ts;
  if (table.columns.has('created_at') && !data.created_at) data.created_at = ts;
  if (table.columns.has('updated_at') && !data.updated_at) data.updated_at = ts;

  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${quoteIdent(tableName)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders})`;
  db.prepare(sql).run(...cols.map((c) => data[c]));
  return getById(tableName, id);
}

function updateById(tableName, id, input) {
  const table = getTable(tableName);
  if (!table) throw badRequest(`Unknown collection: ${tableName}`);
  const pk = table.pk || 'id';

  const existing = db.prepare(`SELECT ${quoteIdent(pk)} AS id FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(pk)} = ?`).get(id);
  if (!existing) throw notFound(`Record ${id} not found in ${tableName}`);

  const data = preparePayload(tableName, input, { isInsert: false });
  const ts = nowIso();
  if (table.columns.has('updated')) data.updated = ts;
  if (table.columns.has('updated_at')) data.updated_at = ts;

  const cols = Object.keys(data);
  if (cols.length === 0) return getById(tableName, id);
  const setSql = cols.map((c) => `${quoteIdent(c)} = ?`).join(', ');
  db.prepare(`UPDATE ${quoteIdent(tableName)} SET ${setSql} WHERE ${quoteIdent(pk)} = ?`).run(
    ...cols.map((c) => data[c]),
    id,
  );
  return getById(tableName, id);
}

function updateByFilter(tableName, filter, input) {
  const table = getTable(tableName);
  if (!table) throw badRequest(`Unknown collection: ${tableName}`);
  const pk = table.pk || 'id';

  const { sql: whereSql, params } = compileFilter(tableName, filter);
  const ids = db.prepare(`SELECT ${quoteIdent(pk)} AS id FROM ${quoteIdent(tableName)} WHERE ${whereSql}`).all(...params);
  const results = [];
  const tx = db.transaction(() => {
    for (const { id } of ids) results.push(updateById(tableName, id, input));
  });
  tx();
  return results;
}

function upsertOne(tableName, input) {
  if (input && typeof input.id === 'string' && input.id) {
    const found = getById(tableName, input.id);
    if (found) return updateById(tableName, input.id, input);
    return insertOne(tableName, input);
  }
  return insertOne(tableName, input);
}

function deleteById(tableName, id) {
  const table = getTable(tableName);
  if (!table) throw badRequest(`Unknown collection: ${tableName}`);
  const pk = table.pk || 'id';
  const run = db.transaction(() => {
    if (tableName === 'employees') deleteDependentRowsForEmployees([id]);
    const res = db.prepare(`DELETE FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(pk)} = ?`).run(id);
    return res.changes;
  });
  return run();
}

function deleteByFilter(tableName, filter) {
  const table = getTable(tableName);
  if (!table) throw badRequest(`Unknown collection: ${tableName}`);
  const pk = table.pk || 'id';
  const { sql: whereSql, params } = compileFilter(tableName, filter);
  const run = db.transaction(() => {
    if (tableName === 'employees') {
      const ids = db
        .prepare(`SELECT ${quoteIdent(pk)} AS id FROM ${quoteIdent(tableName)} WHERE ${whereSql}`)
        .all(...params)
        .map((r) => r.id);
      deleteDependentRowsForEmployees(ids);
    }
    const res = db.prepare(`DELETE FROM ${quoteIdent(tableName)} WHERE ${whereSql}`).run(...params);
    return res.changes;
  });
  return run();
}

/**
 * Repair pass: delete rows in the employee-keyed tables whose employee_id no
 * longer exists. This is the one-off cleanup for rows orphaned before the
 * cascade above existed (a master-file re-import replaced every employee id
 * while the forwarded rows kept the old ones). Returns per-table counts.
 */
function purgeOrphanedEmployeeRows() {
  const deleted = {};
  const run = db.transaction(() => {
    for (const tableName of EMPLOYEE_DEPENDENTS) {
      const table = getTable(tableName);
      if (!table || !table.columns.has('employee_id')) continue;
      const res = db
        .prepare(
          `DELETE FROM ${quoteIdent(tableName)}
            WHERE COALESCE(${quoteIdent('employee_id')}, '') <> ''
              AND NOT EXISTS (
                SELECT 1 FROM ${quoteIdent('employees')} e
                 WHERE e.id = ${quoteIdent(tableName)}.${quoteIdent('employee_id')}
              )`,
        )
        .run();
      deleted[tableName] = res.changes;
    }
  });
  run();
  return deleted;
}

module.exports = {
  selectRows,
  countRows,
  getById,
  insertOne,
  updateById,
  updateByFilter,
  upsertOne,
  deleteById,
  deleteByFilter,
  purgeOrphanedEmployeeRows,
  EMPLOYEE_DEPENDENTS,
  normalizeRow,
  quoteIdent,
  isBcryptHash,
  coerceForColumn,
};
