/*
# Add dbf_filename column to pli_import_logs

1. Modified Tables
- `pli_import_logs`
  - Added `dbf_filename` (text, nullable) — stores the DEDFILE.DBF filename when a DBF file is uploaded alongside or instead of ADD.txt.

2. Notes
- Non-destructive: adds a nullable column, no data loss.
*/

ALTER TABLE pli_import_logs ADD COLUMN IF NOT EXISTS dbf_filename text;
