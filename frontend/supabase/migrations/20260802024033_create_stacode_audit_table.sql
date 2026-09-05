/*
# STACODE Correction Audit Trail

## Purpose
Log every STACODE correction for accountability. Records:
- Employee number
- Old STACODE value
- New STACODE value
- Date/time of change
- User who made the change (system/user identifier)

## Changes

### 1. New Table: `stacode_audit`
Columns:
- `id` (uuid, PK)
- `employee_id` (uuid, references employees ON DELETE CASCADE)
- `employee_no` (text) — denormalized for reporting even if employee is deleted
- `old_stacode` (text) — value before correction
- `new_stacode` (text) — value after correction
- `old_group_code` (text) — payroll group code before, or 'Unassigned'
- `new_group_code` (text) — payroll group code after, or 'Unassigned'
- `changed_by` (text) — user identifier (default 'system')
- `changed_at` (timestamptz, default now())
- `reason` (text) — optional note

### 2. Security
- RLS enabled with anon+authenticated full CRUD (single-tenant, no auth)
*/

CREATE TABLE IF NOT EXISTS stacode_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  employee_no text NOT NULL DEFAULT '',
  old_stacode text NOT NULL DEFAULT '',
  new_stacode text NOT NULL DEFAULT '',
  old_group_code text NOT NULL DEFAULT 'Unassigned',
  new_group_code text NOT NULL DEFAULT 'Unassigned',
  changed_by text NOT NULL DEFAULT 'system',
  changed_at timestamptz DEFAULT now(),
  reason text NOT NULL DEFAULT ''
);

ALTER TABLE stacode_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_stacode_audit" ON stacode_audit;
CREATE POLICY "anon_select_stacode_audit" ON stacode_audit FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_stacode_audit" ON stacode_audit;
CREATE POLICY "anon_insert_stacode_audit" ON stacode_audit FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_stacode_audit" ON stacode_audit;
CREATE POLICY "anon_delete_stacode_audit" ON stacode_audit FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_stacode_audit_employee ON stacode_audit(employee_id);
CREATE INDEX IF NOT EXISTS idx_stacode_audit_changed_at ON stacode_audit(changed_at DESC);
