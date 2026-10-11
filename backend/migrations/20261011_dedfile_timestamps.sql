-- DEDFILE FoxPro-identical restore: preserve the file's own timestamp/system
-- columns (P, YY, MM, DD, HR, MIN, SEC) plus the file row ID, instead of
-- regenerating them from the current clock on import/display/export.
--
-- FoxPro reference (G:\Project\scriviacloudV2\FOXPRO\PRESTDED.PRG / RESTDEDF.PRG):
--   part 1 = COPY FILE (byte-identical replace, original values kept)
--   parts 2..9 = APPEND FROM in order
-- These columns carry the original values so Restore and Smart Import stay
-- identical to the selected file.
--
-- payroll_deductions follows the NOT NULL DEFAULT '' convention used by the
-- rest of that table while deductions uses nullable TEXT like its siblings

-- payroll_deductions (the DEDFILE masterfile shown in the Dedfile grid)
ALTER TABLE "payroll_deductions" ADD COLUMN "p" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payroll_deductions" ADD COLUMN "yy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payroll_deductions" ADD COLUMN "mm" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payroll_deductions" ADD COLUMN "dd" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payroll_deductions" ADD COLUMN "hr" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payroll_deductions" ADD COLUMN "min" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payroll_deductions" ADD COLUMN "sec" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payroll_deductions" ADD COLUMN "dbf_id" TEXT NOT NULL DEFAULT '';

-- deductions (per-period rows forwarded from DEDFILE by Smart Import)
ALTER TABLE "deductions" ADD COLUMN "p" TEXT;
ALTER TABLE "deductions" ADD COLUMN "yy" TEXT;
ALTER TABLE "deductions" ADD COLUMN "mm" TEXT;
ALTER TABLE "deductions" ADD COLUMN "dd" TEXT;
ALTER TABLE "deductions" ADD COLUMN "hr" TEXT;
ALTER TABLE "deductions" ADD COLUMN "min" TEXT;
ALTER TABLE "deductions" ADD COLUMN "sec" TEXT;
ALTER TABLE "deductions" ADD COLUMN "dbf_id" TEXT;
