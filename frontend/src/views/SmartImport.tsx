import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Upload, AlertTriangle, CheckCircle2, X, Database,
  DatabaseBackup, Download, FileSpreadsheet,
  School, GraduationCap,
} from 'lucide-react';
import LoadingIndicator from '@/components/LoadingIndicator';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/authz';
import { useOrg } from '@/lib/org';
import { supabase, fetchAll, formatError } from '@/lib/pb';
import {
  TABLE_TO_DB,
  previewDbf,
  extractTableName,
  type SyncTableName,
} from '@/lib/syncEngine';
import {
  PRESTORE_PROGRAMS as RESTORE_OPTIONS,
  runRestoreProgram,
  type RestoreOptionDef,
  type StagedRestoreFile,
  type RestoreProgramResult,
} from '@/lib/restoreEngine';
import { encodeDbf, type DbfField, type DbfRecord } from '@/lib/dbf';
import { TABLE_FIELDS } from '@/lib/dbfTemplate';
import { inCategory } from '@/lib/categories';
import { validateFileSignature, validateFileSize } from '@/lib/uploadSecurity';
import { CATEGORIES, type PayrollCategory } from '@/lib/categories';

// ── FoxPro Backup / Restore parity (PBACKRES → PBACKUP / PRESTORE) ──────────
// The legacy menu offered Backup (PBACKUP: PBACKREG/PBACKSUP/PBACKSPE/
// PBACKMAS/PBACKDED/PBACKOTH) and Restore (PRESTORE: PRESTMAS/PRESTDED/
// PRESTOTH). The steps below mirror those programs against the tables this
// database actually maintains:
//
// Backup (COPY FILE table.dbf → disk):
//   1. size estimate — mbytes = reccount() × the table's FoxPro record width
//   2. empty file    — "File has no contents", abort before confirming
//   3. confirm       — "Ready to back-up file? <Y/N>"
//   4. single file   — one .DBF download (the fixed-disk / single-diskette case)
//      multi-diskette — mdisks = int(mbytes/1380000)+1 parts of 7,000 records
//      (DISKBAK chunking: first 7,000, middle 7,000-blocks, last = remainder),
//      each part its own download, taken in order like disk #1, #2, …
//   5. completion    — "Backup complete … label disks properly"
//
// Restore (disk → COPY FILE / APPEND FROM):
//   1. confirm       — "Ready to restore <file>? <Y/N>"
//   2. part 1        — COPY FILE: replaces the table (existing rows cleared)
//   3. parts 2..9    — APPEND FROM: appended in disk order (ndisk is 1–9)
//   4. completion    — "Restore complete. Number of records copied: N"
//      (other databases: "Number of files copied: N")
//
// V3 differences, stated plainly: diskettes and fixed disks become file
// downloads/uploads; the PRESTOTH support files map to the tables V3
// maintains (DIVTABLE/STNTABLE plus the F–J "other" set); SUPPCHKS and
// PROFILES have no V3 collection so those options report nothing to back up;
// DIVTABLE is shared infrastructure, so its restore replaces the whole table
// (the per-category clear used elsewhere refuses shared tables).

type BackupRestoreMode = 'backup' | 'restore';

interface BackupOptionDef {
  key: string;
  label: string;
  legacyProgram: string;
  tables: SyncTableName[];
  missingTables: string[];
}

const BACKUP_OPTIONS: BackupOptionDef[] = [
  { key: 'regular', label: 'Regular Payroll', legacyProgram: 'PBACKREG', tables: ['PAYROLLS'], missingTables: [] },
  { key: 'supplementary', label: 'Supplementary Payroll', legacyProgram: 'PBACKSUP', tables: [], missingTables: ['SUPPCHKS'] },
  { key: 'special', label: 'Special Payroll', legacyProgram: 'PBACKSPE', tables: [], missingTables: ['PROFILES'] },
  { key: 'masterfile', label: 'Masterfile', legacyProgram: 'PBACKMAS', tables: ['MASTFILE'], missingTables: [] },
  { key: 'deduction', label: 'Deduction file', legacyProgram: 'PBACKDED', tables: ['DEDFILE'], missingTables: [] },
  {
    key: 'other', label: 'Other Databases', legacyProgram: 'PBACKOTH',
    tables: ['DIVTABLE', 'STNTABLE', 'INCLUDED', 'EXCLUDED', 'PYENT', 'PYENT1', 'PYENT2'],
    missingTables: ['EMPNFILE', 'RPSIGNER', 'SPSIGNER', 'BANKER'],
  },
];

