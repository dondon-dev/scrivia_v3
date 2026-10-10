/**
 * RPC / custom-endpoint service — the SQLite port of the custom Go routes in
 * pocketbase_bin/main.go and the JS hooks under pb_hooks/.
 *
 * Every handler receives ({ req, body }) and returns a plain JSON value (or
 * throws HttpError). Route wiring lives in routes/rpc.routes.js.
 */
const { db } = require('../config/db');
const { getTable } = require('../config/schema');
const { newId, nowIso } = require('../lib/ids');
const { badRequest, notFound, forbidden, unauthorized, HttpError } = require('../lib/http');
const col = require('./collection.service');
const mfa = require('./mfa.service');
const authSvc = require('./auth.service');

// ── small value helpers (mirror Go's GetString/GetFloat semantics) ──────────
const str = (v) => (v === null || v === undefined ? '' : String(v));
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;
const firstNonEmpty = (...vals) => {
  for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  return '';
};
const contains = (arr, v) => Array.isArray(arr) && arr.includes(v);

function hasColumn(table, c) {
  const t = getTable(table);
  return !!(t && t.columns.has(c));
}

function getProfile(req) {
  if (!req.auth || !req.auth.id) return null;
  return authSvc.getProfileById(req.auth.id);
}

function requireProfile(req) {
  const p = getProfile(req);
  if (!p) throw unauthorized('Authentication required');
  if (p.status !== 'approved') throw forbidden('Account not approved');
  return p;
}

function requireSuper(req) {
  const p = requireProfile(req);
  if (String(p.role || '').toLowerCase() !== 'super_admin') throw forbidden('Insufficient permissions');
  return p;
}

function requireSuperOrPayroll(req) {
  const p = requireProfile(req);
  const role = String(p.role || '').toLowerCase();
  if (role !== 'super_admin' && role !== 'payroll_admin') throw forbidden('Insufficient permissions');
  return p;
}

function logAudit(userId, email, action, recordType, recordId, details) {
  try {
    col.insertOne('audit_logs', {
      user_id: userId || null,
      user_email: email || null,
      action,
      record_type: recordType || null,
      record_id: recordId || null,
      details: details ? JSON.stringify(details) : null,
      created_at: nowIso(),
    });
  } catch {
    /* best-effort */
  }
}

