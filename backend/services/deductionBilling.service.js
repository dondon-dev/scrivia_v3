/**
 * Server-side working set for the deduction-file billing steps — the flat files
 * the legacy keeps on disk between PAYFMEN2 steps 5–7:
 *
 *   • the reformatted billing file   (BILLS / BILLTEXT — PAYDFG1/G2, PAYDFUP2)
 *   • the error file                 (ERRTXT — GDV/GEV/GAV, PAYDFXGE/XGD/XGA)
 *   • the invalid BP number file     (GSINVBPN — PAYDFG2)
 *
 * They live here as ONE JSON document in `system_settings`, keyed per user and
 * pay period:
 *
 *   deduction_billing.<userId>.<periodId>
 *
 * Keeping the working set on the server means the steps survive a reload, follow
 * the operator to another machine, and — because the post reads the saved
 * document rather than rows handed in by the browser — that posting is a single
 * SQL transaction: either every validated row lands or none does.
 */
const { db } = require('../config/db');
const col = require('./collection.service');
const { badRequest } = require('../lib/http');
const { newId, nowIso } = require('../lib/ids');

const TABLE = 'system_settings';
const KEY_PREFIX = 'deduction_billing';
const VERSION = 1;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const str = (v) => (v === null || v === undefined ? '' : String(v));
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const upper = (v) => str(v).trim().toUpperCase();

/** The legacy's two doors: GSIS keys on the BP number, Others on the employee. */
function doorOf(leg) {
  const v = upper(leg);
  if (v === 'GSIS' || v === 'OTHERS') return v;
  throw badRequest(`Unknown billing door "${leg}"`);
}

function sessionKey(userId, periodId) {
  const u = str(userId).trim();
  const p = str(periodId).trim();
  if (!u) throw badRequest('A signed-in user is required to keep the billing working set');
  if (!p) throw badRequest('A pay period is required to keep the billing working set');
  return `${KEY_PREFIX}.${u}.${p}`;
}

function rowForKey(key) {
  const rows = col.selectRows(TABLE, {
    filter: { op: 'and', conditions: [{ col: 'key', op: 'eq', val: key }] },
    limit: 1,
  });
  return rows[0] || null;
}

function parseDocument(row) {
  if (!row || !row.value) return null;
  try {
    const doc = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    if (!doc || typeof doc !== 'object') return null;
    return { ...doc, id: row.id, key: row.key, savedAt: str(row.updated || row.created) };
  } catch {
    // A corrupt document must not break the screen — treat it as "no session".
    return null;
  }
}

/** Read the saved working set for one user + pay period. */
function loadSession(userId, periodId) {
  return parseDocument(rowForKey(sessionKey(userId, periodId)));
}

/**
 * Write the working set. The caller sends the document it wants stored; the
 * server stamps identity (user, period, version) and keeps the row's own id.
 */
function saveSession({ userId, periodId, doc }) {
  if (!doc || typeof doc !== 'object') throw badRequest('A billing session document is required');
  const key = sessionKey(userId, periodId);
  const value = JSON.stringify({
    ...doc,
    version: VERSION,
    userId: str(userId),
    periodId: str(periodId),
  });
  if (value.length > MAX_DOCUMENT_BYTES) {
    throw badRequest('The billing working set is too large to keep on the server');
  }

  const existing = rowForKey(key);
  const payload = { key, value };
  if (existing) return parseDocument(col.updateById(TABLE, existing.id, payload));
  return parseDocument(col.insertOne(TABLE, { id: newId(), ...payload }));
}

/** Drop the working set — the legacy deleting its flat files between runs. */
function clearSession(userId, periodId) {
  const key = sessionKey(userId, periodId);
  const existing = rowForKey(key);
  if (!existing) return false;
  col.deleteById(TABLE, existing.id);
  return true;
}

// ── Validation + post ──────────────────────────────────────────────────────

function hasColumn(table, column) {
  const row = db
    .prepare(`SELECT 1 AS ok FROM pragma_table_info(?) WHERE name = ? LIMIT 1`)
    .get(table, column);
  return !!row;
}

/**
 * Resolve a deduction code for one door.
 *
 * `deduction_codes` holds a few codes twice — 0160 is both "GSIS Policy Loan"
 * and an Others code — and the screen's code map keys on the code alone, so the
 * row it shows is the last one for that code. Reproduce that choice here (same
 * order, last wins) and accept the door when ANY row for the code belongs to it,
 * so the server is never stricter than the screen the operator validated on.
 */
function resolveCode(code) {
  const rows = db
    .prepare('SELECT dedcode, dedname, agency, type FROM deduction_codes WHERE dedcode = ? ORDER BY rowid')
    .all(upper(code));
  if (rows.length === 0) return null;
  const isGsisRow = (r) => /GSIS/i.test(str(r.agency));
  return {
    picked: rows[rows.length - 1],
    hasGsis: rows.some(isGsisRow),
    hasOthers: rows.some((r) => !isGsisRow(r)),
  };
}

