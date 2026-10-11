/**
 * The billing working set of the deduction-file steps (PAYFMEN2 5–7), kept on
 * the server per signed-in user and pay period.
 *
 * The legacy keeps three flat files on disk between steps — the reformatted
 * billing file (BILLS / BILLTEXT), the error file (ERRTXT) and the invalid BP
 * number file (GSINVBPN). Here they live as one JSON document in
 * `system_settings` under `deduction_billing.<userId>.<periodId>`, so the steps
 * survive a reload, follow the operator to another machine, and the post can be
 * applied by the server in a single transaction.
 */

import { rpc } from './pb';

/** One reformatted billing record — the 152-character line, field by field. */
export interface BillingLine {
  regcode: string; divcode: string; stacode: string; empno: string;
  fname: string; mi: string; lname: string; appel: string;
  sltag: string; dedcode: string; policyno: string;
  effyy: string; effmm: string; teryy: string; termm: string;
  dedamt: number; principal: number; interest: number; charges: number; proceeds: number;
  bill: string; upd: string; bpn: string;
  raw: string; lineNumber: number;
}

/** POSTED rows stay in the document so the Download step keeps its files. */
export type BillingAction = 'ADD' | 'UPDATE' | 'DELETE' | 'ERROR' | 'POSTED';

export interface StagedBillingRow extends BillingLine {
  action: BillingAction;
  errors: string[];
  employeeId: string;
  employeeName: string;
  existingId: string | null;
  postedAt?: string;
  postedAs?: 'ADD' | 'UPDATE' | 'DELETE';
}

export interface BillingErrorRow {
  lineNumber: number; bpn: string; empno: string; name: string;
  dedcode: string; policyno: string; amount: number; error: string;
}

export interface InvalidBpRow { bpn: string; empno: string; name: string; reason: string }

export interface BillingSession {
  /** the reformatted billing file — the legacy BILLS / BILLTEXT */
  fileName: string;
  layout: 'fixed' | 'delimited' | '';
  uploadedAt: string;
  records: BillingLine[];
  /** the validated, classified rows the post applies */
  staged: StagedBillingRow[];
  /** the error file (PAYDFEXG → edit / delete / add error file) */
  errorRows: BillingErrorRow[];
  /** GSINVBPN — BP numbers that resolve to no master record (PAYDFG2) */
  invalidBp: InvalidBpRow[];
  /** GSINVUPC — lines whose update code is neither blank, D nor R (PAYDFG1) */
  invalidUpd?: InvalidBpRow[];
  /** which door the file was uploaded through */
  leg?: 'GSIS' | 'OTHERS';
  postedAt?: string;
  postedBy?: string;
  postedCount?: number;
  /** set by the server when the document is read back */
  id?: string;
  key?: string;
  savedAt?: string;
}

export const EMPTY_BILLING: BillingSession = {
  fileName: '', layout: '', uploadedAt: '', records: [], staged: [], errorRows: [], invalidBp: [], invalidUpd: [],
};

/** The working set is keyed per user and pay period, and a period is required. */
export function hasSession(session: BillingSession | null | undefined): boolean {
  return !!session && (session.uploadedAt !== '' || session.records.length > 0);
}

/** Read the saved working set for one pay period. */
export async function loadBillingSession(periodId: string): Promise<{ session: BillingSession | null; error: string | null }> {
  if (!periodId) return { session: null, error: null };
  const { data, error } = await rpc('get_deduction_billing_session', { periodId });
  if (error) return { session: null, error: error.message ?? String(error) };
  const session = (data?.session ?? null) as BillingSession | null;
  return { session: session && hasSession(session) ? session : null, error: null };
}

/** Write the working set. Returns the stored document (with its server id). */
export async function saveBillingSession(
  periodId: string,
  session: BillingSession,
): Promise<{ session: BillingSession | null; error: string | null }> {
  if (!periodId) return { session: null, error: 'A pay period is required to keep the billing working set' };
  const { data, error } = await rpc('save_deduction_billing_session', { periodId, session });
  if (error) return { session: null, error: error.message ?? String(error) };
  return { session: (data?.session ?? null) as BillingSession | null, error: null };
}

/** Drop the working set — the legacy deleting its flat files. */
export async function clearBillingSession(periodId: string): Promise<{ cleared: boolean; error: string | null }> {
  if (!periodId) return { cleared: false, error: null };
  const { data, error } = await rpc('clear_deduction_billing_session', { periodId });
  if (error) return { cleared: false, error: error.message ?? String(error) };
  return { cleared: data?.cleared === true, error: null };
}

export interface BillingPostResult {
  posted: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
  skippedReasons?: string[];
}

/**
 * Post the saved working set. The server re-reads the document, re-validates
 * every row and applies the valid ones in one transaction — invalid rows are
 * skipped and reported, and the rest are still written.
 */
export async function postBillingSession(
  periodId: string,
  editor: string,
): Promise<{ result: BillingPostResult | null; session: BillingSession | null; error: string | null }> {
  if (!periodId) return { result: null, session: null, error: 'A pay period is required to post' };
  const { data, error } = await rpc('post_deduction_billing', { periodId, editor });
  if (error) return { result: null, session: null, error: error.message ?? String(error) };
  return {
    result: {
      posted: Number(data?.posted ?? 0),
      inserted: Number(data?.inserted ?? 0),
      updated: Number(data?.updated ?? 0),
      deleted: Number(data?.deleted ?? 0),
      skipped: Number(data?.skipped ?? 0),
      skippedReasons: Array.isArray(data?.skippedReasons) ? data.skippedReasons.map(String) : [],
    },
    session: (data?.session ?? null) as BillingSession | null,
    error: null,
  };
}
