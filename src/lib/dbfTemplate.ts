/**
 * DBF Template — Single source of truth for all 10 supported legacy FoxPro
 * tables used by SCRIVIA Cloud. Every import (Smart Import, DBF Restore),
 * export (Reports, DBF Export), and sync engine references this module.
 *
 * To add or modify a DBF table, edit ONLY this file. All consumers
 * (syncEngine, RestoreData, SmartImport, reports, BackupRestore) will
 * pick up the change automatically.
 */

import type { DbfField } from './dbf';

// ── Canonical table definitions ────────────────────────────────────────────

export interface DbfTableTemplate {
  /** Uppercase DBF filename base (without .dbf extension) */
  name: string;
  /** Human-readable label shown in the UI */
  label: string;
  /** Short description of what this table contains */
  description: string;
  /** The PostgreSQL table this DBF maps to */
  dbTable: string;
  /** DBF field schema for import/export */
  fields: DbfField[];
  /** Filename aliases that should be recognized (e.g. MASTERFILE → MASTFILE) */
  aliases?: string[];
}

// ── Table: STNTABLE ──
const STNTABLE: DbfTableTemplate = {
  name: 'STNTABLE',
  label: 'Station / School Table',
  description: 'Station assignments and school locations',
  dbTable: 'dbf_stntable',
  fields: [
    { name: 'REGCODE',    type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',    type: 'C', length: 3,  decimals: 0 },
    { name: 'STACODE',    type: 'C', length: 3,  decimals: 0 },
    { name: 'SCHNAME',    type: 'C', length: 50, decimals: 0 },
    { name: 'SCHADDR',    type: 'C', length: 80, decimals: 0 },
    { name: 'SCHHEAD',    type: 'C', length: 35, decimals: 0 },
    { name: 'SCHTYPE',    type: 'C', length: 10, decimals: 0 },
    { name: 'STATUS',     type: 'C', length: 1,  decimals: 0 },
  ],
};

// ── Table: DIVTABLE ──
const DIVTABLE: DbfTableTemplate = {
  name: 'DIVTABLE',
  label: 'Division Table',
  description: 'Division office information and codes',
  dbTable: 'dbf_divtable',
  fields: [
    { name: 'REGCODE',    type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',    type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVNAME',    type: 'C', length: 50, decimals: 0 },
    { name: 'REGNAME',    type: 'C', length: 50, decimals: 0 },
    { name: 'STATUS',     type: 'C', length: 1,  decimals: 0 },
  ],
};

// ── Table: MASTFILE ──
const MASTFILE: DbfTableTemplate = {
  name: 'MASTFILE',
  label: 'Employee Masterfile',
  description: 'Employee master records (primary key: EMPNO)',
  dbTable: 'employees',
  aliases: ['MASTERFILE', 'MASTER', 'EMPLOYEES'],
  fields: [
    { name: 'REGCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'STACODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'EMPNO',     type: 'C', length: 7,  decimals: 0 },
    { name: 'ACCOUNT',   type: 'C', length: 13, decimals: 0 },
    { name: 'EMPNAME',   type: 'C', length: 35, decimals: 0 },
    { name: 'FNAME',     type: 'C', length: 20, decimals: 0 },
    { name: 'MI',        type: 'C', length: 20, decimals: 0 },
    { name: 'LNAME',     type: 'C', length: 20, decimals: 0 },
    { name: 'APPEL',     type: 'C', length: 3,  decimals: 0 },
    { name: 'POSCODE',   type: 'C', length: 4,  decimals: 0 },
    { name: 'GRADE',     type: 'C', length: 2,  decimals: 0 },
    { name: 'STEP',      type: 'C', length: 1,  decimals: 0 },
    { name: 'BASIC',     type: 'N', length: 14, decimals: 2 },
    { name: 'TRANS',     type: 'N', length: 8,  decimals: 2 },
    { name: 'PERA',      type: 'N', length: 8,  decimals: 2 },
    { name: 'ACA',       type: 'N', length: 8,  decimals: 2 },
    { name: 'RATA',      type: 'N', length: 8,  decimals: 2 },
    { name: 'ONTOP',     type: 'N', length: 8,  decimals: 2 },
    { name: 'LONG',      type: 'N', length: 8,  decimals: 2 },
    { name: 'DEDLNR',    type: 'N', length: 8,  decimals: 2 },
    { name: 'DEDMED',    type: 'N', length: 8,  decimals: 2 },
    { name: 'DEDTAX',    type: 'N', length: 8,  decimals: 2 },
    { name: 'DEDPAG',    type: 'N', length: 8,  decimals: 2 },
    { name: 'NETPAY',    type: 'N', length: 8,  decimals: 2 },
    { name: 'PAGCODE',   type: 'C', length: 1,  decimals: 0 },
    { name: 'TAXCODE',   type: 'C', length: 2,  decimals: 0 },
    { name: 'CIVILSTAT', type: 'C', length: 1,  decimals: 0 },
    { name: 'ATTEND',    type: 'C', length: 1,  decimals: 0 },
    { name: 'STATUS',    type: 'C', length: 1,  decimals: 0 },
    { name: 'SEX',       type: 'C', length: 1,  decimals: 0 },
    { name: 'BIRTHDATE', type: 'D', length: 8,  decimals: 0 },
    { name: 'TIN',       type: 'C', length: 12, decimals: 0 },
    { name: 'GSIS_PN',   type: 'C', length: 13, decimals: 0 },
    { name: 'GSIS_ID',   type: 'C', length: 10, decimals: 0 },
    { name: 'GOVTLNR',   type: 'N', length: 8,  decimals: 2 },
    { name: 'GOVTECC',   type: 'N', length: 8,  decimals: 2 },
    { name: 'GOVTMED',   type: 'N', length: 8,  decimals: 2 },
    { name: 'GOVTPAG',   type: 'N', length: 8,  decimals: 2 },
    { name: 'UPDCODE',   type: 'C', length: 1,  decimals: 0 },
    { name: 'UPDATE',    type: 'D', length: 8,  decimals: 0 },
    { name: 'PAYDATE',   type: 'D', length: 8,  decimals: 0 },
    { name: 'EDITOR',    type: 'C', length: 8,  decimals: 0 },
    { name: 'PAYMODE',   type: 'C', length: 1,  decimals: 0 },
    { name: 'HIREDATE',  type: 'D', length: 8,  decimals: 0 },
    { name: 'HDMF_ID',   type: 'C', length: 12, decimals: 0 },
    { name: 'PHIC_ID',   type: 'C', length: 12, decimals: 0 },
    { name: 'BANKER',    type: 'C', length: 3,  decimals: 0 },
    { name: 'PIB',       type: 'N', length: 8,  decimals: 2 },
    { name: 'CLOTHING',  type: 'N', length: 8,  decimals: 2 },
    { name: 'CASHALLOW', type: 'N', length: 8,  decimals: 2 },
    { name: 'MID_BONUS', type: 'N', length: 8,  decimals: 2 },
    { name: 'MID_CASH',  type: 'N', length: 8,  decimals: 2 },
    { name: 'END_BONUS', type: 'N', length: 8,  decimals: 2 },
    { name: 'END_CASH',  type: 'N', length: 8,  decimals: 2 },
    { name: 'ADD_BONUS', type: 'N', length: 8,  decimals: 2 },
    { name: 'TAXREF',    type: 'N', length: 8,  decimals: 2 },
    { name: 'SPECIAL',   type: 'N', length: 8,  decimals: 2 },
    { name: 'OVER_WHELD',type: 'N', length: 8,  decimals: 2 },
    { name: 'EXPOSCODE', type: 'C', length: 4,  decimals: 0 },
    { name: 'EXGRADE',   type: 'C', length: 2,  decimals: 0 },
    { name: 'EXSTEP',    type: 'C', length: 1,  decimals: 0 },
    { name: 'EXBASIC',   type: 'N', length: 8,  decimals: 2 },
    { name: 'EXLNR',     type: 'N', length: 8,  decimals: 2 },
    { name: 'EXMED',     type: 'N', length: 8,  decimals: 2 },
    { name: 'EXPAG',     type: 'N', length: 8,  decimals: 2 },
    { name: 'EXTAX',     type: 'N', length: 8,  decimals: 2 },
    { name: 'EXGLNR',    type: 'N', length: 8,  decimals: 2 },
    { name: 'EXGMED',    type: 'N', length: 8,  decimals: 2 },
    { name: 'EXGPAG',    type: 'N', length: 8,  decimals: 2 },
    { name: 'EXGECC',    type: 'N', length: 8,  decimals: 2 },
    { name: 'SALDIFF',   type: 'N', length: 8,  decimals: 2 },
    { name: 'LNRDIFF',   type: 'N', length: 8,  decimals: 2 },
    { name: 'MEDDIFF',   type: 'N', length: 8,  decimals: 2 },
    { name: 'PAGDIFF',   type: 'N', length: 8,  decimals: 2 },
    { name: 'TAXDIFF',   type: 'N', length: 8,  decimals: 2 },
    { name: 'GLNRDIFF',  type: 'N', length: 8,  decimals: 2 },
    { name: 'GMEDDIFF',  type: 'N', length: 8,  decimals: 2 },
    { name: 'GPAGDIFF',  type: 'N', length: 8,  decimals: 2 },
    { name: 'GECCDIFF',  type: 'N', length: 8,  decimals: 2 },
    { name: 'DEPNAME1',  type: 'C', length: 20, decimals: 0 },
    { name: 'DEPNAME2',  type: 'C', length: 20, decimals: 0 },
    { name: 'DEPNAME3',  type: 'C', length: 20, decimals: 0 },
    { name: 'DEPNAME4',  type: 'C', length: 20, decimals: 0 },
    { name: 'DEPDATE1',  type: 'D', length: 8,  decimals: 0 },
    { name: 'DEPDATE2',  type: 'D', length: 8,  decimals: 0 },
    { name: 'DEPDATE3',  type: 'D', length: 8,  decimals: 0 },
    { name: 'DEPDATE4',  type: 'D', length: 8,  decimals: 0 },
    { name: 'CATEGORY',  type: 'C', length: 20, decimals: 0 },
  ],
};

// ── Table: INCLUDED ──
const INCLUDED: DbfTableTemplate = {
  name: 'INCLUDED',
  label: 'Payroll Inclusions',
  description: 'Employees included in specific payroll runs',
  dbTable: 'dbf_included',
  fields: [
    { name: 'EMPNO',     type: 'C', length: 7,  decimals: 0 },
    { name: 'PERIOD',    type: 'C', length: 6,  decimals: 0 },
    { name: 'TYPE',      type: 'C', length: 1,  decimals: 0 },
    { name: 'REGCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'STACODE',   type: 'C', length: 3,  decimals: 0 },
  ],
};

// ── Table: EXCLUDED ──
const EXCLUDED: DbfTableTemplate = {
  name: 'EXCLUDED',
  label: 'Payroll Exclusions',
  description: 'Employees excluded from payroll runs',
  dbTable: 'dbf_excluded',
  fields: [
    { name: 'EMPNO',     type: 'C', length: 7,  decimals: 0 },
    { name: 'PERIOD',    type: 'C', length: 6,  decimals: 0 },
    { name: 'TYPE',      type: 'C', length: 1,  decimals: 0 },
    { name: 'REGCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'STACODE',   type: 'C', length: 3,  decimals: 0 },
  ],
};

// ── Table: DEDFILE ──
const DEDFILE: DbfTableTemplate = {
  name: 'DEDFILE',
  label: 'Deduction File',
  description: 'Per-employee deduction records keyed by EMPNO + DEDCODE',
  dbTable: 'payroll_deductions',
  aliases: ['DEDUCTIONS', 'DEDUCTION'],
  fields: [
    { name: 'P',          type: 'C', length: 1,  decimals: 0 },
    { name: 'YY',         type: 'C', length: 4,  decimals: 0 },
    { name: 'MM',         type: 'C', length: 2,  decimals: 0 },
    { name: 'DD',         type: 'C', length: 2,  decimals: 0 },
    { name: 'HR',         type: 'C', length: 2,  decimals: 0 },
    { name: 'MIN',        type: 'C', length: 2,  decimals: 0 },
    { name: 'SEC',        type: 'C', length: 2,  decimals: 0 },
    { name: 'REGCODE',    type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',    type: 'C', length: 3,  decimals: 0 },
    { name: 'STACODE',    type: 'C', length: 3,  decimals: 0 },
    { name: 'EMPNO',      type: 'C', length: 7,  decimals: 0 },
    { name: 'FNAME',      type: 'C', length: 20, decimals: 0 },
    { name: 'MI',         type: 'C', length: 2,  decimals: 0 },
    { name: 'LNAME',      type: 'C', length: 20, decimals: 0 },
    { name: 'APPEL',      type: 'C', length: 3,  decimals: 0 },
    { name: 'NETPAY',     type: 'N', length: 8,  decimals: 2 },
    { name: 'DEDCODE',    type: 'C', length: 5,  decimals: 0 },
    { name: 'POLICYNO',   type: 'C', length: 14, decimals: 0 },
    { name: 'DEDID',      type: 'C', length: 2,  decimals: 0 },
    { name: 'EFFMM',      type: 'C', length: 2,  decimals: 0 },
    { name: 'EFFYY',      type: 'C', length: 4,  decimals: 0 },
    { name: 'TERMM',      type: 'C', length: 2,  decimals: 0 },
    { name: 'TERYY',      type: 'C', length: 4,  decimals: 0 },
    { name: 'DEDAMT',     type: 'N', length: 8,  decimals: 2 },
    { name: 'POLICYDATE', type: 'D', length: 8,  decimals: 0 },
    { name: 'AGENT',      type: 'C', length: 10, decimals: 0 },
    { name: 'ABSNO',      type: 'N', length: 2,  decimals: 0 },
    { name: 'UNDERHR',    type: 'N', length: 1,  decimals: 0 },
    { name: 'UNDERMIN',   type: 'N', length: 2,  decimals: 0 },
    { name: 'STATUS',     type: 'C', length: 1,  decimals: 0 },
    { name: 'UPDCODE',    type: 'C', length: 1,  decimals: 0 },
    { name: 'UPDATE',     type: 'D', length: 8,  decimals: 0 },
    { name: 'PAYDATE',    type: 'D', length: 8,  decimals: 0 },
    { name: 'EDITOR',     type: 'C', length: 8,  decimals: 0 },
    { name: 'PRINCIPAL',  type: 'N', length: 10, decimals: 2 },
    { name: 'INTEREST',   type: 'N', length: 8,  decimals: 2 },
    { name: 'CHARGES',    type: 'N', length: 8,  decimals: 2 },
    { name: 'PROCEEDS',   type: 'N', length: 8,  decimals: 2 },
    { name: 'TYPE',       type: 'C', length: 1,  decimals: 0 },
    { name: 'AGENCY',     type: 'C', length: 5,  decimals: 0 },
    { name: 'BILL',       type: 'C', length: 1,  decimals: 0 },
    { name: 'ABMM',       type: 'C', length: 2,  decimals: 0 },
    { name: 'ABYY',       type: 'C', length: 2,  decimals: 0 },
    { name: 'OLDCODE',    type: 'C', length: 3,  decimals: 0 },
    { name: 'HIREDATE',   type: 'D', length: 8,  decimals: 0 },
    { name: 'BIRTHDATE',  type: 'D', length: 8,  decimals: 0 },
    { name: 'GSIS_BPN',   type: 'C', length: 10, decimals: 0 },
    { name: 'QS',         type: 'C', length: 1,  decimals: 0 },
    { name: 'ID',         type: 'C', length: 3,  decimals: 0 },
  ],
};

// ── Table: PAYROLLS ──
const PAYROLLS: DbfTableTemplate = {
  name: 'PAYROLLS',
  label: 'Payroll Run Records',
  description: 'Payroll run header records per employee per period',
  dbTable: 'dbf_payrolls',
  fields: [
    { name: 'PAYCODE',  type: 'N', length: 1,  decimals: 0 },
    { name: 'REGCODE',  type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',  type: 'C', length: 3,  decimals: 0 },
    { name: 'STACODE',  type: 'C', length: 3,  decimals: 0 },
    { name: 'EMPNO',    type: 'C', length: 7,  decimals: 0 },
    { name: 'FNAME',    type: 'C', length: 15, decimals: 0 },
    { name: 'MI',       type: 'C', length: 2,  decimals: 0 },
    { name: 'LNAME',    type: 'C', length: 15, decimals: 0 },
    { name: 'APPEL',    type: 'C', length: 3,  decimals: 0 },
    { name: 'BASIC',    type: 'N', length: 8,  decimals: 2 },
    { name: 'TRANS',    type: 'N', length: 8,  decimals: 2 },
    { name: 'DEDLNR',   type: 'N', length: 8,  decimals: 2 },
    { name: 'DEDMED',   type: 'N', length: 6,  decimals: 2 },
    { name: 'DEDPAG',   type: 'N', length: 6,  decimals: 2 },
    { name: 'DEDTAX',   type: 'N', length: 8,  decimals: 2 },
    { name: 'OTHERDED', type: 'N', length: 8,  decimals: 2 },
    { name: 'OFFICE',   type: 'C', length: 6,  decimals: 0 },
    { name: 'ENDING',   type: 'C', length: 8,  decimals: 0 },
    { name: 'ISSUE',    type: 'C', length: 8,  decimals: 0 },
    { name: 'CHKNO',    type: 'N', length: 10, decimals: 0 },
    { name: 'ONTOP',    type: 'N', length: 7,  decimals: 2 },
    { name: 'LONG',     type: 'N', length: 7,  decimals: 2 },
    { name: 'RATA',     type: 'N', length: 7,  decimals: 2 },
    { name: 'PERA',     type: 'N', length: 7,  decimals: 2 },
    { name: 'ACA',      type: 'N', length: 8,  decimals: 2 },
    { name: 'TAKEHOME', type: 'N', length: 8,  decimals: 2 },
    { name: 'POSCODE',  type: 'C', length: 4,  decimals: 0 },
    { name: 'GRADE',    type: 'C', length: 2,  decimals: 0 },
    { name: 'STEP',     type: 'C', length: 1,  decimals: 0 },
    { name: 'GOVTLNR',  type: 'N', length: 8,  decimals: 2 },
    { name: 'GOVTECC',  type: 'N', length: 8,  decimals: 2 },
    { name: 'GOVTPAG',  type: 'N', length: 8,  decimals: 2 },
    { name: 'GOVTMED',  type: 'N', length: 8,  decimals: 2 },
    { name: 'TAXCODE',  type: 'C', length: 2,  decimals: 0 },
    { name: 'PAYMODE',  type: 'C', length: 1,  decimals: 0 },
    { name: 'BANK',     type: 'C', length: 3,  decimals: 0 },
  ],
};

// ── Table: PYENT ──
const PYENT: DbfTableTemplate = {
  name: 'PYENT',
  label: 'Payroll Entries (PYENT)',
  description: 'Bank crediting hashfile — full month Payent',
  dbTable: 'dbf_pyent',
  fields: [
    { name: 'EMPNO',     type: 'C', length: 7,  decimals: 0 },
    { name: 'STACODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'REGCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'PAYPERIOD', type: 'C', length: 6,  decimals: 0 },
    { name: 'AMOUNT',    type: 'N', length: 12, decimals: 2 },
    { name: 'PAYTYPE',   type: 'C', length: 1,  decimals: 0 },
    { name: 'REMARKS',   type: 'C', length: 20, decimals: 0 },
  ],
};

// ── Table: PYENT1 ──
const PYENT1: DbfTableTemplate = {
  name: 'PYENT1',
  label: 'Payroll Entries (PYENT1)',
  description: 'Bank crediting hashfile — first half Payent',
  dbTable: 'dbf_pyent1',
  fields: [
    { name: 'EMPNO',     type: 'C', length: 7,  decimals: 0 },
    { name: 'STACODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'REGCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'PAYPERIOD', type: 'C', length: 6,  decimals: 0 },
    { name: 'AMOUNT',    type: 'N', length: 12, decimals: 2 },
    { name: 'PAYTYPE',   type: 'C', length: 1,  decimals: 0 },
    { name: 'REMARKS',   type: 'C', length: 20, decimals: 0 },
  ],
};

// ── Table: PYENT2 ──
const PYENT2: DbfTableTemplate = {
  name: 'PYENT2',
  label: 'Payroll Entries (PYENT2)',
  description: 'Bank crediting hashfile — second half Payent',
  dbTable: 'dbf_pyent2',
  fields: [
    { name: 'EMPNO',     type: 'C', length: 7,  decimals: 0 },
    { name: 'STACODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'DIVCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'REGCODE',   type: 'C', length: 3,  decimals: 0 },
    { name: 'PAYPERIOD', type: 'C', length: 6,  decimals: 0 },
    { name: 'AMOUNT',    type: 'N', length: 12, decimals: 2 },
    { name: 'PAYTYPE',   type: 'C', length: 1,  decimals: 0 },
    { name: 'REMARKS',   type: 'C', length: 20, decimals: 0 },
  ],
};

// ── Canonical registry ─────────────────────────────────────────────────────

/** All 10 tables in sync order (STNTABLE → DIVTABLE → … → PYENT2) */
export const DBF_TABLES: DbfTableTemplate[] = [
  STNTABLE,
  DIVTABLE,
  MASTFILE,
  INCLUDED,
  EXCLUDED,
  DEDFILE,
  PAYROLLS,
  PYENT,
  PYENT1,
  PYENT2,
];

// ── Derived lookups (same API as before, now sourced from one place) ──────

/** Sync order array — e.g. ['STNTABLE', 'DIVTABLE', …, 'PYENT2'] */
export const SYNC_ORDER = DBF_TABLES.map((t) => t.name) as readonly string[];

/** Human-readable labels — e.g. { STNTABLE: 'Station / School Table', … } */
export const TABLE_LABELS: Record<string, string> = Object.fromEntries(
  DBF_TABLES.map((t) => [t.name, t.label]),
);

/** Short descriptions — e.g. { STNTABLE: 'Station assignments and school locations', … } */
export const TABLE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  DBF_TABLES.map((t) => [t.name, t.description]),
);

/** DB table mappings — e.g. { STNTABLE: 'dbf_stntable', MASTFILE: 'employees', … } */
export const TABLE_TO_DB: Record<string, string> = Object.fromEntries(
  DBF_TABLES.map((t) => [t.name, t.dbTable]),
);

/** DBF field schemas — e.g. { STNTABLE: [{ name: 'REGCODE', … }], … } */
export const TABLE_FIELDS: Record<string, DbfField[]> = Object.fromEntries(
  DBF_TABLES.map((t) => [t.name, t.fields]),
);

/** Filename alias map — e.g. { MASTERFILE: 'MASTFILE', DEDUCTIONS: 'DEDFILE', … } */
export const TABLE_NAME_ALIASES: Record<string, string> = Object.fromEntries(
  DBF_TABLES
    .filter((t) => t.aliases && t.aliases.length > 0)
    .flatMap((t) => (t.aliases ?? []).map((alias) => [alias, t.name])),
);

/** Valid DBF magic bytes for header validation */
export const VALID_DBF_VERSIONS = new Set([
  0x02, 0x03, 0x04, 0x05, 0x30, 0x31, 0x32, 0x43, 0x63, 0x83, 0x8b, 0x8e, 0xf5, 0xfb,
]);

/** Sidecar file extensions that can accompany a .dbf file */
export const VALID_SIDECAR_EXTENSIONS = ['.cdx', '.fpt', '.idx'];

// ── Helper functions ───────────────────────────────────────────────────────

/** Resolve a DBF filename to its canonical table name */
export function extractTableName(fileName: string): string | null {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/i, '').toUpperCase().trim();
  const match = SYNC_ORDER.find((t) => base === t);
  return match ?? TABLE_NAME_ALIASES[base] ?? null;
}

/** Get the DbfField[] definition for a table */
export function getTableFields(tableName: string): DbfField[] | null {
  return TABLE_FIELDS[tableName] ?? null;
}

/** Get the full template for a table */
export function getTableTemplate(tableName: string): DbfTableTemplate | undefined {
  return DBF_TABLES.find((t) => t.name === tableName);
}