function employeeExists(id) {
  return !!db.prepare('SELECT 1 AS ok FROM employees WHERE id = ? LIMIT 1').get(str(id));
}

function deductionRowById(id) {
  return db.prepare('SELECT id, employee_id FROM deductions WHERE id = ? LIMIT 1').get(str(id)) || null;
}

/** The natural key of a line already in the file, per door:
 *  GSIS = EMPNO + DEDCODE (policy is NOT part of the key — a GSIS billing
 *  must never hold two rows for the same employee and code);
 *  Others = EMPNO + DEDCODE + POLICYNO. */
function findExistingEmployeeCode({ employeeId, periodId, code }) {
  return db
    .prepare(
      `SELECT id FROM deductions
        WHERE employee_id = ? AND pay_period_id = ? AND deduction_code = ?
        ORDER BY rowid DESC
        LIMIT 1`,
    )
    .get(str(employeeId), str(periodId), upper(code)) || null;
}

function findExistingLine({ employeeId, periodId, code, policyno }) {
  return db
    .prepare(
      `SELECT id FROM deductions
        WHERE employee_id = ? AND pay_period_id = ? AND deduction_code = ?
          AND policyno = ?
        LIMIT 1`,
    )
    .get(str(employeeId), str(periodId), upper(code), str(policyno)) || null;
}

/**
 * The row an ADD/UPDATE/DELETE actually targets. Prefer the row the screen
 * matched, but fall back to the door's natural key so a re-upload updates the
 * existing line instead of ever creating a second one with the same dedcode
 * (GSIS keys on employee + code, Others on employee + code + policy).
 */
function resolveExisting({ row, leg, periodId, code }) {
  if (row.existingId) {
    const byId = deductionRowById(row.existingId);
    if (byId && str(byId.employee_id) === str(row.employeeId)) return byId;
  }
  if (leg === 'GSIS') {
    return findExistingEmployeeCode({ employeeId: row.employeeId, periodId, code });
  }
  return findExistingLine({
    employeeId: row.employeeId, periodId, code, policyno: row.policyno,
  });
}

/** The insert/update payload, mirroring what the screen posts today. */
function payloadFor({ row, periodId, door, code, info, editor, paydate }) {
  return {
    employee_id: str(row.employeeId),
    pay_period_id: str(periodId),
    deduction_code: upper(code),
    deduction_name: str(info?.dedname ?? code),
    category: str(info?.type ?? 'Other') || 'Other',
    amount: num(row.dedamt),
    source: door === 'GSIS' ? 'GSIS Billing' : 'Billing',
    reference: str(row.policyno),
    stacode: str(row.stacode),
    type: str(info?.type ?? ''),
    agency: str(info?.agency ?? ''),
    policyno: str(row.policyno),
    effyy: str(row.effyy),
    effmm: str(row.effmm),
    teryy: str(row.teryy),
    termm: str(row.termm),
    principal: num(row.principal),
    interest: num(row.interest),
    charges: num(row.charges),
    proceeds: num(row.proceeds),
    gsis_bpn: door === 'GSIS' ? str(row.bpn) : '',
    status: '',
    editor: str(editor),
    paydate: str(paydate),
  };
}

function insertDeduction(data) {
  const values = { id: newId(), ...data };
  if (hasColumn('deductions', 'created') && !values.created) values.created = nowIso();
  if (hasColumn('deductions', 'updated') && !values.updated) values.updated = nowIso();
  if (hasColumn('deductions', 'created_at') && !values.created_at) values.created_at = nowIso();
  if (hasColumn('deductions', 'updated_at') && !values.updated_at) values.updated_at = nowIso();

  const cols = Object.keys(values);
  const sql = `INSERT INTO deductions (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols
    .map(() => '?')
    .join(', ')})`;
  db.prepare(sql).run(...cols.map((c) => values[c]));
  return values.id;
}

function updateDeduction(id, data) {
  const values = { ...data, updated: nowIso(), updated_at: nowIso() };
  const cols = Object.keys(values).filter((c) => hasColumn('deductions', c));
  const sql = `UPDATE deductions SET ${cols.map((c) => `"${c}" = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...cols.map((c) => values[c]), str(id));
}

/**
 * Apply the validated rows of a saved working set in ONE transaction.
 *
 * Invalid rows are IGNORED — they are recorded in `skipped` and left in the
 * document, and every row that does pass validation is still posted. (The old
 * behaviour aborted the whole post on the first bad row, which is not what the
 * operator wants when only a handful of lines are bad.) ERROR rows and invalid
 * BP numbers never reach here — they stay in the document for the Download step.
 */
