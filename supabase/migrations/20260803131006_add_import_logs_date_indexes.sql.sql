/*
# Add Indexes on Import Log created_at Columns

## Problem
The Dashboard queries gsis_import_logs and pli_import_logs with
.gte('created_at', todayStart) and .gte('created_at', monthStart).
The only existing indexes are on (uploaded_by_id, created_at DESC),
which helps when filtering by user but not when filtering by date alone
(which is what the admin Dashboard does).

## Fix
Add indexes on created_at DESC for both tables so the date-range
queries can use an index scan instead of a sequential scan.

## Security
No changes to policies or table structure. Indexes only.
*/

CREATE INDEX IF NOT EXISTS idx_gsis_import_logs_created_at
  ON gsis_import_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pli_import_logs_created_at
  ON pli_import_logs (created_at DESC);