-- ═══════════════════════════════════════════════════════════════════════════
-- SCRIVIA CLOUD — SQLite Schema (ported from PostgreSQL/Supabase)
-- ═══════════════════════════════════════════════════════════════════════════
-- PocketBase manages its own _admins, _mfa, _otps, _externalAuths, etc.
-- This file contains the application tables that PocketBase collections
-- map to, plus indexes and triggers that keep derived data in sync.
-- ═══════════════════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── 1. REGIONS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regions (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  region_code TEXT NOT NULL UNIQUE,
  region_name TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'Active',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ── 2. DIVISIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS divisions (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  region_id     TEXT NOT NULL REFERENCES regions(id),
  division_code TEXT NOT NULL,
  division_name TEXT NOT NULL,
  features      TEXT DEFAULT '{}',  -- JSON
  status        TEXT DEFAULT 'Active',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ── 3. SCHOOLS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  school_code   TEXT DEFAULT '',
  school_name   TEXT NOT NULL,
  school_type   TEXT,           -- 'Elementary' | 'Junior High School' | 'Senior High School' | 'Implementing Unit'
  stacode       TEXT,
  school_head   TEXT DEFAULT '',
  address       TEXT DEFAULT '',
  contact_number TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  division_id   TEXT REFERENCES divisions(id),
  region_id     TEXT REFERENCES regions(id),
  district      TEXT,
  cluster       TEXT,
  municipality  TEXT,
  province      TEXT,
  status        TEXT DEFAULT 'Active',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_schools_stacode ON schools(stacode);
CREATE INDEX IF NOT EXISTS idx_schools_division ON schools(division_id);

-- ── 4. IMPLEMENTING UNITS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS implementing_units (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  unit_name   TEXT NOT NULL,
  school_id   TEXT REFERENCES schools(id),
  division_id TEXT REFERENCES divisions(id),
  status      TEXT DEFAULT 'Active',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ── 5. PROFILES (auth + RBAC) ──────────────────────────────────────────────
-- PocketBase auth is built-in. This table stores the RBAC profile.
-- PocketBase creates its own `profiles` auth table — we add columns to it.
-- In PocketBase schema we add these fields to the profiles collection:
--   first_name, last_name, mobile_number, username, role, status,
--   region_id, division_id, assigned_stacode, office_assignment,
--   position_designation, employee_number, rejection_reason,
--   approved_by, approved_at, rejected_by, rejected_at,
--   disabled_by, disabled_at, mfa_enabled, failed_login_attempts,
--   locked_until, last_login_at, last_login_ip, email_verified,
--   regcode, divcode
-- (PocketBase manages password, email, tokenKey, etc.)

-- ── 6. EMPLOYEES (masterfile — 80-column DBF) ──────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),

  -- Identity & Assignment
  employee_number TEXT DEFAULT '',
  last_name      TEXT DEFAULT '',
  first_name     TEXT DEFAULT '',
  middle_name    TEXT DEFAULT '',
  position       TEXT DEFAULT '',
  department     TEXT DEFAULT '',
  bank_name      TEXT DEFAULT '',
  bank_account   TEXT DEFAULT '',
  basic_salary   REAL DEFAULT 0,
  hourly_rate    REAL DEFAULT 0,
  tax_status     TEXT DEFAULT '',
  sss_number     TEXT DEFAULT '',
  philhealth_number TEXT DEFAULT '',
  pagibig_number TEXT DEFAULT '',
  hire_date      TEXT,

  -- Masterfile 80-column fields
  regcode    TEXT DEFAULT '',
  divcode    TEXT DEFAULT '',
  stacode    TEXT DEFAULT '',
  empno      TEXT DEFAULT '',
  account    TEXT DEFAULT '',
  empname    TEXT DEFAULT '',
  fname      TEXT DEFAULT '',
  mi         TEXT DEFAULT '',
  lname      TEXT DEFAULT '',
  appel      TEXT DEFAULT '',
  poscode    TEXT DEFAULT '',
  paymode    TEXT DEFAULT '',

  -- Salary & Grade
  grade       REAL DEFAULT 0,
  step        REAL DEFAULT 0,
  basic       REAL DEFAULT 0,
  trans       REAL DEFAULT 0,
  pera        REAL DEFAULT 0,
  aca         REAL DEFAULT 0,
  rata        REAL DEFAULT 0,
  ontop       REAL DEFAULT 0,
  long        REAL DEFAULT 0,
  clothing    REAL DEFAULT 0,
  cashallow   REAL DEFAULT 0,

  -- Deductions (employee share)
  dedlnr   REAL DEFAULT 0,
  dedmed   REAL DEFAULT 0,
  dedtax   REAL DEFAULT 0,
  dedpag   REAL DEFAULT 0,
  netpay   REAL DEFAULT 0,

  -- Government share
  govtlnr  REAL DEFAULT 0,
  govtecc  REAL DEFAULT 0,
  govtmed  REAL DEFAULT 0,
  govtpag  REAL DEFAULT 0,

  -- Codes & Status
  pagcode  TEXT DEFAULT '',
  taxcode  TEXT DEFAULT '',
  civilstat TEXT DEFAULT '',
  attend   TEXT DEFAULT '',
  status   TEXT DEFAULT 'Active',
  sex      TEXT DEFAULT '',
  tin      TEXT DEFAULT '',

  -- Government IDs
  gsis_pn  TEXT DEFAULT '',
  gsis_id  TEXT DEFAULT '',
  hdmf_id  TEXT DEFAULT '',
  phic_id  TEXT DEFAULT '',
  pib      TEXT DEFAULT '',
  banker   TEXT DEFAULT '',

  -- Dates
  birthdate TEXT,
  update    TEXT,
  paydate   TEXT,
  hiredate  TEXT,

  -- Bonuses & Adjustments
  mid_bonus    REAL DEFAULT 0,
  mid_cash     REAL DEFAULT 0,
  end_bonus    REAL DEFAULT 0,
  end_cash     REAL DEFAULT 0,
  add_bonus    REAL DEFAULT 0,
  taxref       REAL DEFAULT 0,
  special      REAL DEFAULT 0,
  over_wheld   REAL DEFAULT 0,

  -- Excess fields
  exposcode  TEXT DEFAULT '',
  exgrade    REAL DEFAULT 0,
  exstep     REAL DEFAULT 0,
  exbasic    REAL DEFAULT 0,
  exlnr      REAL DEFAULT 0,
  exmed      REAL DEFAULT 0,
  expag      REAL DEFAULT 0,
  extax      REAL DEFAULT 0,
  exglnr     REAL DEFAULT 0,
  exgmed     REAL DEFAULT 0,
  exgpag     REAL DEFAULT 0,
  exgecc     REAL DEFAULT 0,

  -- Difference fields
  saldiff    REAL DEFAULT 0,
  lnrdiff    REAL DEFAULT 0,
  meddiff    REAL DEFAULT 0,
  pagdiff    REAL DEFAULT 0,
  taxdiff    REAL DEFAULT 0,
  glnrdiff   REAL DEFAULT 0,
  gmeddiff   REAL DEFAULT 0,
  gpagdiff   REAL DEFAULT 0,
  geccdiff   REAL DEFAULT 0,

  -- Metadata
  updcode    TEXT DEFAULT '',
  editor     TEXT DEFAULT '',

  -- Dependents
  depname1 TEXT DEFAULT '', depname2 TEXT DEFAULT '',
  depname3 TEXT DEFAULT '', depname4 TEXT DEFAULT '',
  depdate1 TEXT, depdate2 TEXT, depdate3 TEXT, depdate4 TEXT,

  -- Payroll Group
  payroll_group_id TEXT REFERENCES payroll_groups(id),
  distcode         TEXT DEFAULT '',

  -- Region/Division foreign keys
  region_id   TEXT REFERENCES regions(id),
  division_id TEXT REFERENCES divisions(id)
);

CREATE INDEX IF NOT EXISTS idx_emp_stacode  ON employees(stacode);
CREATE INDEX IF NOT EXISTS idx_emp_empno    ON employees(empno);
CREATE INDEX IF NOT EXISTS idx_emp_status   ON employees(status);
CREATE INDEX IF NOT EXISTS idx_emp_divcode  ON employees(divcode);
CREATE INDEX IF NOT EXISTS idx_emp_regcode  ON employees(regcode);
CREATE INDEX IF NOT EXISTS idx_emp_division ON employees(division_id);

-- ── 7. PAYROLL GROUPS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_groups (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  group_code  TEXT NOT NULL,
  group_name  TEXT NOT NULL,
  description TEXT DEFAULT '',
  status      TEXT DEFAULT 'Active',
  stacode_min INTEGER,
  stacode_max INTEGER,
  created_by  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ── 8. DEDUCTION CODES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deduction_codes (
  dedcode  TEXT PRIMARY KEY,
  type     TEXT DEFAULT '',
  agency   TEXT DEFAULT '',
  dedname  TEXT DEFAULT '',
  active   INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── 9. PAYROLL DEDUCTIONS (employee deductions / loans) ────────────────────
CREATE TABLE IF NOT EXISTS payroll_deductions (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id   TEXT REFERENCES employees(id),
  empno         TEXT DEFAULT '',
  dedcode       TEXT DEFAULT '',
  dedid         TEXT DEFAULT '',
  policyno      TEXT DEFAULT '',
  effmm         INTEGER DEFAULT 0,
  effyy         INTEGER DEFAULT 0,
  termm         INTEGER,
  teryy         INTEGER,
  dedamt        REAL DEFAULT 0,
  principal     REAL DEFAULT 0,
  interest      REAL DEFAULT 0,
  charges       REAL DEFAULT 0,
  proceeds      REAL DEFAULT 0,
  agency        TEXT DEFAULT '',
  status        TEXT DEFAULT 'Active',
  type          TEXT DEFAULT 'Other',
  stacode       TEXT DEFAULT '',
  created_by    TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_by    TEXT DEFAULT '',
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pd_emp     ON payroll_deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_pd_code    ON payroll_deductions(dedcode);
CREATE INDEX IF NOT EXISTS idx_pd_status  ON payroll_deductions(status);

-- ── 10. PAY PERIODS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_periods (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  period_name   TEXT NOT NULL,
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  cutoff_date   TEXT,
  pay_date      TEXT,
  frequency     TEXT DEFAULT 'Monthly',
  status        TEXT DEFAULT 'draft',
  month         INTEGER,
  year          INTEGER,
  period_number INTEGER,
  regcode       TEXT,
  divcode       TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_period ON pay_periods(year, month, COALESCE(regcode,''), COALESCE(divcode,''));

-- ── 11. PAYROLL ENTRIES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_entries (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id       TEXT NOT NULL REFERENCES employees(id),
  pay_period_id     TEXT NOT NULL REFERENCES pay_periods(id),
  gross_pay         REAL DEFAULT 0,
  total_deductions  REAL DEFAULT 0,
  net_pay           REAL DEFAULT 0,
  status            TEXT DEFAULT 'Computed',
  processed_at      TEXT,
  dedlnr            REAL DEFAULT 0,
  dedmed            REAL DEFAULT 0,
  dedpag            REAL DEFAULT 0,
  dedtax            REAL DEFAULT 0,
  other_deductions  REAL DEFAULT 0,
  govtlnr           REAL DEFAULT 0,
  govtecc           REAL DEFAULT 0,
  govtmed           REAL DEFAULT 0,
  govtpag           REAL DEFAULT 0,
  nthp_status       TEXT DEFAULT 'PASS',
  undeducted_amount REAL DEFAULT 0,
  actual_loan_deductions REAL DEFAULT 0,
  gsis_policy_loan       REAL DEFAULT 0,
  gsis_emergency_loan    REAL DEFAULT 0,
  pagibig_mpl            REAL DEFAULT 0,
  pagibig_calamity_loan  REAL DEFAULT 0,
  hazard_pay             REAL DEFAULT 0,
  salary_differential    REAL DEFAULT 0,
  other_compensation     REAL DEFAULT 0,
  other_earnings         REAL DEFAULT 0,
  available_balance      REAL DEFAULT 0,
  mandatory_deductions   REAL DEFAULT 0,
  loan_deduction_capacity REAL DEFAULT 0,
  created_at             TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pe_emp    ON payroll_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_pe_period ON payroll_entries(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_pe_status ON payroll_entries(status);

-- ── 12. UNDEDUCTED OBLIGATIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS undeducted_obligations (
  id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  payroll_entry_id       TEXT REFERENCES payroll_entries(id),
  employee_id            TEXT REFERENCES employees(id),
  pay_period_id          TEXT REFERENCES pay_periods(id),
  deduction_code         TEXT DEFAULT '',
  deduction_description  TEXT DEFAULT '',
  undeducted_amount      REAL DEFAULT 0,
  scheduled_amount       REAL DEFAULT 0,
  station_code           TEXT DEFAULT '',
  reason                 TEXT DEFAULT '',
  created_at             TEXT DEFAULT (datetime('now'))
);

-- ── 13. SALARY SCHEDULE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_schedule (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tranche        TEXT DEFAULT '',
  circular_no    TEXT DEFAULT '',
  effective_date TEXT DEFAULT '',
  grade          INTEGER NOT NULL,
  step           INTEGER NOT NULL,
  monthly_salary REAL DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(grade, step, tranche)
);

-- ── 14. DBF IMPORT TABLES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_stntable (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stacode    TEXT DEFAULT '',
  stn_name   TEXT DEFAULT '',
  stn_addr   TEXT DEFAULT '',
  regcode    TEXT DEFAULT '',
  divcode    TEXT DEFAULT '',
  district   TEXT DEFAULT '',
  cluster    TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dbf_divtable (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  divcode    TEXT DEFAULT '',
  div_name   TEXT DEFAULT '',
  div_addr   TEXT DEFAULT '',
  regcode    TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dbf_included (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stacode       TEXT DEFAULT '',
  empno         TEXT DEFAULT '',
  empname       TEXT DEFAULT '',
  poscode       TEXT DEFAULT '',
  paymode       TEXT DEFAULT '',
  basic         REAL DEFAULT 0,
  status        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dbf_excluded (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stacode       TEXT DEFAULT '',
  regcode       TEXT DEFAULT '',
  empno         TEXT DEFAULT '',
  empname       TEXT DEFAULT '',
  poscode       TEXT DEFAULT '',
  paymode       TEXT DEFAULT '',
  basic         REAL DEFAULT 0,
  status        TEXT DEFAULT '',
  reason        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dbf_payrolls (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stacode       TEXT DEFAULT '',
  empno         TEXT DEFAULT '',
  empname       TEXT DEFAULT '',
  period        TEXT DEFAULT '',
  status        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dbf_pyent (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stacode       TEXT DEFAULT '',
  empno         TEXT DEFAULT '',
  empname       TEXT DEFAULT '',
  amount        REAL DEFAULT 0,
  bank_code     TEXT DEFAULT '',
  account_no    TEXT DEFAULT '',
  period        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dbf_pyent1 (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stacode       TEXT DEFAULT '',
  empno         TEXT DEFAULT '',
  empname       TEXT DEFAULT '',
  amount        REAL DEFAULT 0,
  bank_code     TEXT DEFAULT '',
  account_no    TEXT DEFAULT '',
  period        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dbf_pyent2 (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stacode       TEXT DEFAULT '',
  empno         TEXT DEFAULT '',
  empname       TEXT DEFAULT '',
  amount        REAL DEFAULT 0,
  bank_code     TEXT DEFAULT '',
  account_no    TEXT DEFAULT '',
  period        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ── 15. AUTH & AUDIT ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT,
  user_email  TEXT,
  action      TEXT NOT NULL,
  record_type TEXT,
  record_id   TEXT,
  details     TEXT,   -- JSON
  ip_address  TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email         TEXT,
  user_id       TEXT,
  success       INTEGER DEFAULT 0,
  failure_reason TEXT,
  ip_address    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ── 16. ROLE PERMISSIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  role        TEXT NOT NULL,
  permission  TEXT NOT NULL,
  granted     INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(role, permission)
);

-- ── 17. NON-PLANTILLA EMPLOYEES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS non_plantilla_employees (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  complete_name   TEXT DEFAULT '',
  surname         TEXT DEFAULT '',
  first_name      TEXT DEFAULT '',
  middle_name     TEXT DEFAULT '',
  position        TEXT DEFAULT '',
  tin             TEXT,
  pagibig_number  TEXT,
  philhealth      TEXT,
  landbank        TEXT,
  stacode         TEXT DEFAULT '',
  regcode         TEXT DEFAULT '',
  divcode         TEXT DEFAULT '',
  status          TEXT DEFAULT 'Active',
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ── 18. PLANTILLA POSITIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plantilla_positions (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  position_code   TEXT DEFAULT '',
  position_title  TEXT DEFAULT '',
  salary_grade    INTEGER DEFAULT 0,
  step            INTEGER DEFAULT 0,
  plant_item_no   TEXT DEFAULT '',
  annual_salary   REAL DEFAULT 0,
  monthly_salary  REAL DEFAULT 0,
  stacode         TEXT DEFAULT '',
  status          TEXT DEFAULT 'Active',
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ── 19. POSITION MANAGEMENT ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS position_management (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  position_code   TEXT NOT NULL,
  position_title  TEXT NOT NULL,
  department      TEXT DEFAULT '',
  level           TEXT DEFAULT '',
  salary_range    TEXT DEFAULT '',
  status          TEXT DEFAULT 'Active',
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ── 20. SIGNATORIES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signatories (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  position    TEXT NOT NULL,
  role_type   TEXT DEFAULT '',
  division_id TEXT REFERENCES divisions(id),
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ── 21. PAYROLL DEFINITIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_definitions (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  field_name      TEXT NOT NULL,
  field_label     TEXT NOT NULL,
  field_type      TEXT DEFAULT 'number',
  formula         TEXT DEFAULT '',
  is_active       INTEGER DEFAULT 1,
  sort_order      INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ── 22. PAYROLL ENTRY DEDUCTIONS (per-entry breakdown) ─────────────────────
CREATE TABLE IF NOT EXISTS payroll_entry_deductions (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  payroll_entry_id  TEXT REFERENCES payroll_entries(id),
  deduction_code    TEXT DEFAULT '',
  deduction_name    TEXT DEFAULT '',
  amount            REAL DEFAULT 0,
  agency            TEXT DEFAULT '',
  type              TEXT DEFAULT '',
  priority          INTEGER DEFAULT 0,
  is_undeducted     INTEGER DEFAULT 0,
  reason            TEXT DEFAULT '',
  created_at        TEXT DEFAULT (datetime('now'))
);

-- ── 23. PAYROLL RUN SUMMARIES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_run_summaries (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pay_period_id   TEXT REFERENCES pay_periods(id),
  total_employees INTEGER DEFAULT 0,
  total_gross     REAL DEFAULT 0,
  total_net       REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  status          TEXT DEFAULT 'draft',
  run_at          TEXT DEFAULT (datetime('now')),
  run_by          TEXT
);

-- ── 24. INITIAL PAYROLL ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS initial_payroll_entries (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id     TEXT REFERENCES employees(id),
  pay_period_id   TEXT REFERENCES pay_periods(id),
  basic_salary    REAL DEFAULT 0,
  gross_pay       REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  net_pay         REAL DEFAULT 0,
  absences        INTEGER DEFAULT 0,
  period_covered  TEXT DEFAULT '',
  status          TEXT DEFAULT 'Computed',
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ── 25. COMMUNICATION ALLOWANCE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comm_allowance_employees (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id     TEXT REFERENCES employees(id),
  empno           TEXT DEFAULT '',
  stacode         TEXT DEFAULT '',
  category        TEXT DEFAULT '',
  amount          REAL DEFAULT 0,
  status          TEXT DEFAULT 'Active',
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comm_allowance_payroll (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id     TEXT REFERENCES employees(id),
  pay_period_id   TEXT REFERENCES pay_periods(id),
  gross_pay       REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  net_pay         REAL DEFAULT 0,
  status          TEXT DEFAULT 'Computed',
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ── 26. GSIS IMPORT LOGS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gsis_import_logs (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  file_name     TEXT DEFAULT '',
  file_content  TEXT,
  remark        TEXT DEFAULT '',
  imported_by   TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ── 27. PLI IMPORT LOGS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pli_import_logs (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  file_name     TEXT DEFAULT '',
  file_content  TEXT,
  remark        TEXT DEFAULT '',
  dbf_filename  TEXT DEFAULT '',
  stacode       TEXT DEFAULT '',
  imported_by   TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ── 28. DBF RESTORE HISTORY ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dbf_restore_history (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  file_name   TEXT DEFAULT '',
  table_name  TEXT DEFAULT '',
  row_count   INTEGER DEFAULT 0,
  status      TEXT DEFAULT '',
  user_id     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ── 29. DEDUCTION HISTORY ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deduction_history (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id     TEXT REFERENCES employees(id),
  deduction_code  TEXT DEFAULT '',
  amount          REAL DEFAULT 0,
  change_type     TEXT DEFAULT '',
  changed_by      TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ── 30. STACODE AUDIT ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stacode_audit (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  empno       TEXT DEFAULT '',
  old_stacode TEXT DEFAULT '',
  new_stacode TEXT DEFAULT '',
  changed_by  TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ── 31. GOVERNMENT PAYROLL ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS govt_payroll_entries (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id     TEXT REFERENCES employees(id),
  pay_period_id   TEXT REFERENCES pay_periods(id),
  gsis_premium    REAL DEFAULT 0,
  gsis_policy_loan REAL DEFAULT 0,
  gsis_emergency_loan REAL DEFAULT 0,
  philhealth      REAL DEFAULT 0,
  pagibig_premium REAL DEFAULT 0,
  pagibig_mpl     REAL DEFAULT 0,
  pagibig_calamity REAL DEFAULT 0,
  bir_tax         REAL DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ── 32. SYSTEM SETTINGS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── 33. NOTIFICATIONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT,
  title       TEXT NOT NULL,
  message     TEXT DEFAULT '',
  type        TEXT DEFAULT 'info',
  read        INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ── 34. POLICIES / MEMOS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policies (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title       TEXT NOT NULL,
  content     TEXT DEFAULT '',
  category    TEXT DEFAULT '',
  is_active   INTEGER DEFAULT 1,
  created_by  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ── 35. PAYENT (bank-crediting hashfile) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS payent (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  employee_id   TEXT REFERENCES employees(id),
  empno         TEXT DEFAULT '',
  stacode       TEXT DEFAULT '',
  half          TEXT DEFAULT '',
  amount        REAL DEFAULT 0,
  pay_period_id TEXT REFERENCES pay_periods(id),
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS — keep derived columns in sync (SQLite equivalent of PG triggers)
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-generate complete_name for non_plantilla_employees
CREATE TRIGGER IF NOT EXISTS trg_nonplantilla_upsert
AFTER INSERT ON non_plantilla_employees
BEGIN
  UPDATE non_plantilla_employees
  SET complete_name = trim(
    coalesce(surname, '') || ', ' || coalesce(first_name, '') ||
    CASE WHEN coalesce(middle_name, '') <> '' THEN ' ' || middle_name ELSE '' END
  ),
  tin = nullif(trim(coalesce(tin, '')), ''),
  pagibig_number = nullif(trim(coalesce(pagibig_number, '')), ''),
  philhealth = nullif(trim(coalesce(philhealth, '')), ''),
  landbank = nullif(trim(coalesce(landbank, '')), ''),
  updated_at = datetime('now')
  WHERE id = NEW.id;
END;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA — Default payroll groups (STACODE ranges)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO payroll_groups (id, group_code, group_name, stacode_min, stacode_max, status)
VALUES
  (lower(hex(randomblob(16))), 'ELEM', 'Elementary Payroll', 1, 499, 'Active'),
  (lower(hex(randomblob(16))), 'HIGH', 'High School Payroll', 500, 701, 'Active');

-- Default deduction codes
INSERT OR IGNORE INTO deduction_codes (dedcode, type, agency, dedname, active)
VALUES
  ('0160', 'Loan', 'GSIS', 'GSIS Policy Loan', 1),
  ('0161', 'Loan', 'GSIS', 'GSIS Emergency Loan', 1),
  ('0162', 'Premium', 'GSIS', 'GSIS Premium', 1),
  ('0170', 'Premium', 'PHILHEALTH', 'PhilHealth', 1),
  ('0180', 'Premium', 'HDMF', 'Pag-IBIG Premium', 1),
  ('0181', 'Loan', 'HDMF', 'Pag-IBIG MPL', 1),
  ('0182', 'Loan', 'HDMF', 'Pag-IBIG Calamity Loan', 1),
  ('0068', 'Loan', 'DEPED', 'DEPED Loan', 1),
  ('0216', 'Loan', 'COOPERATIVE', 'Cooperative Loan', 1),
  ('0136', 'Insurance', 'INSURANCE', 'Insurance Premium', 1);