function postSession({ userId, periodId, editor }) {
  const session = loadSession(userId, periodId);
  if (!session) throw badRequest('Nothing has been uploaded for this pay period yet');

  const leg = doorOf(session.leg);
  const pending = (Array.isArray(session.staged) ? session.staged : []).filter(
    (r) => r && (r.action === 'ADD' || r.action === 'UPDATE' || r.action === 'DELETE'),
  );
  if (pending.length === 0) throw badRequest('There are no validated rows to post');

  const paydate = nowIso().slice(0, 10);
  const applied = [];
  const skipped = [];

  const run = db.transaction(() => {
    for (const row of pending) {
      const line = num(row.lineNumber) || applied.length + 1;
      const code = upper(row.dedcode);
      const info = resolveCode(code);
      const isDelete = row.action === 'DELETE';

      if (!row.employeeId || !employeeExists(row.employeeId)) {
        skipped.push({ line, row, reason: 'the employee on the row is not on the master file' });
        continue;
      }
      if (!info) {
        skipped.push({ line, row, reason: `deduction code ${code || '(blank)'} is not in the code table` });
        continue;
      }
      if (leg === 'GSIS' && !info.hasGsis) {
        skipped.push({ line, row, reason: `${code} is not a GSIS code — use the Others door` });
        continue;
      }
      if (leg === 'OTHERS' && !info.hasOthers) {
        skipped.push({ line, row, reason: `${code} is a GSIS code — use the GSIS door` });
        continue;
      }
      // A delete line carries no meaningful amount, so only the add/replace
      // passes require a non-zero deduction (PAYDFGAV/PAYDFGEV vs PAYDFGDV).
      if (!isDelete && num(row.dedamt) === 0) {
        skipped.push({ line, row, reason: 'the deduction amount is zero' });
        continue;
      }

      // The door's natural key — GSIS: employee + code (never a duplicate
      // dedcode); Others: employee + code + policy. This is why a re-upload
      // updates the existing line instead of adding a second one.
      const existing = resolveExisting({ row, leg, periodId, code });

      if (isDelete) {
        if (!existing) {
          skipped.push({ line, row, reason: 'no record in the file to delete' });
          continue;
        }
        col.deleteById('deductions', str(existing.id));
        applied.push({ line, id: str(existing.id), action: 'DELETE', employeeId: str(row.employeeId), code });
        continue;
      }

      const data = payloadFor({ row, periodId, door: leg, code, info: info.picked, editor, paydate });

      if (existing) {
        updateDeduction(existing.id, data);
        applied.push({ line, id: str(existing.id), action: 'UPDATE', employeeId: str(row.employeeId), code });
        continue;
      }

      // The screen matched a row for an explicit R that is gone now — the legacy
      // GEV/ED2 seeks it again and refuses, so treat it as a skip (ignored).
      if (row.action === 'UPDATE') {
        skipped.push({ line, row, reason: 'the record marked for update is no longer in the file' });
        continue;
      }

      const id = insertDeduction(data);
      applied.push({ line, id, action: 'ADD', employeeId: str(row.employeeId), code });
    }
  });

  run();

  const postedIds = new Set(applied.map((a) => a.line));
  const stamped = (Array.isArray(session.staged) ? session.staged : []).map((r) =>
    postedIds.has(num(r.lineNumber))
      ? { ...r, action: 'POSTED', postedAt: nowIso(), postedAs: r.action }
      : r,
  );

  // Invalid rows are ignored on the deduction file but still go to the error
  // file, so the Download step lists them (PAYDFXGE/XGD/XGA append to ERRTXT).
  const priorErrorRows = Array.isArray(session.errorRows) ? session.errorRows : [];
  const knownLines = new Set(priorErrorRows.map((e) => num(e.lineNumber)));
  const errorRows = [
    ...priorErrorRows,
    ...skipped
      .filter((s) => !knownLines.has(s.line))
      .map((s) => ({
        lineNumber: s.line,
        bpn: str(s.row.bpn),
        empno: str(s.row.empno),
        name: str(s.row.employeeName),
        dedcode: str(s.row.dedcode),
        policyno: str(s.row.policyno),
        amount: num(s.row.dedamt),
        error: s.reason,
      })),
  ];

  const saved = saveSession({
    userId,
    periodId,
    doc: {
      ...session,
      staged: stamped,
      errorRows,
      postedAt: nowIso(),
      postedBy: str(editor),
      postedCount: applied.length,
      skipped: skipped.map((s) => `Line ${s.line}: ${s.reason}`),
      postLog: applied,
    },
  });

  return {
    posted: applied.length,
    inserted: applied.filter((a) => a.action === 'ADD').length,
    updated: applied.filter((a) => a.action === 'UPDATE').length,
    deleted: applied.filter((a) => a.action === 'DELETE').length,
    skipped: skipped.length,
    skippedReasons: skipped.map((s) => `Line ${s.line}: ${s.reason}`),
    applied,
    session: saved,
  };
}

module.exports = {
  TABLE,
  KEY_PREFIX,
  sessionKey,
  loadSession,
  saveSession,
  clearSession,
  postSession,
  resolveCode,
};
