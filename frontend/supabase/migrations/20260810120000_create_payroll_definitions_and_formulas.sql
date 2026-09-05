/*
# Payroll Definitions & Computation Formulas

## Purpose
Allow super administrators to configure the fields and formulas that make up
the payroll register.  Each "definition" describes a single payroll column
(field_code, label, type, category, default, sort order, computed vs manual).
Each "formula" maps an output field_code to an arithmetic expression that
references other field_codes.

The computation engine evaluates formulas in `computation_order` at payroll-
calc time, enabling fully configurable deduction/earnings logic without code
changes.

## Tables

### payroll_definitions
Stores every payroll field (column) on the register:
- `field_code` unique machine key (e.g. 'gross_pay', 'ded_gsis')
- `field_label` display name
- `field_type` currency | number | text | date | percentage | computed
- `field_category` earnings | mandatory_deductions | voluntary_deductions | ...
- `description` tooltip/help text
- `default_value` initial value for new entries
- `is_required` must be present on every payroll entry
- `is_computed` value derived from formula, not manually editable
- `is_visible` shown on the payroll register UI
- `sort_order` display order within category
- `status` Active | Inactive

### payroll_formulas
Stores computation formulas that produce computed field values:
- `formula_name` human label
- `output_field_code` → payroll_definitions.field_code
- `expression` arithmetic expression referencing field codes
- `computation_order` evaluation order (lower = first)
- `version` schema version for future-proofing
- `is_active` whether the formula is currently used

## Security
- RLS enabled on both tables
- Only super_admin can read/write (via is_super_admin() helper)
- Other roles have no access

## Idempotency
Safe to re-run: uses IF NOT EXISTS and ON CONFLICT DO NOTHING.
*/

-- ── Helper: check super_admin ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- ── Table: payroll_definitions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_definitions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  field_code  text NOT NULL,
  field_label text NOT NULL,
  field_type  text NOT NULL DEFAULT 'currency'
                CHECK (field_type IN ('currency','number','text','date','percentage','computed')),
  field_category text NOT NULL DEFAULT 'earnings'
                CHECK (field_category IN (
                  'earnings','mandatory_deductions','voluntary_deductions',
                  'government_share','tax','net_pay','metadata','adjustments'
                )),
  description  text,
  default_value numeric,
  is_required  boolean NOT NULL DEFAULT false,
  is_computed  boolean NOT NULL DEFAULT false,
  is_visible   boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'Active'
                 CHECK (status IN ('Active','Inactive')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text
);

-- Unique constraint on field_code
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_definitions_field_code_key'
  ) THEN
    ALTER TABLE public.payroll_definitions
      ADD CONSTRAINT payroll_definitions_field_code_key UNIQUE (field_code);
  END IF;
END $$;

-- Index for category + sort order queries
CREATE INDEX IF NOT EXISTS idx_payroll_definitions_category_order
  ON public.payroll_definitions (field_category, sort_order);

-- ── Table: payroll_formulas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_formulas (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  formula_name      text NOT NULL,
  output_field_code text NOT NULL,
  expression        text NOT NULL,
  description       text,
  computation_order integer NOT NULL DEFAULT 0,
  version           integer NOT NULL DEFAULT 1,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        text
);

-- Index for evaluation order
CREATE INDEX IF NOT EXISTS idx_payroll_formulas_computation_order
  ON public.payroll_formulas (computation_order)
  WHERE is_active = true;

-- ── RLS Policies ─────────────────────────────────────────────────────────
ALTER TABLE public.payroll_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_formulas ENABLE ROW LEVEL SECURITY;

-- Drop old policies if re-running
DROP POLICY IF EXISTS "super_admin_manage_payroll_definitions" ON public.payroll_definitions;
DROP POLICY IF EXISTS "super_admin_manage_payroll_formulas" ON public.payroll_formulas;

-- Super admin: full access
CREATE POLICY "super_admin_manage_payroll_definitions"
  ON public.payroll_definitions
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "super_admin_manage_payroll_formulas"
  ON public.payroll_formulas
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── Grants ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_formulas TO authenticated;

-- ── Auto-update updated_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_payroll_def_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_definitions_updated ON public.payroll_definitions;
CREATE TRIGGER trg_payroll_definitions_updated
  BEFORE UPDATE ON public.payroll_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_payroll_def_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_formulas_updated ON public.payroll_formulas;
CREATE TRIGGER trg_payroll_formulas_updated
  BEFORE UPDATE ON public.payroll_formulas
  FOR EACH ROW EXECUTE FUNCTION public.set_payroll_def_updated_at();

-- ── Reload PostgREST schema cache ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
