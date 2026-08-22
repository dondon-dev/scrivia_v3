-- ============================================================
-- SQL CLEANUP — remove what is not needed, keep behavior identical
--
-- An audit of the live schema found:
--   * 24 groups of EXACT duplicate indexes (28 redundant indexes)
--     — every write to payroll_deductions was updating 3 copies of
--     the empno/status/dedcode indexes; audit_logs, deductions,
--     earnings, payroll_entries, undeducted_obligations and others
--     had 2 copies each. Dropping the duplicates keeps the same
--     query plans (an identical index remains) and speeds up every
--     INSERT/UPDATE/DELETE.
--   * duplicate RLS policies on security_events (two INSERT and two
--     SELECT policies with identical predicates).
--   * dead functions:
--       - run_payroll_bulk(uuid, jsonb, jsonb, jsonb) — superseded
--         by run_payroll_engine(uuid); the app now calls only the
--         engine, so the two payroll-formula implementations become
--         one.
--       - query_payroll_deductions(6-arg) — the app uses the scoped
--         10-arg overload only.
--       - get_dashboard_metrics() — orphaned (nothing references it).
--
-- No tables, columns, constraints, computation formulas, or data are
-- changed. Constraint-backed indexes (unique/PK) are never dropped.
-- ============================================================

-- ── 1) Drop duplicate indexes (a functionally identical index stays) ──
DROP INDEX IF EXISTS public.idx_audit_action;                          -- keep idx_audit_logs_action
DROP INDEX IF EXISTS public.idx_audit_user;                            -- keep idx_audit_logs_user_id
DROP INDEX IF EXISTS public.idx_dbf_restore_history_user;              -- keep idx_dbf_restore_history_user_id
DROP INDEX IF EXISTS public.idx_deduction_codes_dedcode;               -- dedcode is the PK
DROP INDEX IF EXISTS public.idx_deductions_code;                       -- keep idx_deductions_deduction_code
DROP INDEX IF EXISTS public.idx_deductions_employee;                   -- keep idx_deductions_employee_id
DROP INDEX IF EXISTS public.idx_deductions_period;                     -- keep idx_deductions_pay_period_id
DROP INDEX IF EXISTS public.idx_earnings_employee;                     -- keep idx_earnings_employee_id
DROP INDEX IF EXISTS public.idx_earnings_period;                       -- keep idx_earnings_pay_period_id
DROP INDEX IF EXISTS public.idx_employees_payroll_group;               -- keep idx_employees_payroll_group_id
DROP INDEX IF EXISTS public.idx_employees_employee_number;             -- keep employees_employee_number_key (unique)
DROP INDEX IF EXISTS public.idx_ips_employees_employee_id;             -- keep ips_employees_employee_id_key (unique)
DROP INDEX IF EXISTS public.idx_pd_empno;                              -- keep idx_payroll_deductions_empno
DROP INDEX IF EXISTS public.idx_payroll_deds_empno;                    -- keep idx_payroll_deductions_empno
DROP INDEX IF EXISTS public.idx_pd_status;                             -- keep idx_payroll_deductions_status
DROP INDEX IF EXISTS public.idx_payroll_deds_status;                   -- keep idx_payroll_deductions_status
DROP INDEX IF EXISTS public.idx_pd_dedcode;                            -- keep idx_payroll_deductions_dedcode
DROP INDEX IF EXISTS public.idx_payroll_deds_dedcode;                  -- keep idx_payroll_deductions_dedcode
DROP INDEX IF EXISTS public.idx_pd_type;                               -- keep idx_payroll_deductions_type
DROP INDEX IF EXISTS public.idx_pd_employee_id;                        -- keep idx_payroll_deductions_employee_id
DROP INDEX IF EXISTS public.idx_payroll_deds_employee;                 -- keep idx_payroll_deductions_employee_id
DROP INDEX IF EXISTS public.idx_payroll_entries_period;                -- keep idx_payroll_entries_pay_period_id
DROP INDEX IF EXISTS public.idx_payroll_entries_emp;                   -- keep idx_payroll_entries_employee_id
DROP INDEX IF EXISTS public.idx_payroll_groups_group_code;             -- keep payroll_groups_group_code_key (unique)
DROP INDEX IF EXISTS public.idx_plantilla_pos_item;                    -- keep idx_plantilla_positions_item_number
DROP INDEX IF EXISTS public.idx_profiles_email;                        -- keep profiles_email_key (unique)
DROP INDEX IF EXISTS public.idx_undeducted_obligations_period;         -- keep idx_undeducted_obligations_pay_period_id
DROP INDEX IF EXISTS public.idx_undeducted_obligations_employee;       -- keep idx_undeducted_obligations_employee_id

-- ── 2) Drop duplicate security_events policies (identical predicates) ──
DROP POLICY IF EXISTS "insert_security_events" ON public.security_events;  -- keep security_events_insert
DROP POLICY IF EXISTS "select_security_events" ON public.security_events;  -- keep security_events_select

-- ── 3) Drop dead functions ──
DROP FUNCTION IF EXISTS public.run_payroll_bulk(uuid, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.query_payroll_deductions(text, text, text, integer, integer, boolean);
DROP FUNCTION IF EXISTS public.get_dashboard_metrics();

-- Reload PostgREST's schema cache so dropped signatures vanish immediately.
NOTIFY pgrst, 'reload schema';
