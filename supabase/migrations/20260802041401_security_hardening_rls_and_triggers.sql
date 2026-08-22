-- ============================================================================
-- SECURITY HARDENING: Role-based RLS + Column-level privileges + Audit triggers
-- ============================================================================

-- ── Helper: get_current_user_role already exists from prior migration ──

-- ============================================================================
-- 1. PROFILES: Column-level privileges — prevent self-escalation
-- ============================================================================

GRANT UPDATE ON profiles TO authenticated;

CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT p.role INTO v_role FROM profiles p WHERE p.id = auth.uid();
  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not authorized to change role';
  END IF;
  IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
    RAISE EXCEPTION 'Not authorized to change MFA settings';
  END IF;
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
    RAISE EXCEPTION 'Not authorized to change email verification status';
  END IF;
  IF NEW.failed_login_attempts IS DISTINCT FROM OLD.failed_login_attempts THEN
    RAISE EXCEPTION 'Not authorized to change login attempt count';
  END IF;
  IF NEW.locked_until IS DISTINCT FROM OLD.locked_until THEN
    RAISE EXCEPTION 'Not authorized to unlock accounts';
  END IF;
  IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    RAISE EXCEPTION 'Not authorized to change login timestamp';
  END IF;
  IF NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip THEN
    RAISE EXCEPTION 'Not authorized to change login IP';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_profile_columns();

-- ============================================================================
-- 2. SECURITY DEFINER FUNCTIONS for privileged mutations
-- ============================================================================