function setSetting(key, value) {
  const t = getTable('system_settings');
  if (!t) return;
  const cols = t.columns;
  try {
    const existing = db.prepare('SELECT id FROM "system_settings" WHERE key = ?').get(key);
    if (existing) {
      db.prepare('UPDATE "system_settings" SET value = ? WHERE id = ?').run(typeof value === 'string' ? value : JSON.stringify(value), existing.id);
    } else {
      const row = { id: newId(), key, value: typeof value === 'string' ? value : JSON.stringify(value) };
      if (cols.has('updated_at')) row.updated_at = nowIso();
      const keys = Object.keys(row);
      db.prepare(`INSERT INTO "system_settings" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => row[k]));
    }
  } catch {
    /* best-effort */
  }
}

function setProfileFields(id, patch) {
  const table = getTable('profiles');
  if (!table) return;
  const fields = {};
  for (const [k, v] of Object.entries(patch)) {
    if (hasColumn('profiles', k)) fields[k] = col.coerceForColumn(table, k, v === undefined ? null : v);
  }
  if (Object.keys(fields).length === 0) return;
  const keys = Object.keys(fields);
  db.prepare(`UPDATE "profiles" SET ${keys.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
}

// ── Auth: user approval lifecycle ───────────────────────────────────────────
const authHandlers = {
  'auth/signup': ({ body }) => {
    const email = str(firstNonEmpty(body.email)).toLowerCase();
    const password = str(body.password);
    if (!email || !password || !firstNonEmpty(body.first_name, body.firstName)) throw badRequest('Missing required fields');
    const existing = authSvc.findAuthRecord('profiles', email);
    if (existing) throw new HttpError(409, 'An account with this email already exists');
    const rec = col.insertOne('profiles', {
      email,
      password,
      first_name: firstNonEmpty(body.first_name, body.firstName),
      last_name: firstNonEmpty(body.last_name, body.lastName),
      mobile_number: body.mobile_number || body.mobileNumber || '',
      username: body.username || null,
      office_assignment: body.office_assignment || body.officeAssignment || '',
      position_designation: body.position_designation || body.positionDesignation || '',
      employee_number: body.employee_number || body.employeeNumber || '',
      role: 'read_only',
      status: 'pending_approval',
      email_verified: 0,
      mfa_enabled: 0,
      failed_login_attempts: 0,
    });
    logAudit(rec.id, email, 'signup', 'profiles', rec.id, null);
    return { success: true, message: 'Registration successful. Your account is pending administrator approval.' };
  },

  'auth/approve': ({ req, body }) => {
    const caller = requireProfile(req);
    const targetId = firstNonEmpty(body.p_target_user, body.targetUserId, body.p_user_id);
    if (!targetId) throw badRequest('Target user required');
    const target = authSvc.getProfileById(targetId);
    if (!target) throw notFound('User not found');
    setProfileFields(targetId, {
      status: 'approved', approved_by: caller.id, approved_at: nowIso(),
      rejection_reason: null, rejected_by: null, rejected_at: null,
    });
    logAudit(caller.id, caller.email, 'user_approved', 'profiles', targetId, { approved_email: target.email });
    return { success: true, email: target.email };
  },

  'auth/reject': ({ req, body }) => {
    const caller = requireProfile(req);
    const targetId = firstNonEmpty(body.p_target_user, body.targetUserId, body.p_user_id);
    const reason = firstNonEmpty(body.rejectionReason, body.p_reason, body.reason);
    if (!targetId) throw badRequest('Target user required');
    const target = authSvc.getProfileById(targetId);
    if (!target) throw notFound('User not found');
    setProfileFields(targetId, { status: 'rejected', rejected_by: caller.id, rejected_at: nowIso(), rejection_reason: reason });
    logAudit(caller.id, caller.email, 'user_rejected', 'profiles', targetId, { rejected_email: target.email, reason });
    return { success: true };
  },

  'auth/disable': ({ req, body }) => {
    const caller = requireProfile(req);
    const targetId = firstNonEmpty(body.p_target_user, body.targetUserId, body.p_user_id);
    if (!targetId) throw badRequest('Target user required');
    const target = authSvc.getProfileById(targetId);
    if (!target) throw notFound('User not found');
    setProfileFields(targetId, { status: 'disabled', disabled_by: caller.id, disabled_at: nowIso() });
    logAudit(caller.id, caller.email, 'user_disabled', 'profiles', targetId, { disabled_email: target.email });
    return { success: true };
  },

  'auth/enable': ({ req, body }) => {
    const caller = requireProfile(req);
    const targetId = firstNonEmpty(body.p_target_user, body.targetUserId, body.p_user_id);
    if (!targetId) throw badRequest('Target user required');
    const target = authSvc.getProfileById(targetId);
    if (!target) throw notFound('User not found');
    setProfileFields(targetId, { status: 'approved', disabled_by: null, disabled_at: null });
    logAudit(caller.id, caller.email, 'user_enabled', 'profiles', targetId, { enabled_email: target.email });
    return { success: true };
  },

  'auth/set-role': ({ req, body }) => {
    const caller = requireSuper(req);
    const targetId = firstNonEmpty(body.p_target_user, body.targetUserId, body.p_user_id);
    const newRole = body.p_new_role || body.newRole || body.role;
    if (!targetId || !newRole) throw badRequest('p_target_user and p_new_role required');
    const target = authSvc.getProfileById(targetId);
    if (!target) throw notFound('User not found');
    setProfileFields(targetId, { role: String(newRole) });
    logAudit(caller.id, caller.email, 'user_role_changed', 'profiles', targetId, { role: String(newRole) });
    return { success: true, email: target.email, role: String(newRole) };
  },

  'auth/set-division': ({ req, body }) => {
    const caller = requireSuper(req);
    const targetId = firstNonEmpty(body.p_target_user, body.targetUserId, body.p_user_id);
    if (!targetId) throw badRequest('p_target_user required');
    const target = authSvc.getProfileById(targetId);
    if (!target) throw notFound('User not found');
    const regionId = body.p_region_id ? String(body.p_region_id) : null;
    const divisionId = body.p_division_id ? String(body.p_division_id) : null;
    setProfileFields(targetId, { region_id: regionId, division_id: divisionId });
    return { success: true, email: target.email, region_id: regionId, division_id: divisionId };
  },

  'auth/set-stacode': ({ req, body }) => {
    requireSuperOrPayroll(req);
    const targetId = firstNonEmpty(body.p_target_user, body.targetUserId, body.p_user_id);
    if (!targetId) throw badRequest('p_target_user required');
    const target = authSvc.getProfileById(targetId);
    if (!target) throw notFound('User not found');
    const stacode = body.p_stacode ? String(body.p_stacode).trim() : '';
    setProfileFields(targetId, { assigned_stacode: stacode || null });
    return { success: true, email: target.email, assigned_stacode: stacode || null };
  },

  'auth/set-mfa': ({ req, body }) => {
    requireSuper(req);
    const targetId = firstNonEmpty(body.p_target_user, body.targetUserId, body.p_user_id);
    if (!targetId) throw badRequest('p_target_user required');
    const target = authSvc.getProfileById(targetId);
    if (!target) throw notFound('User not found');
    const enabled = body.p_enabled === true || body.p_enabled === 'true' || body.p_enabled === 1 || body.p_enabled === '1';
    setProfileFields(targetId, { mfa_enabled: enabled ? 1 : 0 });
    return { success: true, email: target.email, mfa_enabled: enabled };
  },

  'auth/unlock': ({ req, body }) => {
    requireSuper(req);
    const targetId = firstNonEmpty(body.p_target_user, body.targetUserId, body.p_user_id);
    if (!targetId) throw badRequest('p_target_user required');
    const target = authSvc.getProfileById(targetId);
    if (!target) throw notFound('User not found');
    setProfileFields(targetId, { locked_until: null, failed_login_attempts: 0 });
    return { success: true, email: target.email };
  },

  'auth/validate': ({ req, body }) => {
    requireSuperOrPayroll(req);
    const empNo = str(body.p_employee_number || body.employee_number).trim();
    if (!empNo) throw badRequest('p_employee_number required');
    let emp = db.prepare('SELECT * FROM employees WHERE employee_number = ? LIMIT 1').get(empNo)
      || db.prepare('SELECT * FROM employees WHERE empno = ? LIMIT 1').get(empNo);
    if (!emp) return { valid: false, reason: 'Employee record not found in Masterfile' };
    const lname = str(emp.lname) || str(emp.last_name);
    const fname = str(emp.fname) || str(emp.first_name);
    const mname = str(emp.mi) || str(emp.middle_name);
    const name = [lname, [fname, mname].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return { valid: true, employee_name: name, stacode: str(emp.stacode) };
  },

  'auth/mark-verified': ({ req }) => {
    const profile = getProfile(req);
    if (!profile) throw unauthorized('Unauthorized');
    if (profile.email_verified === true || profile.email_verified === 1) return { ok: true, already: true };
    setProfileFields(profile.id, { email_verified: 1 });
    logAudit(profile.id, profile.email, 'email_verified', 'profiles', profile.id, { method: 'confirmation_link' });
    return { ok: true };
  },

  'auth/record-failed-login': ({ body }) => {
    const email = str(body.p_email || body.email).toLowerCase().trim();
    if (!email) throw badRequest('p_email required');
    const profile = authSvc.findAuthRecord('profiles', email);
    if (!profile) return { ok: true };
    const attempts = Number(profile.failed_login_attempts || 0) + 1;
    const patch = { failed_login_attempts: attempts, last_login_at: nowIso() };
    if (attempts >= 5) patch.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    setProfileFields(profile.id, patch);
    if (hasColumn('login_attempts', 'email')) {
      try {
        col.insertOne('login_attempts', { email, user_id: profile.id, success: 0, failure_reason: 'invalid_credentials', created_at: nowIso() });
      } catch { /* best-effort */ }
    }
    return { ok: true, attempts, locked: attempts >= 5 };
  },

  'auth/record-successful-login': ({ req }) => {
    const profile = requireProfile(req);
    setProfileFields(profile.id, { failed_login_attempts: 0, locked_until: null, last_login_at: nowIso() });
    if (hasColumn('login_attempts', 'email')) {
      try { col.insertOne('login_attempts', { email: profile.email, user_id: profile.id, success: 1, created_at: nowIso() }); } catch { /* best-effort */ }
    }
    return { ok: true };
  },

  // ── MFA ──────────────────────────────────────────────────────────────────
  'auth/mfa/enrol': ({ req }) => mfa.enrol(req.auth.id),
  'auth/mfa/verify-enrolment': ({ req, body }) => mfa.verifyEnrolment(req.auth.id, body.code || body.p_code),
  'auth/mfa/status': ({ req }) => mfa.status(req.auth.id),
  'auth/mfa/recovery-codes/regenerate': ({ req, body }) => mfa.regenerateRecoveryCodes(req.auth.id, { code: body.code, password: body.password }),
  'auth/mfa/reset': ({ req, body }) =>
    mfa.reset(req.auth.id, {
      targetUserId: firstNonEmpty(body.p_target_user, body.targetUserId, body.user_id),
      reason: firstNonEmpty(body.reason, body.p_reason),
    }),
};

// ── Permissions ─────────────────────────────────────────────────────────────
const permissionHandlers = {
  permissions: () => {
    const table = getTable('role_permissions');
    if (!table) return [];
    return col.selectRows('role_permissions', {}).map((r) => ({ role: r.role, permission: r.permission, granted: r.granted }));
  },
  'permissions/upsert': ({ req, body }) => {
    const caller = getProfile(req);
    const role = firstNonEmpty(body.p_role, body.role);
    const permission = firstNonEmpty(body.p_permission, body.permission);
    const granted = body.p_granted === true || body.granted === true;
    if (!role || !permission) throw badRequest('role and permission required');
    const existing = db.prepare('SELECT id FROM "role_permissions" WHERE role = ? AND permission = ? LIMIT 1').get(role, permission);
    if (existing) {
      db.prepare('UPDATE "role_permissions" SET granted = ? WHERE id = ?').run(granted ? 1 : 0, existing.id);
    } else {
      col.insertOne('role_permissions', { role, permission, granted: granted ? 1 : 0 });
    }
    if (caller) logAudit(caller.id, caller.email, 'role_permission_change', 'role_permissions', `${role}:${permission}`, { role, permission, granted });
    return { success: true };
  },
  'permissions/delete': ({ body }) => {
    const role = firstNonEmpty(body.p_role, body.role);
    const permission = firstNonEmpty(body.p_permission, body.permission);
    db.prepare('DELETE FROM "role_permissions" WHERE role = ? AND permission = ?').run(role, permission);
    return { success: true };
  },
};

// ── Dashboard ───────────────────────────────────────────────────────────────
const dashboardHandlers = {
  'dashboard/summary': ({ req }) => {
    const q = req.query || {};
    const category = q.category || '';
    const regcode = q.regcode || '';
    const divcodes = q.divcodes ? String(q.divcodes).split(',') : [];

    let empQuery = "SELECT COUNT(*) AS c FROM employees WHERE status = 'Active'";
    const params = [];
    if (category === 'elementary') empQuery += ' AND CAST(stacode AS INTEGER) BETWEEN 1 AND 499';
    else if (category === 'highschool') empQuery += ' AND CAST(stacode AS INTEGER) BETWEEN 500 AND 701';
    if (regcode) { empQuery += ' AND regcode = ?'; params.push(regcode); }
    if (divcodes.length) {
      empQuery += ` AND divcode IN (${divcodes.map(() => '?').join(',')})`;
      params.push(...divcodes);
    }

    const totalRecords = db.prepare('SELECT COUNT(*) AS c FROM employees').get().c;
    let activeEmployees = totalRecords;
    try { activeEmployees = db.prepare(empQuery).get(...params).c; } catch { /* keep fallback */ }

    let agg = { g: 0, n: 0, m: 0, o: 0, posted: 0, computed: 0 };
    try {
      agg = db.prepare(`SELECT COALESCE(SUM(gross_pay),0) g, COALESCE(SUM(net_pay),0) n,
        COALESCE(SUM(dedlnr+dedmed+dedpag+dedtax),0) m, COALESCE(SUM(other_deductions),0) o,
        COUNT(CASE WHEN status='Posted' THEN 1 END) posted, COUNT(CASE WHEN status='Computed' THEN 1 END) computed
        FROM payroll_entries`).get();
    } catch { /* table shape differences are tolerated */ }

    let currentPeriod = null;
    try {
      const row = db.prepare("SELECT period_name FROM pay_periods WHERE status != 'closed' ORDER BY start_date DESC LIMIT 1").get();
      if (row) currentPeriod = row.period_name;
    } catch { /* ignore */ }

    let groups = [];
    try {
      groups = col.selectRows('payroll_groups', { filter: { op: 'eq', col: 'status', val: 'Active' }, sort: 'stacode_min' });
    } catch { /* ignore */ }

    return {
      totalRecords,
      activeEmployees,
      totalGross: agg.g || 0,
      totalNet: agg.n || 0,
      totalMandatory: agg.m || 0,
      totalLoanDeds: agg.o || 0,
      processedCount: agg.posted || 0,
      pendingCount: agg.computed || 0,
      currentPeriod,
      periodNet: 0,
      groupStats: groups.map((g) => ({
        id: g.id, group_code: g.group_code, group_name: g.group_name,
        stacode_min: g.stacode_min, stacode_max: g.stacode_max,
      })),
      unassignedCount: 0,
      activeLoanAccounts: 0,
      dedTotalsByCode: [],
      recentEmployees: [],
    };
  },
  'dashboard/refresh-cache': () => ({ success: true }),
};

// ── Payroll ─────────────────────────────────────────────────────────────────
function computeWithholdingTax(taxableIncome) {
  const brackets = [
    { max: 20833, base: 0, rate: 0 },
    { max: 33333, base: 0, rate: 0.15 },
    { max: 66667, base: 1875, rate: 0.2 },
    { max: 166667, base: 8541.67, rate: 0.25 },
    { max: 666667, base: 33541.67, rate: 0.3 },
    { max: Number.MAX_VALUE, base: 183541.67, rate: 0.35 },
  ];
  const ti = Math.max(0, taxableIncome);
  for (let i = 0; i < brackets.length; i += 1) {
    const b = brackets[i];
    if (ti <= b.max) {
      const prevMax = i > 0 ? brackets[i - 1].max : 0;
      return round2(b.base + (ti - prevMax) * b.rate);
    }
  }
  return 0;
}

function isMandatoryLoan(agency, dedType) {
  const a = String(agency || '').toUpperCase().trim();
  const t = String(dedType || '').toUpperCase().trim();
  if (a === 'BIR' || a === 'PHIC' || a === 'PHILHEALTH' || a === 'GSIS') return true;
  if ((a === 'HDMF' || a === 'PAGIBIG' || a === 'PAG-IBIG') && ['L', 'LOAN', 'MANDATORY', 'P', 'PROVIDENT', 'SAVINGS'].includes(t)) return true;
  return false;
}

const payrollHandlers = {
  'payroll/run': ({ req, body }) => {
    const caller = requireProfile(req);
    const periodId = firstNonEmpty(body.periodId, body.p_pay_period_id, body.p_period_id);
    if (!periodId) throw badRequest('Pay period required');
    const period = db.prepare('SELECT period_name FROM pay_periods WHERE id = ?').get(periodId);
    if (!period) throw notFound('Pay period not found');

    const employees = col.selectRows('employees', { filter: { op: 'eq', col: 'status', val: 'Active' }, sort: 'stacode' });
    let processed = 0;

    const run = db.transaction(() => {
      for (const emp of employees) {
        const deductions = col.selectRows('payroll_deductions', {
          filter: { op: 'and', conditions: [{ col: 'employee_id', op: 'eq', val: emp.id }, { col: 'status', op: 'eq', val: 'Active' }] },
        });

        const basic = num(emp.basic) + num(emp.basic_salary);
        const pera = num(emp.pera);
        const longPay = num(emp.long) + num(emp.ontop);
        const gross = basic + pera + longPay;

        const dedlnr = round2(basic * 0.09);
        let phicTotal = basic * 0.05;
        if (phicTotal > 5000) phicTotal = 5000;
        const dedmed = Math.floor(phicTotal * 50) / 100;
        const dedpag = 200.0;
        const taxableIncome = Math.max(0, basic - dedlnr - dedmed - dedpag);
        const dedtax = computeWithholdingTax(taxableIncome);

        let mandatoryLoanTotal = 0;
        let otherLoanTotal = 0;
        for (const ded of deductions) {
          const amt = num(ded.dedamt);
          if (isMandatoryLoan(ded.agency, ded.type)) mandatoryLoanTotal += amt;
          else otherLoanTotal += amt;
        }

        const mandatoryDeductions = dedlnr + dedmed + dedpag + dedtax + mandatoryLoanTotal;
        const availableBalance = gross - mandatoryDeductions;
        const capacity = Math.max(0, availableBalance - 5000);
        const actualLoanDeductions = Math.min(otherLoanTotal, capacity);
        const netPay = availableBalance - actualLoanDeductions;

        col.insertOne('payroll_entries', {
          employee_id: emp.id,
          pay_period_id: periodId,
          gross_pay: round2(gross),
          total_deductions: round2(mandatoryDeductions + actualLoanDeductions),
          net_pay: round2(netPay),
          status: 'Computed',
          dedlnr: round2(dedlnr),
          dedmed: round2(dedmed),
          dedpag,
          dedtax: round2(dedtax),
          other_deductions: round2(actualLoanDeductions),
          mandatory_deductions: round2(mandatoryDeductions),
          available_balance: round2(availableBalance),
          loan_deduction_capacity: round2(capacity),
          actual_loan_deductions: round2(actualLoanDeductions),
          nthp_status: 'PASS',
          processed_at: nowIso(),
        });
        processed += 1;
      }
    });
    run();

    logAudit(caller.id, caller.email, 'payroll_run', 'payroll_entries', periodId, { period: period.period_name, processed });
    return { success: true, processed, employees_processed: processed, entries: processed };
  },

  'payroll/reverse': ({ req, body }) => {
    const caller = requireProfile(req);
    const periodId = firstNonEmpty(body.periodId, body.p_pay_period_id, body.p_period_id);
    if (!periodId) throw badRequest('Pay period required');
    db.prepare("UPDATE payroll_entries SET status = 'Reversed' WHERE pay_period_id = ? AND status = 'Posted'").run(periodId);
    logAudit(caller.id, caller.email, 'payroll_reverse', 'payroll_entries', periodId, null);
    return { success: true };
  },

  'payroll/engine-stats': () => {
    const row = db.prepare(`SELECT COUNT(*) total,
      COUNT(CASE WHEN status='Posted' THEN 1 END) posted,
      COUNT(CASE WHEN status='Computed' THEN 1 END) computed,
      COUNT(CASE WHEN status='Reversed' THEN 1 END) reversed,
      COALESCE(SUM(net_pay),0) net FROM payroll_entries`).get();
    return {
      totalEntries: row.total, postedEntries: row.posted, computedEntries: row.computed,
      reversedEntries: row.reversed, totalNetPay: row.net,
    };
  },

  'payroll/deduction-engine': () => {
    const row = db.prepare(`SELECT COALESCE(SUM(pd.dedamt),0) totalDeductions,
      (SELECT COALESCE(SUM(COALESCE(basic,0)+COALESCE(basic_salary,0)+COALESCE(pera,0)),0) FROM employees WHERE status='Active') grossPay,
      COUNT(*) activeCount
      FROM payroll_deductions pd LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
      WHERE pd.status = 'Active' AND dc.active = true`).get();
    return {
      totalDeductions: row.totalDeductions,
      grossPay: row.grossPay,
      netPay: row.grossPay - row.totalDeductions,
      activeCount: row.activeCount,
      groupTotals: [],
    };
  },

  'payroll/generate-periods': ({ body }) => {
    let year = body.year || body.p_year || new Date().getFullYear();
    const regcode = firstNonEmpty(body.regcode, body.p_regcode);
    const divcode = firstNonEmpty(body.divcode, body.p_divcode);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let created = 0;
    for (let month = 1; month <= 12; month += 1) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0));
      const pay = new Date(Date.UTC(year, month, 14));
      const existing = db.prepare("SELECT id FROM pay_periods WHERE year = ? AND month = ? AND COALESCE(regcode,'') = ? AND COALESCE(divcode,'') = ? LIMIT 1")
        .get(year, month, regcode || '', divcode || '');
      if (existing) continue;
      try {
        col.insertOne('pay_periods', {
          period_name: `${monthNames[month - 1]} ${year}`,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          pay_date: pay.toISOString().slice(0, 10),
          frequency: 'Monthly',
          status: 'draft',
          month,
          year,
          period_number: month,
          regcode: regcode || '',
          divcode: divcode || '',
        });
        created += 1;
      } catch { /* skip duplicates / shape mismatches */ }
    }
    return { created };
  },
};

// ── Employees ───────────────────────────────────────────────────────────────
function stacodeDigits(stacode) {
  let digits = '';
  for (const c of String(stacode)) {
    if (c >= '0' && c <= '9') digits += c;
    else if (digits !== '') break;
  }
  return digits;
}

const employeeHandlers = {
  'employees/query': ({ req, body }) => {
    const q = req.query || {};
    const searchInput = firstNonEmpty(body.p_search, body.search, q.search, q.p_search);
    const page = body.p_page != null ? Number(body.p_page) : Math.max(0, (parseInt(q.page, 10) || 1) - 1);
    let perPage = body.p_page_size != null && Number(body.p_page_size) > 0 ? Number(body.p_page_size) : (parseInt(q.perPage, 10) || parseInt(q.p_page_size, 10) || 10);
    if (perPage <= 0) perPage = 10;

    let scopeCol = firstNonEmpty(body.p_scope_column, q.p_scope_column);
    let scopeVal = firstNonEmpty(body.p_scope_value, q.p_scope_value);
    const regcode = firstNonEmpty(body.p_regcode, q.p_regcode).trim();
    const divcodes = Array.isArray(body.p_divcodes) ? body.p_divcodes : (q.p_divcodes ? String(q.p_divcodes).split(',') : []);
    const legacyStacode = firstNonEmpty(q.stacode);
    const stacodeMin = body.p_stacode_min != null ? Number(body.p_stacode_min) : -1;
    const stacodeMax = body.p_stacode_max != null ? Number(body.p_stacode_max) : -1;
    const countOnly = body.p_count_only === true;

    const profile = getProfile(req);
    if (profile) {
      const role = String(profile.role || '').toLowerCase().trim();
      const stacode = String(profile.assigned_stacode || '').trim();
      const empNo = String(profile.employee_number || profile.empno || '').trim();
      if (role === 'school_coordinator' || role === 'school_head') {
        scopeCol = 'stacode'; scopeVal = stacode;
        if (!stacode) return { rows: [], data: [], total: 0 };
      } else if (role === 'ess') {
        scopeCol = 'empno'; scopeVal = empNo;
      }
    }

    const records = col.selectRows('employees', {});
    const lower = (s) => String(s || '').toLowerCase().trim();
    const searchL = lower(searchInput);
    const filtered = records.filter((r) => {
      const empno = str(r.empno) || str(r.employee_number);
      const stacode = str(r.stacode);
      const lname = str(r.lname) || str(r.last_name);
      const fname = str(r.fname) || str(r.first_name);
      const mi = str(r.mi) || str(r.middle_name);

      if (legacyStacode && stacode !== legacyStacode) return false;
      if (stacodeMin >= 0 && stacodeMax >= 0) {
        const n = parseInt(stacodeDigits(stacode), 10);
        if (Number.isNaN(n) || n < stacodeMin || n > stacodeMax) return false;
      }
      if (scopeCol && scopeVal) {
        if (scopeCol === 'stacode' && stacode !== scopeVal) return false;
        if (scopeCol === 'empno' && empno !== scopeVal && str(r.employee_number) !== scopeVal) return false;
      }
      if (regcode && str(r.regcode) !== regcode) return false;
      if (divcodes.length && !contains(divcodes, str(r.divcode))) return false;
      if (searchL) {
        const hay = lower([empno, str(r.employee_number), lname, fname, mi, str(r.empname), stacode].join(' '));
        if (!hay.includes(searchL)) return false;
      }
      return true;
    });

    const total = filtered.length;
    if (countOnly) return { rows: [], data: [], total };
    const start = Math.min(page * perPage, total);
    const end = Math.min(start + perPage, total);
    const result = filtered.slice(start, end);
    return { rows: result, data: result, total, page, perPage };
  },

  'employees/set-number': ({ body }) => {
    const targetId = firstNonEmpty(body.employeeId, body.p_target_user, body.p_user_id, body.p_employee_id);
    const empNo = firstNonEmpty(body.employeeNumber, body.p_employee_number).trim();
    if (!targetId || !empNo) throw badRequest('Employee and number required');
    const emp = db.prepare('SELECT id FROM employees WHERE id = ?').get(targetId);
    if (emp) {
      setFields('employees', targetId, { empno: empNo, employee_number: empNo });
      return { success: true };
    }
    const prof = authSvc.getProfileById(targetId);
    if (prof) {
      const patch = { employee_number: empNo };
      if (hasColumn('profiles', 'empno')) patch.empno = empNo;
      setProfileFields(targetId, patch);
      return { success: true };
    }
    throw notFound('Employee not found');
  },
};

function setFields(table, id, patch) {
  const t = getTable(table);
  if (!t) throw badRequest(`Unknown collection: ${table}`);
  const entries = Object.entries(patch).filter(([k, v]) => t.columns.has(k) && v !== undefined);
  if (entries.length === 0) return;
  db.prepare(`UPDATE "${table}" SET ${entries.map(([k]) => `"${k}" = ?`).join(', ')} WHERE id = ?`)
    .run(...entries.map(([k, v]) => col.coerceForColumn(t, k, v)), id);
}

// ── DBF ─────────────────────────────────────────────────────────────────────
const dbfHandlers = {
  'dbf/table-counts': () => {
    const tables = ['employees', 'payroll_deductions', 'dbf_stntable', 'dbf_divtable', 'dbf_included', 'dbf_excluded', 'dbf_payrolls', 'dbf_pyent', 'dbf_pyent1', 'dbf_pyent2'];
    const result = [];
    for (const t of tables) {
      const tc = { table_name: t, total: 0, elementary: 0, highschool: 0 };
      try { tc.total = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c; } catch { tc.total = 0; }
      if (t !== 'dbf_divtable') {
        try {
          const rows = db.prepare(`SELECT stacode FROM "${t}"`).all();
          for (const r of rows) {
            const digits = stacodeDigits(r.stacode);
            if (digits === '') continue;
            const v = parseInt(digits, 10);
            if (v >= 1 && v <= 499) tc.elementary += 1;
            else if (v >= 500 && v <= 701) tc.highschool += 1;
          }
        } catch { /* column may not exist */ }
      }
      result.push(tc);
    }
    return result;
  },

  'dbf/query-dedfile': ({ req, body }) => {
    const profile = getProfile(req);
    const page = body.p_page != null ? Math.max(0, Number(body.p_page)) : 0;
    let pageSize = body.p_page_size != null && Number(body.p_page_size) > 0 ? Number(body.p_page_size) : 50;
    const sortKey = firstNonEmpty(body.p_sort_key, 'empno');
    const sortDir = firstNonEmpty(body.p_sort_dir, 'asc').toLowerCase();
    const countOnly = body.p_count_only === true;

    const divcodes = Array.isArray(body.p_divcodes) ? [...body.p_divcodes] : [];
    if (Array.isArray(body.p_division_ids) && body.p_division_ids.length) {
      for (const id of body.p_division_ids) {
        const d = db.prepare('SELECT division_code FROM divisions WHERE id = ?').get(id);
        if (d && str(d.division_code).trim() && !contains(divcodes, d.division_code)) divcodes.push(str(d.division_code).trim());
      }
    }

    const deds = col.selectRows('payroll_deductions', {});
    const emps = col.selectRows('employees', {});
    const empMap = new Map(emps.map((e) => [e.id, e]));

    const fSearch = String(body.p_search || '').toLowerCase();
    const fStacode = String(body.p_stacode || '');
    const fDedcode = String(body.p_dedcode || '');
    const fEmpno = String(body.p_empno || '');
    const fRegcode = String(body.p_regcode || '');
    const fStacodeMin = body.p_stacode_min !== undefined && body.p_stacode_min !== null ? String(body.p_stacode_min) : '';
    const fStacodeMax = body.p_stacode_max !== undefined && body.p_stacode_max !== null ? String(body.p_stacode_max) : '';

    const rows = [];
    for (const d of deds) {
      const emp = empMap.get(d.employee_id);
      let empno = ''; let lname = ''; let fname = ''; let mi = ''; let appel = '';
      let stacode = str(d.stacode); let regcode = ''; let divcode = ''; let netpay = 0;
      if (emp) {
        empno = str(emp.empno) || str(emp.employee_number);
        lname = str(emp.lname) || str(emp.last_name);
        fname = str(emp.fname) || str(emp.first_name);
        mi = str(emp.mi);
        appel = str(emp.appel);
        if (!stacode) stacode = str(emp.stacode);
        regcode = str(emp.regcode);
        divcode = str(emp.divcode);
        netpay = num(emp.netpay);
      }
      const dedcode = str(d.dedcode);
      let dedid = str(d.dedid) || dedcode;

      if (fStacode && stacode !== fStacode) continue;
      if (fDedcode && dedcode.toLowerCase() !== fDedcode.toLowerCase()) continue;
      if (fEmpno && !empno.toLowerCase().includes(fEmpno.toLowerCase())) continue;
      if (fRegcode && regcode !== fRegcode) continue;
      if (divcodes.length && !contains(divcodes, divcode)) continue;
      if (fStacodeMin) { const vn = parseFloat(stacode); const mn = parseFloat(fStacodeMin); if (!Number.isNaN(vn) && !Number.isNaN(mn) && vn < mn) continue; }
      if (fStacodeMax) { const vn = parseFloat(stacode); const mx = parseFloat(fStacodeMax); if (!Number.isNaN(vn) && !Number.isNaN(mx) && vn > mx) continue; }
      if (fSearch) {
        const hay = [empno, lname, fname, dedcode, dedid, str(d.policyno)].join(' ').toLowerCase();
        if (!hay.includes(fSearch)) continue;
      }
      rows.push({ ...d, empno, lname, last_name: lname, fname, first_name: fname, mi, appel, stacode, regcode, divcode, netpay, dedcode, dedid, dedamt: num(d.dedamt) });
    }

    rows.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      const an = parseFloat(av); const bn = parseFloat(bv);
      let cmp;
      if (!Number.isNaN(an) && !Number.isNaN(bn)) cmp = an - bn;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      if (cmp === 0) cmp = String(a.id).localeCompare(String(b.id));
      return sortDir === 'desc' ? -cmp : cmp;
    });

    const total = rows.length;
    if (countOnly) return { rows: [], total };
    const start = Math.min(page * pageSize, total);
    const end = Math.min(start + pageSize, total);
    return { rows: rows.slice(start, end), total };
  },

  'dbf/restore': () => ({ success: true, message: 'Use the file upload endpoint for DBF restore' }),
};

