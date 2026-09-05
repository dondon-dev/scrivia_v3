/*
# Add dbf_filename column to gsis_import_logs

1. Modified Tables
- `gsis_import_logs`
  - Added `dbf_filename` (text, nullable) — stores the DEDFILE.DBF filename when a DBF file is uploaded alongside or instead of the GSIS TXT file.

2. Notes
- Non-destructive: adds a nullable column, no data loss.
*/

ALTER TABLE gsis_import_logs ADD COLUMN IF NOT EXISTS dbf_filename text;