CREATE OR REPLACE FUNCTION set_user_role(p_target_user uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_current_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_new_role NOT IN ('super_admin', 'payroll_admin', 'encoder', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT role INTO v_target_current_role FROM profiles WHERE id = p_target_user;
  IF v_target_current_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF p_target_user = auth.uid() AND p_new_role != 'super_admin' THEN
    RAISE EXCEPTION 'Cannot demote yourself';
  END IF;

  UPDATE profiles SET role = p_new_role WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_role_change', 'profile', p_target_user,
         jsonb_build_object('old_role', v_target_current_role, 'new_role', p_new_role)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION set_user_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION set_user_mfa(p_target_user uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_target_user = auth.uid() THEN
    RAISE EXCEPTION 'Cannot toggle your own MFA';
  END IF;

  UPDATE profiles SET mfa_enabled = p_enabled WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_mfa_toggle', 'profile', p_target_user,
         jsonb_build_object('mfa_enabled', p_enabled)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION set_user_mfa(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION set_user_mfa(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION unlock_user_account(p_target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE profiles
    SET failed_login_attempts = 0, locked_until = NULL
    WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_account_unlock', 'profile', p_target_user, NULL
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION unlock_user_account(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION unlock_user_account(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION mark_email_verified()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Email not confirmed by auth provider';
  END IF;

  UPDATE profiles SET email_verified = true WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_email_verified() FROM anon;
GRANT EXECUTE ON FUNCTION mark_email_verified() TO authenticated;

CREATE OR REPLACE FUNCTION post_payroll(p_pay_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_violation_count integer;
  v_entry_count integer;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'payroll_admin') THEN
    RAISE EXCEPTION 'Not authorized to post payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'Pay period is already closed';
  END IF;

  SELECT count(*) INTO v_violation_count
    FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND net_pay < 5000;

  IF v_violation_count > 0 THEN
    RAISE EXCEPTION 'NTHP violation: % entries have net pay below 5000', v_violation_count;
  END IF;

  SELECT count(*) INTO v_entry_count
    FROM payroll_entries WHERE pay_period_id = p_pay_period_id;

  IF v_entry_count = 0 THEN
    RAISE EXCEPTION 'No payroll entries to post';
  END IF;

  UPDATE payroll_entries
    SET status = 'Posted'
    WHERE pay_period_id = p_pay_period_id;

  UPDATE pay_periods
    SET status = 'closed'
    WHERE id = p_pay_period_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_approve', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries', v_entry_count)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_posted', v_entry_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION post_payroll(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION post_payroll(uuid) TO authenticated;

-- ============================================================================
-- 3. PAYROLL IMMUTABILITY: Triggers to prevent modification of posted entries
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_posted_entry_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();

  IF v_caller_role = 'super_admin' AND TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.gross_pay IS DISTINCT FROM OLD.gross_pay
         OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
         OR NEW.net_pay IS DISTINCT FROM OLD.net_pay
         OR NEW.dedlnr IS DISTINCT FROM OLD.dedlnr
         OR NEW.dedmed IS DISTINCT FROM OLD.dedmed
         OR NEW.dedpag IS DISTINCT FROM OLD.dedpag
         OR NEW.dedtax IS DISTINCT FROM OLD.dedtax
         OR NEW.actual_loan_deductions IS DISTINCT FROM OLD.actual_loan_deductions
         OR NEW.undeducted_amount IS DISTINCT FROM OLD.undeducted_amount
         OR NEW.nthp_status IS DISTINCT FROM OLD.nthp_status THEN
        RAISE EXCEPTION 'Cannot modify financial data on a posted entry';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Cannot modify a posted payroll entry without changing status';
  END IF;

  RAISE EXCEPTION 'Posted payroll entries are locked';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_posted_entries ON payroll_entries;
CREATE TRIGGER trg_protect_posted_entries
  BEFORE UPDATE OR DELETE ON payroll_entries
  FOR EACH ROW
  WHEN (OLD.status = 'Posted')
  EXECUTE FUNCTION prevent_posted_entry_modification();

CREATE OR REPLACE FUNCTION prevent_closed_period_reopen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();

  IF v_caller_role = 'super_admin' AND NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cannot reopen a closed pay period';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_closed_periods ON pay_periods;
CREATE TRIGGER trg_protect_closed_periods
  BEFORE UPDATE ON pay_periods
  FOR EACH ROW
  WHEN (OLD.status = 'closed')
  EXECUTE FUNCTION prevent_closed_period_reopen();

-- ============================================================================
-- 4. ROLE-BASED RLS POLICIES on all payroll tables
-- ============================================================================

CREATE OR REPLACE FUNCTION has_role_level(p_min_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (
      (p_min_role = 'viewer' AND role IN ('viewer', 'encoder', 'payroll_admin', 'super_admin'))
      OR (p_min_role = 'encoder' AND role IN ('encoder', 'payroll_admin', 'super_admin'))
      OR (p_min_role = 'payroll_admin' AND role IN ('payroll_admin', 'super_admin'))
      OR (p_min_role = 'super_admin' AND role = 'super_admin')
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION has_role_level(text) FROM anon;
GRANT EXECUTE ON FUNCTION has_role_level(text) TO authenticated;

-- ── employees ──
DROP POLICY IF EXISTS "employees_select" ON employees;
DROP POLICY IF EXISTS "employees_insert" ON employees;
DROP POLICY IF EXISTS "employees_update" ON employees;
DROP POLICY IF EXISTS "employees_delete" ON employees;

CREATE POLICY "employees_select" ON employees FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "employees_insert" ON employees FOR INSERT
  TO authenticated WITH CHECK (has_role_level('encoder'));
CREATE POLICY "employees_update" ON employees FOR UPDATE
  TO authenticated USING (has_role_level('encoder'))
  WITH CHECK (has_role_level('encoder'));
CREATE POLICY "employees_delete" ON employees FOR DELETE
  TO authenticated USING (has_role_level('payroll_admin'));

-- ── pay_periods ──
DROP POLICY IF EXISTS "pay_periods_select" ON pay_periods;
DROP POLICY IF EXISTS "pay_periods_insert" ON pay_periods;
DROP POLICY IF EXISTS "pay_periods_update" ON pay_periods;
DROP POLICY IF EXISTS "pay_periods_delete" ON pay_periods;

CREATE POLICY "pay_periods_select" ON pay_periods FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "pay_periods_insert" ON pay_periods FOR INSERT
  TO authenticated WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "pay_periods_update" ON pay_periods FOR UPDATE
  TO authenticated USING (has_role_level('payroll_admin'))
  WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "pay_periods_delete" ON pay_periods FOR DELETE
  TO authenticated USING (has_role_level('super_admin'));

-- ── payroll_entries ──
DROP POLICY IF EXISTS "payroll_entries_select" ON payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_insert" ON payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_update" ON payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_delete" ON payroll_entries;

CREATE POLICY "payroll_entries_select" ON payroll_entries FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "payroll_entries_insert" ON payroll_entries FOR INSERT
  TO authenticated WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "payroll_entries_update" ON payroll_entries FOR UPDATE
  TO authenticated USING (has_role_level('payroll_admin'))
  WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "payroll_entries_delete" ON payroll_entries FOR DELETE
  TO authenticated USING (has_role_level('payroll_admin'));

-- ── earnings ──
DROP POLICY IF EXISTS "earnings_select" ON earnings;
DROP POLICY IF EXISTS "earnings_insert" ON earnings;
DROP POLICY IF EXISTS "earnings_update" ON earnings;
DROP POLICY IF EXISTS "earnings_delete" ON earnings;

CREATE POLICY "earnings_select" ON earnings FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "earnings_insert" ON earnings FOR INSERT
  TO authenticated WITH CHECK (has_role_level('encoder'));
CREATE POLICY "earnings_update" ON earnings FOR UPDATE
  TO authenticated USING (has_role_level('encoder'))
  WITH CHECK (has_role_level('encoder'));
CREATE POLICY "earnings_delete" ON earnings FOR DELETE
  TO authenticated USING (has_role_level('payroll_admin'));

-- ── deductions ──
DROP POLICY IF EXISTS "deductions_select" ON deductions;
DROP POLICY IF EXISTS "deductions_insert" ON deductions;
DROP POLICY IF EXISTS "deductions_update" ON deductions;
DROP POLICY IF EXISTS "deductions_delete" ON deductions;

CREATE POLICY "deductions_select" ON deductions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "deductions_insert" ON deductions FOR INSERT
  TO authenticated WITH CHECK (has_role_level('encoder'));
CREATE POLICY "deductions_update" ON deductions FOR UPDATE
  TO authenticated USING (has_role_level('encoder'))
  WITH CHECK (has_role_level('encoder'));
CREATE POLICY "deductions_delete" ON deductions FOR DELETE
  TO authenticated USING (has_role_level('payroll_admin'));

-- ── salary_schedule ──
DROP POLICY IF EXISTS "salary_schedule_select" ON salary_schedule;
DROP POLICY IF EXISTS "salary_schedule_insert" ON salary_schedule;
DROP POLICY IF EXISTS "salary_schedule_update" ON salary_schedule;
DROP POLICY IF EXISTS "salary_schedule_delete" ON salary_schedule;

CREATE POLICY "salary_schedule_select" ON salary_schedule FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "salary_schedule_insert" ON salary_schedule FOR INSERT
  TO authenticated WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "salary_schedule_update" ON salary_schedule FOR UPDATE
  TO authenticated USING (has_role_level('payroll_admin'))
  WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "salary_schedule_delete" ON salary_schedule FOR DELETE
  TO authenticated USING (has_role_level('super_admin'));

-- ── payroll_deductions ──
DROP POLICY IF EXISTS "payroll_deductions_select" ON payroll_deductions;
DROP POLICY IF EXISTS "payroll_deductions_insert" ON payroll_deductions;
DROP POLICY IF EXISTS "payroll_deductions_update" ON payroll_deductions;
DROP POLICY IF EXISTS "payroll_deductions_delete" ON payroll_deductions;

CREATE POLICY "payroll_deductions_select" ON payroll_deductions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "payroll_deductions_insert" ON payroll_deductions FOR INSERT
  TO authenticated WITH CHECK (has_role_level('encoder'));
CREATE POLICY "payroll_deductions_update" ON payroll_deductions FOR UPDATE
  TO authenticated USING (has_role_level('encoder'))
  WITH CHECK (has_role_level('encoder'));
CREATE POLICY "payroll_deductions_delete" ON payroll_deductions FOR DELETE
  TO authenticated USING (has_role_level('payroll_admin'));

-- ── deduction_codes ──
DROP POLICY IF EXISTS "deduction_codes_select" ON deduction_codes;
DROP POLICY IF EXISTS "deduction_codes_insert" ON deduction_codes;
DROP POLICY IF EXISTS "deduction_codes_update" ON deduction_codes;
DROP POLICY IF EXISTS "deduction_codes_delete" ON deduction_codes;

CREATE POLICY "deduction_codes_select" ON deduction_codes FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "deduction_codes_insert" ON deduction_codes FOR INSERT
  TO authenticated WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "deduction_codes_update" ON deduction_codes FOR UPDATE
  TO authenticated USING (has_role_level('payroll_admin'))
  WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "deduction_codes_delete" ON deduction_codes FOR DELETE
  TO authenticated USING (has_role_level('super_admin'));

-- ── undeducted_obligations ──
DROP POLICY IF EXISTS "undeducted_obligations_select" ON undeducted_obligations;
DROP POLICY IF EXISTS "undeducted_obligations_insert" ON undeducted_obligations;
DROP POLICY IF EXISTS "undeducted_obligations_update" ON undeducted_obligations;
DROP POLICY IF EXISTS "undeducted_obligations_delete" ON undeducted_obligations;

CREATE POLICY "undeducted_obligations_select" ON undeducted_obligations FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "undeducted_obligations_insert" ON undeducted_obligations FOR INSERT
  TO authenticated WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "undeducted_obligations_update" ON undeducted_obligations FOR UPDATE
  TO authenticated USING (has_role_level('payroll_admin'))
  WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "undeducted_obligations_delete" ON undeducted_obligations FOR DELETE
  TO authenticated USING (has_role_level('payroll_admin'));

-- ── payroll_groups ──
DROP POLICY IF EXISTS "payroll_groups_select" ON payroll_groups;
DROP POLICY IF EXISTS "payroll_groups_insert" ON payroll_groups;
DROP POLICY IF EXISTS "payroll_groups_update" ON payroll_groups;
DROP POLICY IF EXISTS "payroll_groups_delete" ON payroll_groups;

CREATE POLICY "payroll_groups_select" ON payroll_groups FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "payroll_groups_insert" ON payroll_groups FOR INSERT
  TO authenticated WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "payroll_groups_update" ON payroll_groups FOR UPDATE
  TO authenticated USING (has_role_level('payroll_admin'))
  WITH CHECK (has_role_level('payroll_admin'));
CREATE POLICY "payroll_groups_delete" ON payroll_groups FOR DELETE
  TO authenticated USING (has_role_level('super_admin'));

-- ── stacode_audit: remove DELETE, restrict writes to encoder+ ──
DROP POLICY IF EXISTS "stacode_audit_select" ON stacode_audit;
DROP POLICY IF EXISTS "stacode_audit_insert" ON stacode_audit;
DROP POLICY IF EXISTS "stacode_audit_update" ON stacode_audit;
DROP POLICY IF EXISTS "stacode_audit_delete" ON stacode_audit;

CREATE POLICY "stacode_audit_select" ON stacode_audit FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "stacode_audit_insert" ON stacode_audit FOR INSERT
  TO authenticated WITH CHECK (has_role_level('encoder'));

-- ============================================================================
-- 5. CHECK CONSTRAINTS on financial columns
-- ============================================================================
ALTER TABLE employees ADD CONSTRAINT chk_employees_basic CHECK (basic >= 0);
ALTER TABLE employees ADD CONSTRAINT chk_employees_netpay CHECK (netpay >= 0);
ALTER TABLE payroll_entries ADD CONSTRAINT chk_payroll_gross CHECK (gross_pay >= 0);
ALTER TABLE payroll_entries ADD CONSTRAINT chk_payroll_net CHECK (net_pay >= 0);
ALTER TABLE payroll_entries ADD CONSTRAINT chk_payroll_total_ded CHECK (total_deductions >= 0);
ALTER TABLE payroll_entries ADD CONSTRAINT chk_payroll_actual_loans CHECK (actual_loan_deductions >= 0);
ALTER TABLE payroll_entries ADD CONSTRAINT chk_payroll_undeducted CHECK (undeducted_amount >= 0);

-- ============================================================================
-- 6. AUTOMATIC AUDIT TRIGGER for sensitive table changes
-- ============================================================================

CREATE OR REPLACE FUNCTION log_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_user_email text;
  v_record_id text;
BEGIN
  v_action := TG_ARGV[0];
  v_record_id := COALESCE(NEW.id::text, OLD.id::text);

  SELECT email INTO v_user_email FROM profiles WHERE id = auth.uid();

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    v_user_email,
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'old', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      'new', CASE WHEN TG_OP IN ('Insert','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_employees ON employees;
CREATE TRIGGER trg_audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION log_table_change('employee_modify');

DROP TRIGGER IF EXISTS trg_audit_payroll_entries ON payroll_entries;
CREATE TRIGGER trg_audit_payroll_entries
  AFTER INSERT OR UPDATE OR DELETE ON payroll_entries
  FOR EACH ROW EXECUTE FUNCTION log_table_change('payroll_entry_modify');

DROP TRIGGER IF EXISTS trg_audit_salary_schedule ON salary_schedule;
CREATE TRIGGER trg_audit_salary_schedule
  AFTER INSERT OR UPDATE OR DELETE ON salary_schedule
  FOR EACH ROW EXECUTE FUNCTION log_table_change('salary_schedule_modify');

DROP TRIGGER IF EXISTS trg_audit_payroll_deductions ON payroll_deductions;
CREATE TRIGGER trg_audit_payroll_deductions
  AFTER INSERT OR UPDATE OR DELETE ON payroll_deductions
  FOR EACH ROW EXECUTE FUNCTION log_table_change('payroll_deduction_modify');

DROP TRIGGER IF EXISTS trg_audit_deduction_codes ON deduction_codes;
CREATE TRIGGER trg_audit_deduction_codes
  AFTER INSERT OR UPDATE OR DELETE ON deduction_codes
  FOR EACH ROW EXECUTE FUNCTION log_table_change('deduction_code_modify');

DROP TRIGGER IF EXISTS trg_audit_payroll_groups ON payroll_groups;
CREATE TRIGGER trg_audit_payroll_groups
  AFTER INSERT OR UPDATE OR DELETE ON payroll_groups
  FOR EACH ROW EXECUTE FUNCTION log_table_change('payroll_group_modify');

DROP TRIGGER IF EXISTS trg_audit_pay_periods ON pay_periods;
CREATE TRIGGER trg_audit_pay_periods
  AFTER INSERT OR UPDATE OR DELETE ON pay_periods
  FOR EACH ROW EXECUTE FUNCTION log_table_change('pay_period_modify');

-- ============================================================================
-- 7. RESTRICT audit_logs INSERT to authenticated users logging their own actions
-- ============================================================================
DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