// ── Schools ─────────────────────────────────────────────────────────────────
const schoolHandlers = {
  'schools/stats': () => {
    const count = (sql) => db.prepare(sql).get().c;
    return {
      totalSchools: count('SELECT COUNT(*) c FROM schools'),
      elementary: count("SELECT COUNT(*) c FROM schools WHERE school_type = 'Elementary'"),
      juniorHigh: count("SELECT COUNT(*) c FROM schools WHERE school_type = 'Junior High School'"),
      seniorHigh: count("SELECT COUNT(*) c FROM schools WHERE school_type = 'Senior High School'"),
      implementing: count("SELECT COUNT(*) c FROM schools WHERE school_type = 'Implementing Unit'"),
    };
  },

  'query-schools-with-stats': ({ req, body }) => {
    const schoolType = firstNonEmpty(body.p_school_type, body.school_type);
    const divisionIds = Array.isArray(body.p_division_ids) ? body.p_division_ids : [];
    const regcode = firstNonEmpty(body.p_regcode, body.regcode).trim();
    const divcodes = Array.isArray(body.p_divcodes) ? body.p_divcodes : (body.p_divcodes ? String(body.p_divcodes).split(',') : []);

    const profile = getProfile(req);
    let stacodeScoped = '';
    if (profile) {
      const role = String(profile.role || '').toLowerCase().trim();
      if (role === 'school_coordinator' || role === 'school_head') stacodeScoped = String(profile.assigned_stacode || '').trim();
    }

    let filter = { op: 'and', conditions: [] };
    const cond = filter.conditions;
    if (stacodeScoped && stacodeScoped.replace(/^0+/, '') === '') return [];
    if (stacodeScoped) {
      const variants = [...new Set([stacodeScoped, stacodeScoped.replace(/^0+/, ''), String(parseInt(stacodeScoped.replace(/^0+/, ''), 10)).padStart(3, '0')])].filter(Boolean);
      const ors = [];
      if (hasColumn('schools', 'school_code')) ors.push(...variants.map((v) => ({ col: 'school_code', op: 'eq', val: v })));
      if (hasColumn('schools', 'stacode')) ors.push(...variants.map((v) => ({ col: 'stacode', op: 'eq', val: v })));
      if (ors.length === 0) return [];
      cond.push({ op: 'or', conditions: ors });
    }
    if (schoolType) cond.push({ col: 'school_type', op: 'eq', val: schoolType });
    if (divisionIds.length && hasColumn('schools', 'division_id')) cond.push({ col: 'division_id', op: 'in', val: divisionIds });
    if (regcode && hasColumn('schools', 'regcode')) cond.push({ col: 'regcode', op: 'eq', val: regcode });
    if (divcodes.length && hasColumn('schools', 'divcode')) cond.push({ col: 'divcode', op: 'in', val: divcodes });

    const sortField = hasColumn('schools', 'school_code') ? '-school_code' : '-stacode';
    let records;
    try {
      records = col.selectRows('schools', { filter: cond.length ? filter : null, sort: sortField });
    } catch {
      return [];
    }

    const empCounts = new Map();
    try {
      const empRows = db.prepare("SELECT stacode, COUNT(*) c FROM employees WHERE stacode != '' AND stacode IS NOT NULL GROUP BY stacode").all();
      for (const r of empRows) empCounts.set(String(r.stacode), r.c);
    } catch { /* ignore */ }

    return records.map((r) => {
      const stacode = str(r.school_code) || str(r.stacode);
      const total = empCounts.get(stacode) || 0;
      return { ...r, total_employees: total, teaching_personnel: 0, non_teaching_personnel: total, active_payroll_employees: 0 };
    });
  },
};

