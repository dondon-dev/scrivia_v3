-- payroll_entry_deductions: itemized deduction lines written by run_payroll_engine
-- Each row is one deduction record (dedcode, dedname, dedamt) linked to a payroll entry.

CREATE TABLE IF NOT EXISTS public.payroll_entry_deductions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_entry_id uuid NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  dedcode     text NOT NULL DEFAULT '',
  dedname     text NOT NULL DEFAULT '',
  dedamt      numeric(14,2) NOT NULL DEFAULT 0,
  ded_status  text NOT NULL DEFAULT 'Active',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ped_entry ON public.payroll_entry_deductions(payroll_entry_id);

ALTER TABLE public.payroll_entry_deductions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ped_select' AND tablename = 'payroll_entry_deductions') THEN
    CREATE POLICY ped_select ON public.payroll_entry_deductions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ped_insert' AND tablename = 'payroll_entry_deductions') THEN
    CREATE POLICY ped_insert ON public.payroll_entry_deductions FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ped_delete' AND tablename = 'payroll_entry_deductions') THEN
    CREATE POLICY ped_delete ON public.payroll_entry_deductions FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

GRANT ALL ON public.payroll_entry_deductions TO authenticated;