// ── FoxPro-identical backup layout ──────────────────────────────────────────
// Field layouts dumped byte-for-byte from the G:\Project\scriviacloudV2\FOXPRO
// table headers (name, type, length, decimals, order). The backup writer uses
// THESE — never the V3 sync templates — so every emitted file is
// column-identical to the FoxPro original it replaces. V3-only columns (e.g.
// employees.CATEGORY) are dropped; FoxPro columns with no V3 counterpart
// export blank instead of invented data. The per-table notes below name each
// non-obvious source.
const FOXPRO_BACKUP_FIELDS: Record<string, DbfField[]> = {
  MASTFILE: [
    { name: 'REGCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'DIVCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'STACODE', type: 'C', length: 3, decimals: 0 },
    { name: 'EMPNO', type: 'C', length: 7, decimals: 0 },
    { name: 'ACCOUNT', type: 'C', length: 13, decimals: 0 },
    { name: 'EMPNAME', type: 'C', length: 35, decimals: 0 },
    { name: 'FNAME', type: 'C', length: 20, decimals: 0 },
    { name: 'MI', type: 'C', length: 20, decimals: 0 },
    { name: 'LNAME', type: 'C', length: 20, decimals: 0 },
    { name: 'APPEL', type: 'C', length: 3, decimals: 0 },
    { name: 'POSCODE', type: 'C', length: 4, decimals: 0 },
    { name: 'GRADE', type: 'C', length: 2, decimals: 0 },
    { name: 'STEP', type: 'C', length: 1, decimals: 0 },
    { name: 'BASIC', type: 'N', length: 14, decimals: 2 },
    { name: 'TRANS', type: 'N', length: 8, decimals: 2 },
    { name: 'PERA', type: 'N', length: 8, decimals: 2 },
    { name: 'ACA', type: 'N', length: 8, decimals: 2 },
    { name: 'RATA', type: 'N', length: 8, decimals: 2 },
    { name: 'ONTOP', type: 'N', length: 8, decimals: 2 },
    { name: 'LONG', type: 'N', length: 8, decimals: 2 },
    { name: 'DEDLNR', type: 'N', length: 8, decimals: 2 },
    { name: 'DEDMED', type: 'N', length: 8, decimals: 2 },
    { name: 'DEDTAX', type: 'N', length: 8, decimals: 2 },
    { name: 'DEDPAG', type: 'N', length: 8, decimals: 2 },
    { name: 'NETPAY', type: 'N', length: 9, decimals: 2 },
    { name: 'PAGCODE', type: 'C', length: 1, decimals: 0 },
    { name: 'TAXCODE', type: 'C', length: 2, decimals: 0 },
    { name: 'CIVILSTAT', type: 'C', length: 1, decimals: 0 },
    { name: 'ATTEND', type: 'C', length: 1, decimals: 0 },
    { name: 'STATUS', type: 'C', length: 1, decimals: 0 },
    { name: 'SEX', type: 'C', length: 1, decimals: 0 },
    { name: 'BIRTHDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'TIN', type: 'C', length: 12, decimals: 0 },
    { name: 'GSIS_PN', type: 'C', length: 13, decimals: 0 },
    { name: 'GSIS_ID', type: 'C', length: 10, decimals: 0 },
    { name: 'GOVTLNR', type: 'N', length: 8, decimals: 2 },
    { name: 'GOVTECC', type: 'N', length: 8, decimals: 2 },
    { name: 'GOVTMED', type: 'N', length: 8, decimals: 2 },
    { name: 'GOVTPAG', type: 'N', length: 8, decimals: 2 },
    { name: 'UPDCODE', type: 'C', length: 1, decimals: 0 },
    { name: 'UPDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'PAYDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'EDITOR', type: 'C', length: 8, decimals: 0 },
    { name: 'PAYMODE', type: 'C', length: 1, decimals: 0 },
    { name: 'HIREDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'HDMF_ID', type: 'C', length: 12, decimals: 0 },
    { name: 'PHIC_ID', type: 'C', length: 12, decimals: 0 },
    { name: 'BANKER', type: 'C', length: 3, decimals: 0 },
    { name: 'PIB', type: 'N', length: 8, decimals: 2 },
    { name: 'CLOTHING', type: 'N', length: 8, decimals: 2 },
    { name: 'CASHALLOW', type: 'N', length: 8, decimals: 2 },
    { name: 'MID_BONUS', type: 'N', length: 8, decimals: 2 },
    { name: 'MID_CASH', type: 'N', length: 8, decimals: 2 },
    { name: 'END_BONUS', type: 'N', length: 8, decimals: 2 },
    { name: 'END_CASH', type: 'N', length: 8, decimals: 2 },
    { name: 'ADD_BONUS', type: 'N', length: 8, decimals: 2 },
    { name: 'TAXREF', type: 'N', length: 8, decimals: 2 },
    { name: 'SPECIAL', type: 'N', length: 8, decimals: 2 },
    { name: 'OVER_WHELD', type: 'N', length: 8, decimals: 2 },
    { name: 'EXPOSCODE', type: 'C', length: 4, decimals: 0 },
    { name: 'EXGRADE', type: 'C', length: 2, decimals: 0 },
    { name: 'EXSTEP', type: 'C', length: 1, decimals: 0 },
    { name: 'EXBASIC', type: 'N', length: 9, decimals: 2 },
    { name: 'EXLNR', type: 'N', length: 8, decimals: 2 },
    { name: 'EXMED', type: 'N', length: 8, decimals: 2 },
    { name: 'EXPAG', type: 'N', length: 8, decimals: 2 },
    { name: 'EXTAX', type: 'N', length: 8, decimals: 2 },
    { name: 'EXGLNR', type: 'N', length: 8, decimals: 2 },
    { name: 'EXGMED', type: 'N', length: 8, decimals: 2 },
    { name: 'EXGPAG', type: 'N', length: 8, decimals: 2 },
    { name: 'EXGECC', type: 'N', length: 8, decimals: 2 },
    { name: 'SALDIFF', type: 'N', length: 8, decimals: 2 },
    { name: 'LNRDIFF', type: 'N', length: 8, decimals: 2 },
    { name: 'MEDDIFF', type: 'N', length: 8, decimals: 2 },
    { name: 'PAGDIFF', type: 'N', length: 8, decimals: 2 },
    { name: 'TAXDIFF', type: 'N', length: 8, decimals: 2 },
    { name: 'GLNRDIFF', type: 'N', length: 8, decimals: 2 },
    { name: 'GMEDDIFF', type: 'N', length: 8, decimals: 2 },
    { name: 'GPAGDIFF', type: 'N', length: 8, decimals: 2 },
    { name: 'GECCDIFF', type: 'N', length: 8, decimals: 2 },
    { name: 'DEPNAME1', type: 'C', length: 20, decimals: 0 },
    { name: 'DEPNAME2', type: 'C', length: 20, decimals: 0 },
    { name: 'DEPNAME3', type: 'C', length: 20, decimals: 0 },
    { name: 'DEPNAME4', type: 'C', length: 20, decimals: 0 },
    { name: 'DEPDATE1', type: 'D', length: 8, decimals: 0 },
    { name: 'DEPDATE2', type: 'D', length: 8, decimals: 0 },
    { name: 'DEPDATE3', type: 'D', length: 8, decimals: 0 },
    { name: 'DEPDATE4', type: 'D', length: 8, decimals: 0 },
  ],
  DEDFILE: [
    { name: 'P', type: 'C', length: 1, decimals: 0 },
    { name: 'YY', type: 'C', length: 4, decimals: 0 },
    { name: 'MM', type: 'C', length: 2, decimals: 0 },
    { name: 'DD', type: 'C', length: 2, decimals: 0 },
    { name: 'HR', type: 'C', length: 2, decimals: 0 },
    { name: 'MIN', type: 'C', length: 2, decimals: 0 },
    { name: 'SEC', type: 'C', length: 2, decimals: 0 },
    { name: 'REGCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'DIVCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'STACODE', type: 'C', length: 3, decimals: 0 },
    { name: 'EMPNO', type: 'C', length: 7, decimals: 0 },
    { name: 'FNAME', type: 'C', length: 20, decimals: 0 },
    { name: 'MI', type: 'C', length: 2, decimals: 0 },
    { name: 'LNAME', type: 'C', length: 20, decimals: 0 },
    { name: 'APPEL', type: 'C', length: 3, decimals: 0 },
    { name: 'NETPAY', type: 'N', length: 9, decimals: 2 },
    { name: 'DEDCODE', type: 'C', length: 5, decimals: 0 },
    { name: 'POLICYNO', type: 'C', length: 14, decimals: 0 },
    { name: 'DEDID', type: 'C', length: 2, decimals: 0 },
    { name: 'EFFMM', type: 'C', length: 2, decimals: 0 },
    { name: 'EFFYY', type: 'C', length: 4, decimals: 0 },
    { name: 'TERMM', type: 'C', length: 2, decimals: 0 },
    { name: 'TERYY', type: 'C', length: 4, decimals: 0 },
    { name: 'DEDAMT', type: 'N', length: 8, decimals: 2 },
    { name: 'POLICYDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'AGENT', type: 'C', length: 10, decimals: 0 },
    { name: 'ABSNO', type: 'N', length: 2, decimals: 0 },
    { name: 'UNDERHR', type: 'N', length: 1, decimals: 0 },
    { name: 'UNDERMIN', type: 'N', length: 2, decimals: 0 },
    { name: 'STATUS', type: 'C', length: 1, decimals: 0 },
    { name: 'UPDCODE', type: 'C', length: 1, decimals: 0 },
    { name: 'UPDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'PAYDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'EDITOR', type: 'C', length: 8, decimals: 0 },
    { name: 'PRINCIPAL', type: 'N', length: 10, decimals: 2 },
    { name: 'INTEREST', type: 'N', length: 8, decimals: 2 },
    { name: 'CHARGES', type: 'N', length: 8, decimals: 2 },
    { name: 'PROCEEDS', type: 'N', length: 8, decimals: 2 },
    { name: 'TYPE', type: 'C', length: 1, decimals: 0 },
    { name: 'AGENCY', type: 'C', length: 5, decimals: 0 },
    { name: 'BILL', type: 'C', length: 1, decimals: 0 },
    { name: 'ABMM', type: 'C', length: 2, decimals: 0 },
    { name: 'ABYY', type: 'C', length: 2, decimals: 0 },
    { name: 'OLDCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'HIREDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'BIRTHDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'GSIS_BPN', type: 'C', length: 10, decimals: 0 },
    { name: 'QS', type: 'C', length: 1, decimals: 0 },
    { name: 'ID', type: 'C', length: 3, decimals: 0 },
  ],
  PAYROLLS: [
    { name: 'PAYCODE', type: 'N', length: 1, decimals: 0 },
    { name: 'REGCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'DIVCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'STACODE', type: 'C', length: 3, decimals: 0 },
    { name: 'EMPNO', type: 'C', length: 7, decimals: 0 },
    { name: 'FNAME', type: 'C', length: 15, decimals: 0 },
    { name: 'MI', type: 'C', length: 2, decimals: 0 },
    { name: 'LNAME', type: 'C', length: 15, decimals: 0 },
    { name: 'APPEL', type: 'C', length: 3, decimals: 0 },
    { name: 'BASIC', type: 'N', length: 8, decimals: 2 },
    { name: 'TRANS', type: 'N', length: 8, decimals: 2 },
    { name: 'DEDLNR', type: 'N', length: 8, decimals: 2 },
    { name: 'DEDMED', type: 'N', length: 6, decimals: 2 },
    { name: 'DEDPAG', type: 'N', length: 6, decimals: 2 },
    { name: 'DEDTAX', type: 'N', length: 8, decimals: 2 },
    { name: 'OTHERDED', type: 'N', length: 8, decimals: 2 },
    { name: 'OFFICE', type: 'C', length: 6, decimals: 0 },
    { name: 'ENDING', type: 'C', length: 8, decimals: 0 },
    { name: 'ISSUE', type: 'C', length: 8, decimals: 0 },
    { name: 'CHKNO', type: 'N', length: 10, decimals: 0 },
    { name: 'ONTOP', type: 'N', length: 7, decimals: 2 },
    { name: 'LONG', type: 'N', length: 7, decimals: 2 },
    { name: 'RATA', type: 'N', length: 7, decimals: 2 },
    { name: 'PERA', type: 'N', length: 7, decimals: 2 },
    { name: 'ACA', type: 'N', length: 8, decimals: 2 },
    { name: 'TAKEHOME', type: 'N', length: 8, decimals: 2 },
    { name: 'POSCODE', type: 'C', length: 4, decimals: 0 },
    { name: 'GRADE', type: 'C', length: 2, decimals: 0 },
    { name: 'STEP', type: 'C', length: 1, decimals: 0 },
    { name: 'GOVTLNR', type: 'N', length: 8, decimals: 2 },
    { name: 'GOVTECC', type: 'N', length: 8, decimals: 2 },
    { name: 'GOVTPAG', type: 'N', length: 8, decimals: 2 },
    { name: 'GOVTMED', type: 'N', length: 8, decimals: 2 },
    { name: 'TAXCODE', type: 'C', length: 2, decimals: 0 },
    { name: 'PAYMODE', type: 'C', length: 1, decimals: 0 },
    { name: 'BANK', type: 'C', length: 3, decimals: 0 },
  ],
  INCLUDED: [
    { name: 'P', type: 'C', length: 1, decimals: 0 },
    { name: 'YY', type: 'C', length: 4, decimals: 0 },
    { name: 'MM', type: 'C', length: 2, decimals: 0 },
    { name: 'DD', type: 'C', length: 2, decimals: 0 },
    { name: 'HR', type: 'C', length: 2, decimals: 0 },
    { name: 'MIN', type: 'C', length: 2, decimals: 0 },
    { name: 'SEC', type: 'C', length: 2, decimals: 0 },
    { name: 'TYPE', type: 'C', length: 1, decimals: 0 },
    { name: 'REGCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'DIVCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'STACODE', type: 'C', length: 3, decimals: 0 },
    { name: 'EMPNO', type: 'C', length: 7, decimals: 0 },
    { name: 'FNAME', type: 'C', length: 20, decimals: 0 },
    { name: 'MI', type: 'C', length: 2, decimals: 0 },
    { name: 'LNAME', type: 'C', length: 20, decimals: 0 },
    { name: 'APPEL', type: 'C', length: 3, decimals: 0 },
    { name: 'NETPAY', type: 'N', length: 8, decimals: 2 },
    { name: 'DEDCODE', type: 'C', length: 5, decimals: 0 },
    { name: 'DEDID', type: 'C', length: 2, decimals: 0 },
    { name: 'DEDAMT', type: 'N', length: 8, decimals: 2 },
    { name: 'EFFMM', type: 'C', length: 2, decimals: 0 },
    { name: 'EFFYY', type: 'C', length: 4, decimals: 0 },
    { name: 'TERMM', type: 'C', length: 2, decimals: 0 },
    { name: 'TERYY', type: 'C', length: 4, decimals: 0 },
    { name: 'POLICYNO', type: 'C', length: 14, decimals: 0 },
    { name: 'POLICYDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'AGENT', type: 'C', length: 10, decimals: 0 },
    { name: 'ABSNO', type: 'N', length: 2, decimals: 0 },
    { name: 'UNDERHR', type: 'N', length: 1, decimals: 0 },
    { name: 'UNDERMIN', type: 'N', length: 2, decimals: 0 },
    { name: 'STATUS', type: 'C', length: 1, decimals: 0 },
    { name: 'UPDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'PAYDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'EDITOR', type: 'C', length: 8, decimals: 0 },
    { name: 'TM', type: 'C', length: 2, decimals: 0 },
    { name: 'TY', type: 'C', length: 4, decimals: 0 },
    { name: 'AGENCY', type: 'C', length: 5, decimals: 0 },
    { name: 'PRINCIPAL', type: 'N', length: 9, decimals: 2 },
    { name: 'INTEREST', type: 'N', length: 9, decimals: 2 },
    { name: 'CHARGES', type: 'N', length: 9, decimals: 2 },
    { name: 'PROCEEDS', type: 'N', length: 9, decimals: 2 },
    { name: 'QS', type: 'C', length: 1, decimals: 0 },
  ],
  EXCLUDED: [
    { name: 'P', type: 'C', length: 1, decimals: 0 },
    { name: 'YY', type: 'C', length: 4, decimals: 0 },
    { name: 'MM', type: 'C', length: 2, decimals: 0 },
    { name: 'DD', type: 'C', length: 2, decimals: 0 },
    { name: 'HR', type: 'C', length: 2, decimals: 0 },
    { name: 'MIN', type: 'C', length: 2, decimals: 0 },
    { name: 'SEC', type: 'C', length: 2, decimals: 0 },
    { name: 'TYPE', type: 'C', length: 1, decimals: 0 },
    { name: 'REGCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'DIVCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'STACODE', type: 'C', length: 3, decimals: 0 },
    { name: 'EMPNO', type: 'C', length: 7, decimals: 0 },
    { name: 'FNAME', type: 'C', length: 20, decimals: 0 },
    { name: 'MI', type: 'C', length: 2, decimals: 0 },
    { name: 'LNAME', type: 'C', length: 20, decimals: 0 },
    { name: 'APPEL', type: 'C', length: 3, decimals: 0 },
    { name: 'NETPAY', type: 'N', length: 8, decimals: 2 },
    { name: 'DEDCODE', type: 'C', length: 5, decimals: 0 },
    { name: 'DEDID', type: 'C', length: 2, decimals: 0 },
    { name: 'DEDAMT', type: 'N', length: 8, decimals: 2 },
    { name: 'EFFMM', type: 'C', length: 2, decimals: 0 },
    { name: 'EFFYY', type: 'C', length: 4, decimals: 0 },
    { name: 'TERMM', type: 'C', length: 2, decimals: 0 },
    { name: 'TERYY', type: 'C', length: 4, decimals: 0 },
    { name: 'POLICYNO', type: 'C', length: 14, decimals: 0 },
    { name: 'POLICYDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'AGENT', type: 'C', length: 10, decimals: 0 },
    { name: 'ABSNO', type: 'N', length: 2, decimals: 0 },
    { name: 'UNDERHR', type: 'N', length: 1, decimals: 0 },
    { name: 'UNDERMIN', type: 'N', length: 2, decimals: 0 },
    { name: 'STATUS', type: 'C', length: 1, decimals: 0 },
    { name: 'UPDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'PAYDATE', type: 'D', length: 8, decimals: 0 },
    { name: 'EDITOR', type: 'C', length: 8, decimals: 0 },
    { name: 'TM', type: 'C', length: 2, decimals: 0 },
    { name: 'TY', type: 'C', length: 4, decimals: 0 },
    { name: 'AGENCY', type: 'C', length: 5, decimals: 0 },
    { name: 'PRINCIPAL', type: 'N', length: 9, decimals: 2 },
    { name: 'INTEREST', type: 'N', length: 9, decimals: 2 },
    { name: 'CHARGES', type: 'N', length: 9, decimals: 2 },
    { name: 'PROCEEDS', type: 'N', length: 9, decimals: 2 },
    { name: 'QS', type: 'C', length: 1, decimals: 0 },
  ],
  DIVTABLE: [
    { name: 'REGCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'DIVCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'DIVNAME', type: 'C', length: 20, decimals: 0 },
    { name: 'DIVNAMEL', type: 'C', length: 30, decimals: 0 },
  ],
  STNTABLE: [
    { name: 'REGCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'DIVCODE', type: 'C', length: 3, decimals: 0 },
    { name: 'STACODE', type: 'C', length: 3, decimals: 0 },
    { name: 'STANAME', type: 'C', length: 25, decimals: 0 },
    { name: 'STANAMEL', type: 'C', length: 45, decimals: 0 },
    { name: 'STAPLUS', type: 'C', length: 50, decimals: 0 },
    { name: 'ECTR', type: 'N', length: 6, decimals: 0 },
  ],
  PYENT: [
    { name: 'ACCT_NO', type: 'C', length: 10, decimals: 0 },
    { name: 'ACCT_NAME', type: 'C', length: 40, decimals: 0 },
    { name: 'AMOUNT', type: 'C', length: 15, decimals: 0 },
    { name: 'BRANCH_CD', type: 'C', length: 3, decimals: 0 },
    { name: 'BATCH_NO', type: 'C', length: 5, decimals: 0 },
    { name: 'FILLER', type: 'C', length: 7, decimals: 0 },
  ],
  PYENT1: [
    { name: 'ACCT_NO', type: 'C', length: 10, decimals: 0 },
    { name: 'ACCT_NAME', type: 'C', length: 40, decimals: 0 },
    { name: 'AMOUNT', type: 'C', length: 15, decimals: 0 },
    { name: 'BRANCH_CD', type: 'C', length: 3, decimals: 0 },
    { name: 'BATCH_NO', type: 'C', length: 5, decimals: 0 },
    { name: 'FILLER', type: 'C', length: 7, decimals: 0 },
  ],
  PYENT2: [
    { name: 'ACCT_NO', type: 'C', length: 10, decimals: 0 },
    { name: 'ACCT_NAME', type: 'C', length: 40, decimals: 0 },
    { name: 'AMOUNT', type: 'C', length: 15, decimals: 0 },
    { name: 'BRANCH_CD', type: 'C', length: 3, decimals: 0 },
    { name: 'BATCH_NO', type: 'C', length: 5, decimals: 0 },
    { name: 'FILLER', type: 'C', length: 7, decimals: 0 },
  ],
};
const FOXPRO_FLOPPY_BYTES = 1380000;
const FOXPRO_DISK_CHUNK = 7000;
const FOXPRO_MAX_PARTS = 9;

// mbytes = reccount() × the table's FoxPro record width (1 delete flag + fields).
function estimateTableBytes(tableName: SyncTableName, recordCount: number): number {
  const schema = FOXPRO_BACKUP_FIELDS[tableName] ?? TABLE_FIELDS[tableName] ?? [];
  return recordCount * (schema.reduce((sum, f) => sum + f.length, 0) + 1);
}

interface FoxExportCtx {
  empByNo: Map<string, Record<string, unknown>> | null;
}

// Coerce one DB value into the FoxPro cell type. C fields must be strings —
// the encoder indexes into them, so numbers/objects are stringified.
function foxCell(field: DbfField, raw: unknown): string | number | boolean | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (field.type === 'N') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  if (field.type === 'D') return typeof raw === 'string' ? raw : String(raw);
  return typeof raw === 'string' ? raw : String(raw);
}

function splitTimestamp(iso: unknown): { YY: string; MM: string; DD: string; HR: string; MIN: string; SEC: string } {
  const blank = { YY: '', MM: '', DD: '', HR: '', MIN: '', SEC: '' };
  if (typeof iso !== 'string' || !iso) return blank;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return blank;
  const p = (n: number) => String(n).padStart(2, '0');
  return { YY: String(d.getFullYear()), MM: p(d.getMonth() + 1), DD: p(d.getDate()), HR: p(d.getHours()), MIN: p(d.getMinutes()), SEC: p(d.getSeconds()) };
}

function yyyymmdd(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// Map one V3 database row onto its FoxPro-identical backup record. MASTFILE is
// a straight lowercase-column copy. The rest translate V3's renamed/split
// storage back to legacy names: payroll_deductions.policyno/upcode/dbf_id →
// POLICYNO/UPDCODE/ID, update stamps → P/YY/MM/DD/HR/MIN/SEC + UPDATE,
// dbf_included.policyno/update_date → POLICYNO/UPDATE, dbf_payrolls.totded →
// OTHERDED and gross → TAKEHOME, employee names/position/government/bank
// codes joined by EMPNO for PAYROLLS and the PYENT bank hashfile.
function foxproBackupRow(tableName: SyncTableName, row: Record<string, unknown>, ctx: FoxExportCtx): DbfRecord {
  const schema = FOXPRO_BACKUP_FIELDS[tableName] ?? [];
  const get = (dbCol: string): unknown => row[dbCol] ?? null;
  const emp = (tableName === 'PAYROLLS' || tableName === 'PYENT' || tableName === 'PYENT1' || tableName === 'PYENT2')
    ? ctx.empByNo?.get(String(row.empno ?? '').trim()) ?? null
    : null;
  const empGet = (dbCol: string): unknown => emp?.[dbCol] ?? null;
  const rec: DbfRecord = {};
  const ts = (tableName === 'DEDFILE' || tableName === 'INCLUDED' || tableName === 'EXCLUDED')
    ? splitTimestamp(row.updated_at)
    : null;
  for (const f of schema) {
    let v: unknown;
    if (ts && (f.name === 'YY' || f.name === 'MM' || f.name === 'DD' || f.name === 'HR' || f.name === 'MIN' || f.name === 'SEC')) {
      // Restored file values are written back verbatim (FoxPro COPY FILE
      // semantics) — blanks included. YY anchors the group: its presence
      // means the row came from a file. Rows without it (manual adds,
      // legacy rows) keep the update-stamp fallback.
      const anchor = row['yy'];
      v = (typeof anchor === 'string' && anchor) || anchor === 0
        ? (row[f.name.toLowerCase()] ?? '')
        : ts[f.name as keyof typeof ts];
    } else {
      switch (tableName) {
        case 'DEDFILE':
          switch (f.name) {
            case 'P': v = row['yy'] ? (row['p'] ?? '') : get('p'); break;
            case 'POLICYNO': v = get('policyno'); break;
            case 'GSIS_BPN': v = get('gsis_bpn'); break;
            case 'UPDCODE': v = get('upcode'); break;
            case 'UPDATE': v = get('updated_at'); break;
            case 'AGENT': case 'AGENCY': v = get('agency'); break;
            case 'ID': v = get('dbf_id'); break;
            default: v = get(f.name.toLowerCase());
          }
          break;
        case 'INCLUDED':
        case 'EXCLUDED':
          switch (f.name) {
            case 'P': v = null; break;
            case 'POLICYNO': v = get('policyno'); break;
            case 'UPDATE': v = get('update_date'); break;
            default: v = get(f.name.toLowerCase());
          }
          break;
        case 'PAYROLLS':
          switch (f.name) {
            case 'PAYCODE': { const n = Number(row.paytype); v = Number.isNaN(n) ? null : n; break; }
            case 'FNAME': case 'MI': case 'LNAME': case 'APPEL':
            case 'POSCODE': case 'GRADE': case 'STEP':
            case 'GOVTLNR': case 'GOVTECC': case 'GOVTPAG': case 'GOVTMED':
            case 'TAXCODE': case 'PAYMODE':
              v = empGet(f.name.toLowerCase()); break;
            case 'BANK': v = empGet('banker'); break;
            case 'OTHERDED': v = get('totded'); break;
            case 'OFFICE': case 'CHKNO': case 'LONG': v = null; break;
            case 'ENDING': v = get('payperiod'); break;
            case 'ISSUE': v = yyyymmdd(get('paydate')); break;
            case 'TAKEHOME': v = get('gross'); break;
            default: v = get(f.name.toLowerCase());
          }
          break;
        case 'DIVTABLE':
          switch (f.name) {
            case 'DIVNAME': case 'DIVNAMEL': v = get('divname'); break;
            default: v = get(f.name.toLowerCase());
          }
          break;
        case 'STNTABLE':
          switch (f.name) {
            case 'STANAME': case 'STANAMEL': v = get('staname'); break;
            case 'STAPLUS': v = `${String(get('stacode') ?? '').trim()} ${String(get('staname') ?? '').trim()}`.trim(); break;
            case 'ECTR': v = null; break;
            default: v = get(f.name.toLowerCase());
          }
          break;
        case 'PYENT':
        case 'PYENT1':
        case 'PYENT2': {
          switch (f.name) {
            case 'ACCT_NO': v = get('empno'); break;
            case 'ACCT_NAME': {
              const mi = String(empGet('mi') ?? '').trim();
              const built = `${String(empGet('lname') ?? '').trim()}, ${String(empGet('fname') ?? '').trim()}${mi ? ` ${mi.charAt(0)}` : ''}`.trim();
              v = built.length > 1 ? built : null;
              break;
            }
            case 'AMOUNT': {
              const amt = Number(get('amount'));
              v = Number.isNaN(amt) ? null : String(Math.round(amt * 100)).padStart(15, '0');
              break;
            }
            case 'BRANCH_CD': v = empGet('banker'); break;
            default: v = null;
          }
          break;
        }
        default:
          v = get(f.name.toLowerCase());
      }
    }
    rec[f.name] = foxCell(f, v);
  }
  return rec;
}

// FoxPro Multidisk: mdisks = int(mbytes/1380000)+1; the first (parts-1) disks
// hold 7,000 records each and the last disk holds the remainder.
function splitIntoParts(recordCount: number, byteEstimate: number): number[] {
  if (recordCount === 0) return [];
  const mdisks = Math.floor(byteEstimate / FOXPRO_FLOPPY_BYTES) + 1;
  if (mdisks <= 1) return [recordCount];
  const partCount = Math.min(mdisks, FOXPRO_MAX_PARTS);
  const sizes: number[] = [];
  let remaining = recordCount;
  for (let p = 1; p < partCount && remaining > 0; p++) {
    const take = Math.min(FOXPRO_DISK_CHUNK, remaining);
    sizes.push(take);
    remaining -= take;
  }
  if (remaining > 0) sizes.push(remaining);
  return sizes;
}

function partFileName(tableName: string, partIndex: number): string {
  return partIndex === 0 ? `${tableName}.DBF` : `${tableName}-${String(partIndex + 1).padStart(2, '0')}.DBF`;
}

// Recognize our own backup files: TABLE.DBF (part 1) or TABLE-02.DBF …
// TABLE-09.DBF. The part suffix needs a separator so PYENT1 is never sliced.
function parseRestoreFileName(fileName: string): { tableName: SyncTableName; part: number } | null {
  const direct = extractTableName(fileName);
  if (direct) return { tableName: direct as SyncTableName, part: 1 };
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/i, '').toUpperCase().trim();
  const m = base.match(/^(.*?)[-_ ](?:(?:PART|DISK)-?)?0*([1-9])$/);
  if (!m) return null;
  const table = extractTableName(m[1]);
  if (!table) return null;
  return { tableName: table as SyncTableName, part: Number(m[2]) };
}

function downloadBytes(fileName: string, content: Uint8Array): void {
  // .slice() re-backs the view with a plain ArrayBuffer, which BlobPart requires.
  const blob = new Blob([content.slice()], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface BackupFileSummary {
  tableName: SyncTableName;
  records: number;
  parts: number;
  bytes: number;
}

interface BackupOutcome {
  ok: boolean;
  optionLabel: string;
  message: string;
  files: BackupFileSummary[];
}

export default function SmartImport() {
  const { profile, logAudit } = useAuth();
  const { scopedCodes } = useOrg();
  // The division context of the current restore: when exactly one division is
  // selected, any DBF record that lacks REGCODE/DIVCODE is stamped with these
  // codes so it lands in this division's Employee Records. When viewing a
  // whole region / All Divisions, the file's own codes (if any) are kept.
  const syncScope = useMemo(() => {
    if (scopedCodes && scopedCodes.length === 1) return scopedCodes[0];
    return null;
  }, [scopedCodes]);
  const [category, setCategory] = useState<PayrollCategory>('elementary');
  const [error, setError] = useState<string | null>(null);

  // ── FoxPro Backup / Restore mode (PBACKRES menu) ─────────────────────────
  const [brMode, setBrMode] = useState<BackupRestoreMode>('restore');
  const [backupCounts, setBackupCounts] = useState<Record<string, number | null>>({});
  const [loadingBackupCounts, setLoadingBackupCounts] = useState(false);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [backupResult, setBackupResult] = useState<BackupOutcome | null>(null);
  const [restoreStaged, setRestoreStaged] = useState<Record<string, StagedRestoreFile[]>>({});
  const [restoreBusy, setRestoreBusy] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreProgramResult | null>(null);
  const [restorePeriod, setRestorePeriod] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ kind: 'backup' | 'restore'; optionKey: string } | null>(null);
  const restoreInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const confirmOption = confirmAction
    ? (confirmAction.kind === 'backup'
      ? BACKUP_OPTIONS.find((o) => o.key === confirmAction.optionKey) ?? null
      : RESTORE_OPTIONS.find((o) => o.key === confirmAction.optionKey) ?? null)
    : null;

  // Record counts behind every backup option — the FoxPro "calculating file
  // size" step, refreshed whenever the Backup tab or category changes.
  useEffect(() => {
    if (brMode !== 'backup') return;
    let active = true;
    (async () => {
      setLoadingBackupCounts(true);
      const tables = [...new Set(BACKUP_OPTIONS.flatMap((o) => o.tables))];
      const result: Record<string, number | null> = {};
      for (const t of tables) {
        try {
          const collection = TABLE_TO_DB[t];
          const rows = await fetchAll<{ id: string; stacode?: string | null }>(() =>
            supabase.from(collection).select(t === 'DIVTABLE' ? 'id' : 'id,stacode'),
          );
          result[t] = t === 'DIVTABLE' ? rows.length : rows.filter((r) => inCategory(r.stacode, category)).length;
        } catch {
          result[t] = null;
        }
      }
      if (active) { setBackupCounts(result); setLoadingBackupCounts(false); }
    })();
    return () => { active = false; };
  }, [brMode, category]);

  const backupFileCount = useCallback((option: BackupOptionDef): number =>
    option.tables.reduce((sum, t) => {
      const n = backupCounts[t] ?? 0;
      return sum + splitIntoParts(n, estimateTableBytes(t, n)).length;
    }, 0), [backupCounts]);

  const backupByteTotal = useCallback((option: BackupOptionDef): number =>
    option.tables.reduce((sum, t) => sum + estimateTableBytes(t, backupCounts[t] ?? 0), 0),
  [backupCounts]);

  // FoxPro aborts before the Y/N prompt when the file is empty.
  const requestBackup = useCallback((optionKey: string) => {
    const option = BACKUP_OPTIONS.find((o) => o.key === optionKey);
    if (!option) return;
    setBackupResult(null);
    const unknown = option.tables.some((t) => backupCounts[t] == null);
    const total = option.tables.reduce((sum, t) => sum + (backupCounts[t] ?? 0), 0);
    if (!unknown && total === 0) {
      setBackupResult({
        ok: false, optionLabel: option.label, files: [],
        message: 'File has no contents — backup aborted. There is nothing to write for this option.',
      });
      return;
    }
    setConfirmAction({ kind: 'backup', optionKey });
  }, [backupCounts]);

  const runBackup = useCallback(async (optionKey: string) => {
    const option = BACKUP_OPTIONS.find((o) => o.key === optionKey);
    if (!option) return;
    setConfirmAction(null);
    setBackupBusy(optionKey);
    setBackupResult(null);
    try {
      const files: BackupFileSummary[] = [];
      let totalRecords = 0;
      // PAYROLLS and the PYENT bank files carry employee identity + bank codes
      // that live on the masterfile, so resolve them once per backup run.
      let empByNo: Map<string, Record<string, unknown>> | null = null;
      if (option.tables.some((t) => t === 'PAYROLLS' || t === 'PYENT' || t === 'PYENT1' || t === 'PYENT2')) {
        const empRows = await fetchAll<Record<string, unknown>>(() => supabase.from('employees').select('*'));
        empByNo = new Map(empRows.map((e) => [String(e.empno ?? '').trim(), e]));
      }
      for (const table of option.tables) {
        const collection = TABLE_TO_DB[table];
        const rows = await fetchAll<Record<string, unknown>>(() => supabase.from(collection).select('*'));
        const scoped = table === 'DIVTABLE'
          ? rows
          : rows.filter((r) => inCategory(r.stacode as string | null | undefined, category));
        const fields = FOXPRO_BACKUP_FIELDS[table] ?? [];
        const records = scoped.map((row) => foxproBackupRow(table, row, { empByNo }));
        totalRecords += records.length;
        const estimate = estimateTableBytes(table, records.length);
        const chunks = splitIntoParts(records.length, estimate);
        let offset = 0;
        for (let i = 0; i < chunks.length; i++) {
          const slice = records.slice(offset, offset + chunks[i]);
          offset += chunks[i];
          downloadBytes(partFileName(table, i), encodeDbf(fields, slice));
          if (chunks.length > 1) await sleep(500);
        }
        files.push({ tableName: table, records: records.length, parts: chunks.length, bytes: estimate });
        await logAudit('dbf_backup_create', collection, 'all', {
          backupOption: option.label, legacyProgram: option.legacyProgram,
          table, records: records.length, parts: chunks.length, category,
        });
      }
      if (totalRecords === 0) {
        setBackupResult({
          ok: false, optionLabel: option.label, files,
          message: 'File has no contents — backup aborted. There is nothing to write for this option.',
        });
      } else {
        const fileTotal = files.reduce((sum, f) => sum + f.parts, 0);
        setBackupResult({
          ok: true, optionLabel: option.label, files,
          message: `Back-up complete — ${totalRecords.toLocaleString()} record(s) written to ${fileTotal} DBF file(s). ` +
            'Please label and store the file(s) securely — they contain payroll data. ' +
            (fileTotal > files.length
              ? 'Multi-part backup: keep every part together; restore part 1 first, then the rest in order.'
              : ''),
        });
      }
    } catch (err) {
      setBackupResult({
        ok: false, optionLabel: option?.label ?? optionKey, files: [],
        message: `Backup failed: ${formatError(err)}`,
      });
    } finally {
      setBackupBusy(null);
    }
  }, [category, logAudit]);

  // Stage restore files: validate, then group by table + disk number, exactly
  // the pieces the FoxPro operator would feed in as disk #1, #2, …
  const handleRestoreFiles = useCallback(async (optionKey: string, files: FileList) => {
    const option = RESTORE_OPTIONS.find((o) => o.key === optionKey);
    if (!option) return;
    setRestoreResult(null);
    const staged: StagedRestoreFile[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
      if (ext !== 'dbf') {
        errors.push(`${file.name}: Only .DBF files are accepted.`);
        continue;
      }
      const parsed = parseRestoreFileName(file.name);
      if (!parsed) {
        errors.push(`${file.name}: Not recognized as a ${option.label} backup file (expected ${option.tables.join(', ')} with an optional -02 … -09 part suffix).`);
        continue;
      }
      if (!option.tables.includes(parsed.tableName)) {
        errors.push(`${file.name}: ${parsed.tableName} is not restored by ${option.label} — use the matching restore option.`);
        continue;
      }
      const sizeCheck = validateFileSize(file);
      if (!sizeCheck.valid) { errors.push(`${file.name}: ${sizeCheck.error}`); continue; }
      const sigCheck = await validateFileSignature(file);
      if (!sigCheck.valid) { errors.push(`${file.name}: ${sigCheck.error}`); continue; }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const preview = previewDbf(bytes, file.name, { limit: 5 });
      if (!preview.valid) { errors.push(`${file.name}: ${preview.error}`); continue; }
      const dupe = (restoreStaged[optionKey] ?? []).some((s) => s.tableName === parsed.tableName && s.part === parsed.part)
        || staged.some((s) => s.tableName === parsed.tableName && s.part === parsed.part);
      if (dupe) {
        errors.push(`${file.name}: Duplicate of ${parsed.tableName} part ${parsed.part} — already staged.`);
        continue;
      }
      staged.push({ fileName: file.name, tableName: parsed.tableName, part: parsed.part, bytes, recordCount: preview.recordCount });
    }
    if (staged.length > 0) {
      setRestoreStaged((prev) => ({ ...prev, [optionKey]: [...(prev[optionKey] ?? []), ...staged] }));
    }
    if (errors.length > 0) setError(errors.join('\n'));
  }, [restoreStaged]);

  const handleRestoreFileInput = useCallback((optionKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) void handleRestoreFiles(optionKey, e.target.files);
    e.target.value = '';
  }, [handleRestoreFiles]);

  const removeStagedFile = useCallback((optionKey: string, fileName: string, part: number) => {
    setRestoreStaged((prev) => ({
      ...prev,
      [optionKey]: (prev[optionKey] ?? []).filter((s) => !(s.fileName === fileName && s.part === part)),
    }));
  }, []);

  const requestRestore = useCallback((optionKey: string) => {
    if ((restoreStaged[optionKey] ?? []).length === 0) return;
    setRestoreResult(null);
    setConfirmAction({ kind: 'restore', optionKey });
  }, [restoreStaged]);

  // FoxPro restore (delegated to restoreEngine): part 1 COPY FILEs (replaces
  // the table), parts 2–9 APPEND FROM in disk order, then record counts are
  // reported. PRESTMAS/PRESTDED/PRESTOTH each run through runRestoreProgram.
  const runRestore = useCallback(async (optionKey: string) => {
    const option = RESTORE_OPTIONS.find((o) => o.key === optionKey);
    const staged = restoreStaged[optionKey] ?? [];
    if (!option || staged.length === 0) return;
    setConfirmAction(null);
    setRestoreBusy(optionKey);
    setRestoreResult(null);
    setError(null);
    try {
      const result = await runRestoreProgram(optionKey, staged, {
        category,
        scope: syncScope,
        periodName: restorePeriod.trim() || null,
      });
      for (const t of result.tables) {
        await logAudit('dbf_restore', TABLE_TO_DB[t.tableName], 'all', {
          restoreOption: option.label, legacyProgram: option.legacyProgram,
          table: t.tableName, files: t.files, cleared: t.cleared,
          inserted: t.inserted, updated: t.updated, skipped: t.skipped, reccount: t.reccount, category,
        });
      }
      setRestoreResult(result);
      setRestoreStaged((prev) => ({ ...prev, [optionKey]: [] }));
    } catch (err) {
      setRestoreResult({
        ok: false, optionLabel: option?.label ?? optionKey, legacyProgram: option?.legacyProgram ?? '',
        tables: [], fileCount: 0, recordsCopied: 0,
        message: `Restore failed: ${formatError(err)}`,
      });
    } finally {
      setRestoreBusy(null);
    }
  }, [restoreStaged, restorePeriod, category, syncScope, logAudit]);

  const isAdmin = isSuperAdminRole(profile?.role) || profile?.role === 'payroll_admin';
  const catLabel = CATEGORIES[category].label;
  const catIcon = category === 'elementary' ? School : GraduationCap;
  const CatIcon = catIcon;
  const accentColor = category === 'elementary' ? 'blue' : category === 'highschool' ? 'emerald' : 'slate';
  const accentBg = accentColor === 'blue' ? 'bg-blue-600' : accentColor === 'emerald' ? 'bg-emerald-600' : 'bg-slate-800';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentBg}`}>
          <CatIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Smart Import — {catLabel}</h1>
          <p className="text-sm text-slate-500">
            Upload FoxPro DBF files — records in the {catLabel} stacode range will be imported (STNTABLE imports all stations for both Elementary and High School)
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1">
          <button
            onClick={() => setCategory('elementary')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              category === 'elementary'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <School className="w-4 h-4" /> Elementary
          </button>
          <button
            onClick={() => setCategory('highschool')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              category === 'highschool'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <GraduationCap className="w-4 h-4" /> High School
          </button>
        </div>
      </div>

      {/* FoxPro PBACKRES menu: Restore (PRESTORE) uploads DBF files; Backup (PBACKUP) exports them */}
      <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {([
          { key: 'restore', label: 'Restore', icon: Upload, hint: 'PRESTORE' },
          { key: 'backup', label: 'Backup', icon: DatabaseBackup, hint: 'PBACKUP' },
        ] as const).map((t) => {
          const Icon = t.icon;
          const isActive = brMode === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setBrMode(t.key)}
              title={t.hint}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : ''}`} />
              {t.label}
              <span className="hidden sm:inline text-[10px] font-normal text-slate-400">{t.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1 whitespace-pre-line">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {brMode === 'backup' ? (
      <>
      {/* Backup result banner */}
      {backupResult && (
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm border ${backupResult.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
          {backupResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className="font-semibold">{backupResult.optionLabel}: {backupResult.ok ? 'Back-up complete' : 'Back-up aborted'}</p>
            <p className="whitespace-pre-line mt-0.5">{backupResult.message}</p>
            {backupResult.files.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {backupResult.files.map((f) => (
                  <span key={f.tableName} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-white/70 border border-current/20">
                    {f.tableName} · {f.records.toLocaleString()} rec · {f.parts} file{f.parts !== 1 ? 's' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setBackupResult(null)} className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Backup header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
            <DatabaseBackup className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Backup — PBACKUP</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              FoxPro backup verbs: each option counts its tables, estimates size as reccount × bytes/record,
              then downloads real .DBF file(s) — one file, or 7,000-record diskette-sized parts when the
              estimate passes 1.44&nbsp;MB. Scope: {catLabel} rows only{category ? ' (the other category is untouched)' : ''}; DIVTABLE is shared and backs up whole.
            </p>
          </div>
          {loadingBackupCounts && <LoadingIndicator size={32} />}
        </div>
      </div>

      {/* Backup options — the six PBACKUP verbs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {BACKUP_OPTIONS.map((option) => {
          const unknown = loadingBackupCounts || option.tables.some((t) => backupCounts[t] == null);
          const bytes = backupByteTotal(option);
          const fileCount = backupFileCount(option);
          const busy = backupBusy === option.key;
          return (
            <div key={option.key} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-800">{option.label}</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-500">{option.legacyProgram}</span>
              </div>
              {option.tables.length > 0 ? (
                <div className="space-y-1.5">
                  {option.tables.map((t) => (
                    <div key={t} className="flex items-center justify-between text-xs">
                      <span className="font-mono font-medium text-slate-600">{t}</span>
                      <span className={`tabular-nums ${backupCounts[t] ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {unknown && backupCounts[t] == null ? '…' : `${(backupCounts[t] ?? 0).toLocaleString()} records`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {option.missingTables.join(', ')} {option.missingTables.length === 1 ? 'is' : 'are'} not maintained in this database —
                  nothing to back up (the legacy verb would report “File has no contents”).
                </p>
              )}
              {option.missingTables.length > 0 && option.tables.length > 0 && (
                <p className="text-[11px] text-slate-400 italic">
                  Not carried over: {option.missingTables.join(', ')} (no matching table in this database).
                </p>
              )}
              <div className="flex items-center justify-between pt-1 mt-auto border-t border-slate-100">
                <p className="text-[11px] text-slate-400 tabular-nums">
                  {option.tables.length > 0
                    ? `${bytes.toLocaleString()} bytes · ${fileCount} file${fileCount !== 1 ? 's' : ''}${fileCount > option.tables.length ? ' (7,000-record parts)' : ''}`
                    : 'No files'}
                </p>
                {option.tables.length > 0 && isAdmin && (
                  <button
                    onClick={() => requestBackup(option.key)}
                    disabled={backupBusy !== null}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {busy ? <LoadingIndicator size={28} /> : <Download className="w-3.5 h-3.5" />}
                    {busy ? 'Backing up…' : 'Back Up'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!isAdmin && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Only administrators can create backups.</span>
        </div>
      )}
      </>
      ) : (
      <>
      {/* Restore result banner */}
      {restoreResult && (
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm border ${restoreResult.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {restoreResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className="font-semibold">{restoreResult.optionLabel}: {restoreResult.ok ? 'Restore complete' : 'Restore did not complete'}</p>
            <p className="whitespace-pre-line mt-0.5">{restoreResult.message}</p>
            {restoreResult.tables.length > 0 && (
              <div className="mt-2 overflow-x-auto rounded-lg border border-current/20 bg-white/60">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="opacity-70">
                      <th className="text-left font-medium px-2 py-1">Table</th>
                      <th className="text-right font-medium px-2 py-1">Files</th>
                      <th className="text-right font-medium px-2 py-1">Cleared</th>
                      <th className="text-right font-medium px-2 py-1">Inserted</th>
                      <th className="text-right font-medium px-2 py-1">Updated</th>
                      <th className="text-right font-medium px-2 py-1">Skipped</th>
                      <th className="text-right font-medium px-2 py-1">Errors</th>
                      <th className="text-right font-medium px-2 py-1">Records</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-current/10">
                    {restoreResult.tables.map((t) => (
                      <tr key={t.tableName}>
                        <td className="px-2 py-1 font-mono font-medium">{t.tableName}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{t.files}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{t.cleared == null ? '—' : t.cleared.toLocaleString()}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{t.inserted.toLocaleString()}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{t.updated.toLocaleString()}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{t.skipped.toLocaleString()}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{t.errors}</td>
                        <td className="px-2 py-1 text-right tabular-nums font-medium">{t.reccount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <button onClick={() => setRestoreResult(null)} className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Restore header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Restore — PRESTORE</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              FoxPro restore verbs: upload a backup .DBF (or every -02 … -09 part in one go). The first file
              of each table <span className="font-semibold text-slate-700">replaces</span> current data — existing rows are cleared first —
              and extra parts are appended in order, up to 9. Scope: {catLabel} rows only; DIVTABLE restore
              replaces the whole shared table. This cannot be undone — back up first.
            </p>
          </div>
        </div>
      </div>

      {/* Restore options — the three PRESTORE verbs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {RESTORE_OPTIONS.map((option) => {
          const staged = restoreStaged[option.key] ?? [];
          const busy = restoreBusy === option.key;
          const needsPeriod = staged.some((s) => ['INCLUDED', 'EXCLUDED', 'PAYROLLS'].includes(s.tableName));
          return (
            <div key={option.key} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-800">{option.label}</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-500">{option.legacyProgram}</span>
              </div>
              <p className="text-xs text-slate-500">{option.note}</p>
              <div className="flex flex-wrap gap-1.5">
                {option.tables.map((t) => (
                  <span key={t} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600">{t}</span>
                ))}
              </div>
              {staged.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5 bg-slate-50">
                  {[...staged].sort((a, b) => a.tableName.localeCompare(b.tableName) || a.part - b.part).map((s) => (
                    <div key={`${s.tableName}-${s.part}-${s.fileName}`} className="flex items-center gap-2 text-xs">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-slate-600 truncate flex-1" title={s.fileName}>{s.fileName}</span>
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-100 text-blue-700">
                        {s.tableName}{s.part > 1 ? ` · part ${s.part}` : ''}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">{s.recordCount.toLocaleString()} rec</span>
                      <button onClick={() => removeStagedFile(option.key, s.fileName, s.part)} className="shrink-0 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {needsPeriod && (
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Pay Period:</label>
                  <input
                    type="text"
                    value={restorePeriod}
                    onChange={(e) => setRestorePeriod(e.target.value)}
                    placeholder="e.g. August 2026, 08-2026, etc."
                    className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1 mt-auto border-t border-slate-100">
                <button
                  onClick={() => restoreInputRefs.current[option.key]?.click()}
                  disabled={!isAdmin || busy || restoreBusy !== null}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> Select File(s)
                </button>
                <input
                  ref={(el) => { restoreInputRefs.current[option.key] = el; }}
                  type="file" multiple accept=".DBF,.dbf"
                  onChange={(e) => handleRestoreFileInput(option.key, e)}
                  className="hidden"
                />
                {isAdmin && (
                  <button
                    onClick={() => requestRestore(option.key)}
                    disabled={staged.length === 0 || busy || restoreBusy !== null}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {busy ? <LoadingIndicator size={28} /> : <Database className="w-3.5 h-3.5" />}
                    {busy ? 'Restoring…' : 'Restore'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!isAdmin && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Only administrators can restore backups. Restoring replaces live data.</span>
        </div>
      )}
      </>
      )}

      {/* Backup / Restore confirmation — the FoxPro "Ready to … ? <Y/N>" prompt */}
      {confirmAction && confirmOption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${confirmAction.kind === 'backup' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                {confirmAction.kind === 'backup'
                  ? <DatabaseBackup className="w-5 h-5 text-emerald-600" />
                  : <Upload className="w-5 h-5 text-blue-600" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {confirmAction.kind === 'backup' ? `Ready to back-up ${confirmOption.label}?` : `Ready to restore ${confirmOption.label}?`}
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  {confirmAction.kind === 'backup'
                    ? (confirmOption as BackupOptionDef).legacyProgram
                    : (confirmOption as RestoreOptionDef).legacyProgram} · {catLabel}
                </p>
              </div>
            </div>
            {confirmAction.kind === 'backup' && (confirmOption as BackupOptionDef).tables.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-slate-200 p-3 bg-slate-50 mb-4 text-xs">
                {(confirmOption as BackupOptionDef).tables.map((t) => {
                  const n = backupCounts[t] ?? 0;
                  const parts = splitIntoParts(n, estimateTableBytes(t, n)).length;
                  return (
                    <div key={t} className="flex items-center justify-between">
                      <span className="font-mono font-medium text-slate-600">{t}</span>
                      <span className="text-slate-500 tabular-nums">{n.toLocaleString()} records → {parts} file{parts !== 1 ? 's' : ''}</span>
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-400 pt-1">This downloads real .DBF file(s). Label and store them securely.</p>
              </div>
            )}
            {confirmAction.kind === 'restore' && (
              <div className="space-y-1.5 rounded-lg border border-amber-200 p-3 bg-amber-50 mb-4 text-xs">
                {(restoreStaged[confirmAction.optionKey] ?? []).map((s) => (
                  <div key={`${s.tableName}-${s.part}-${s.fileName}`} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-600 truncate">{s.fileName}</span>
                    <span className="shrink-0 text-slate-500">{s.tableName}{s.part > 1 ? ` · part ${s.part}` : ' · replaces table'}</span>
                  </div>
                ))}
                <p className="text-[11px] text-amber-700 pt-1 font-medium">
                  The first file of each table replaces current data (existing rows are cleared first); extra parts append. This cannot be undone.
                </p>
              </div>
            )}
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel (N)
              </button>
              <button
                onClick={() => {
                  if (confirmAction.kind === 'backup') void runBackup(confirmAction.optionKey);
                  else void runRestore(confirmAction.optionKey);
                }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
                  confirmAction.kind === 'backup' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmAction.kind === 'backup' ? 'Back Up (Y)' : 'Restore (Y)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
