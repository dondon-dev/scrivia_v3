-- payroll_run_summaries: one row per pay period summarizing a payroll run

CREATE TABLE IF NOT EXISTS public.payroll_run_summaries (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pay_period_id     uuid NOT NULL REFERENCES public.pay_periods(id) ON DELETE CASCADE UNIQUE,
  employee_count    int NOT NULL DEFAULT 0,
  total_gross       numeric(16,2) NOT NULL DEFAULT 0,
  total_deductions  numeric(16,2) NOT NULL DEFAULT 0,
  total_net         numeric(16,2) NOT NULL DEFAULT 0,
  nthp_pass_count   int NOT NULL DEFAULT 0,
  nthp_fail_count   int NOT NULL DEFAULT 0,
  total_undeducted  numeric(16,2) NOT NULL DEFAULT 0,
  processed_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_run_summaries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prs_select' AND tablename = 'payroll_run_summaries') THEN
    CREATE POLICY prs_select ON public.payroll_run_summaries FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prs_insert' AND tablename = 'payroll_run_summaries') THEN
    CREATE POLICY prs_insert ON public.payroll_run_summaries FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.payroll_run_summaries TO authenticated;
