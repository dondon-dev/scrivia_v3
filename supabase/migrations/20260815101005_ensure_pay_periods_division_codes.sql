/*
# Pre-add regcode/divcode to pay_periods

Migration 20260815101011 (scope_dashboard_current_period) references
pay_periods.regcode and pay_periods.divcode, but those columns are added
by the later migration 20260815101014 (scope_pay_periods_by_division).

This migration adds the columns early so the shadow-database replay during
`supabase db pull` / `supabase db reset` doesn't fail.

The columns are added with IF NOT EXISTS so 20260815101014 is a harmless no-op.
*/

ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS regcode text;
ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS divcode text;
