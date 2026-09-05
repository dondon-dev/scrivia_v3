/*
# Add file content and remark columns to import logs

1. Modified Tables
- `pli_import_logs`: add `file_content` (text, nullable) — stores the raw TXT file content so it can be downloaded later from Import History.
- `pli_import_logs`: add `remark` (text, nullable) — human-readable success/error message for each import.
- `gsis_import_logs`: add `file_content` (text, nullable) — stores the raw TXT file content so it can be downloaded later from Import History.
- `gsis_import_logs`: add `remark` (text, nullable) — human-readable success/error message for each import.

2. Security
- No RLS policy changes — existing policies already cover the new columns.

3. Important Notes
- Both columns are nullable so existing rows are unaffected (they will show no download button and no remark).
- `file_content` uses PostgreSQL `text` type which supports up to 1GB — sufficient for payroll TXT files.
- `remark` stores a plain-English summary like "Successfully imported 150 records" or "Import failed: <error>".
*/

ALTER TABLE pli_import_logs
  ADD COLUMN IF NOT EXISTS file_content text,
  ADD COLUMN IF NOT EXISTS remark text;

ALTER TABLE gsis_import_logs
  ADD COLUMN IF NOT EXISTS file_content text,
  ADD COLUMN IF NOT EXISTS remark text;