// ── Misc ────────────────────────────────────────────────────────────────────
const miscHandlers = {
  'audit/log': ({ req, body }) => {
    const profile = getProfile(req);
    if (!body.action) throw badRequest('action required');
    logAudit(profile ? profile.id : null, profile ? profile.email : null, body.action, body.record_type, body.record_id, body.details);
    return { ok: true };
  },

  'lockdown/activate': ({ req, body }) => {
    const caller = requireSuper(req);
    setSetting('lockdown', { locked: true, reason: body.reason || '' });
    logAudit(caller.id, caller.email, 'lockdown_activated', 'system_settings', 'lockdown', { reason: body.reason || '' });
    return { success: true };
  },
  'lockdown/deactivate': ({ req }) => {
    const caller = requireSuper(req);
    setSetting('lockdown', { locked: false });
    logAudit(caller.id, caller.email, 'lockdown_deactivated', 'system_settings', 'lockdown', null);
    return { success: true };
  },

  'audit/logs': ({ req }) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.max(1, parseInt(req.query.perPage, 10) || 50);
    let records = [];
    try { records = col.selectRows('audit_logs', { sort: '-created_at' }); } catch { /* ignore */ }
    const total = records.length;
    const start = (page - 1) * perPage;
    return { data: records.slice(start, start + perPage), total };
  },

  'import-logs': ({ req }) => {
    const table = req.query.table || 'pli_import_logs';
    try {
      const records = col.selectRows(table, { sort: '-created_at', limit: 50 });
      return records.slice(0, 50);
    } catch {
      return [];
    }
  },

  'turnstile-verify': async ({ req, body }) => {
    const token = body.token;
    if (!token) throw badRequest('token required');
    let secretKey = '';
    try {
      const row = db.prepare('SELECT * FROM system_settings WHERE id = ? OR key = ?').get('turnstile', 'turnstile');
      if (row) secretKey = str(row.turnstile_secret_key) || str(row.value);
    } catch { /* ignore */ }
    if (!secretKey) return { success: false, error: 'Turnstile not configured' };
    try {
      const params = new URLSearchParams({ secret: secretKey, response: String(token) });
      const remote = req.ip || req.socket?.remoteAddress;
      if (remote) params.set('remoteip', remote);
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const result = await res.json();
      return { success: result.success === true };
    } catch {
      throw new HttpError(500, 'Verification failed');
    }
  },
};

const allHandlers = {
  ...authHandlers,
  ...permissionHandlers,
  ...dashboardHandlers,
  ...payrollHandlers,
  ...employeeHandlers,
  ...dbfHandlers,
  ...schoolHandlers,
  ...miscHandlers,
};

// RPC names that map to a real handler but are not in the frontend RPC_MAP.
const ALIASES = {
  query_schools_with_stats: 'query-schools-with-stats',
};

// Endpoints deliberately not ported yet (flagged in the migration report).
const STUBS = new Set(['ai_copilot', 'get_payroll_history_by_month']);

function hasHandler(path) {
  const key = ALIASES[path] || path;
  return STUBS.has(key) || Object.prototype.hasOwnProperty.call(allHandlers, key);
}

async function dispatch(path, req) {
  const key = ALIASES[path] || path;
  if (STUBS.has(key)) {
    throw new HttpError(501, `Endpoint "${path}" is not yet implemented in the Express backend`);
  }
  const handler = allHandlers[key];
  if (!handler) throw notFound(`Unknown endpoint: ${path}`);
  return handler({ req, body: req.body || {} });
}

module.exports = { dispatch, hasHandler, allHandlers, computeWithholdingTax, isMandatoryLoan };
