// PLI import processing: batch upsert + terminate with progress callbacks.
// All database writes go through Supabase; the batch size keeps each round-trip
// within PostgREST limits for 50k+ record uploads.

import { supabase, fetchAll, chunkedIn } from '@/lib/pb';
import type { MatchedRecord } from '@/lib/pliParser';

export interface ImportProgress {
  phase: 'fetching' | 'processing' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
}

export interface ImportResult {
  added: number;
  updated: number;
  terminated: number;
  failed: number;
  errors: string[];
}

const BATCH_SIZE = 500;

// DB check constraint allows only 'Active','Suspended','Terminated'.
// The parser may emit 'ACTIVE'/'INACTIVE'; map to the allowed values.
function dbStatus(raw: string | undefined): string {
  const s = (raw ?? '').toUpperCase();
  if (s === 'INACTIVE' || s === 'TERMINATED' || s === 'FOR DELETION') return 'Terminated';
  if (s === 'SUSPENDED') return 'Suspended';
  return 'Active';
}

// DB check constraint allows only 'Loan','Insurance','Membership','Savings','Other'.
// The parser may emit 'PLI','GSIS', or other labels; map to the allowed values.
function dbType(raw: string | undefined): string {
  const s = (raw ?? '').toUpperCase();
  if (s === 'LOAN' || s === 'PLI') return 'Other';
  if (s === 'INSURANCE') return 'Insurance';
  if (s === 'MEMBERSHIP') return 'Membership';
  if (s === 'SAVINGS') return 'Savings';
  return 'Other';
}

export async function fetchExistingDeductions(
  stacodes: string[],
  empnos: string[],
  dedcodes: string[],
): Promise<Map<string, { id: string; stacode: string; empno: string; dedcode: string; policyno: string; dedamt: number }>> {
  const map = new Map<string, { id: string; stacode: string; empno: string; dedcode: string; policyno: string; dedamt: number }>();
  if (empnos.length === 0) return map;

  // Fetch existing deductions that could match any of the uploaded records.
  // Scope by empno + dedcode to keep the result set manageable. Empnos are
  // queried in safe chunks because PocketBase rejects `.in()` OR-expansions
  // with ~100+ terms ("Something went wrong while processing your request.").
  const uniqueEmpnos = [...new Set(empnos.filter(Boolean))];
  const uniqueDedcodes = [...new Set(dedcodes.filter(Boolean))];

  let rows: { id: string; stacode: string; empno: string; dedcode: string; policyno: string; dedamt: number }[] = [];
  if (uniqueDedcodes.length > 0) {
    const cols = 'id, stacode, empno, dedcode, policyno, dedamt';
    if (uniqueDedcodes.length <= 60) {
      rows = (await chunkedIn('empno', uniqueEmpnos, (chunk) =>
        supabase
          .from('payroll_deductions')
          .select(cols)
          .in('empno', chunk)
          .in('dedcode', uniqueDedcodes),
      )) as { id: string; stacode: string; empno: string; dedcode: string; policyno: string; dedamt: number }[];
    } else {
      // Too many codes to fit in one filter — empno-scoping alone returns a
      // superset, and the exact key matching below still resolves correctly.
      rows = (await chunkedIn('empno', uniqueEmpnos, (chunk) =>
        supabase
          .from('payroll_deductions')
          .select(cols)
          .in('empno', chunk),
      )) as { id: string; stacode: string; empno: string; dedcode: string; policyno: string; dedamt: number }[];
    }
  }

  for (const row of rows) {
    // Primary key for ADD/UPDATE: full 4-field composite
    const key4 = `${row.stacode}|${row.empno}|${row.dedcode}|${row.policyno}`;
    map.set(key4, row);
    // DEL-file match key: EMPNO + POLICYNO + AMOUNT (stacode in DB is often "0")
    const delKey = `${row.empno}|${row.policyno}|${row.dedamt}`;
    if (!map.has(delKey)) map.set(delKey, row);
  }
  return map;
}

export async function fetchEmployeeMap(
  stacodes: string[],
  empnos: string[],
): Promise<Map<string, { id: string; stacode: string; empno: string }>> {
  const map = new Map<string, { id: string; stacode: string; empno: string }>();
  const uniqueStacodes = [...new Set(stacodes.filter(Boolean))];
  if (uniqueStacodes.length === 0) return map;

  // Chunk stacodes — PocketBase rejects `.in()` OR-expansions with ~100+ terms.
  const rows = (await chunkedIn('stacode', uniqueStacodes, (chunk) =>
    supabase
      .from('employees')
      .select('id, stacode, empno')
      .in('stacode', chunk),
  )) as { id: string; stacode: string; empno: string }[];

  for (const row of rows as { id: string; stacode: string; empno: string }[]) {
    const key = `${row.stacode}|${row.empno}`;
    map.set(key, row);
  }
  return map;
}

export async function fetchDeductionCodes(): Promise<Set<string>> {
  const rows = await fetchAll(() =>
    supabase.from('deduction_codes').select('dedcode').eq('active', true),
  );
  return new Set((rows as { dedcode: string }[]).map((r) => r.dedcode.toUpperCase()));
}

export async function processImport(
  matched: MatchedRecord[],
  employeeMap: Map<string, { id: string; stacode: string; empno: string }>,
  userEmail: string,
  onProgress: (p: ImportProgress) => void,
  source: 'GSIS' | 'PLI' = 'PLI',
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, terminated: 0, failed: 0, errors: [] };
  const actionable = matched.filter((m) => m.action === 'ADD' || m.action === 'UPDATE' || m.action === 'TERMINATE');
  const total = actionable.length;
  let current = 0;

  // Process in batches by action type
  const adds = matched.filter((m) => m.action === 'ADD');
  const updates = matched.filter((m) => m.action === 'UPDATE');
  const terminates = matched.filter((m) => m.action === 'TERMINATE');

  // --- INSERT batches (ADD) ---
  for (let i = 0; i < adds.length; i += BATCH_SIZE) {
    const batch = adds.slice(i, i + BATCH_SIZE);
    const rows = batch.map(({ record }) => {
      const empKey = `${record.stacode}|${record.empno}`;
      const emp = employeeMap.get(empKey);
      return {
        employee_id: emp?.id ?? null,
        stacode: record.stacode,
        empno: record.empno,
        dedcode: record.dedcode,
        policyno: record.policyno,
        dedamt: record.dedAmt,
        principal: record.principal,
        interest: record.interest,
        charges: record.charges,
        proceeds: record.proceeds,
        effmm: record.effMm,
        effyy: record.effYy,
        termm: record.terMm,
        teryy: record.terYy,
        status: dbStatus(record.status),
        agency: record.agency,
        type: dbType(record.type),
        created_by: userEmail,
        updated_by: userEmail,
      };
    });

    onProgress({ phase: 'processing', current, total, message: `Inserting batch ${Math.floor(i / BATCH_SIZE) + 1}…` });
    const { data: insertedRows, error } = await supabase.from('payroll_deductions').insert(rows).select('id, stacode, empno, dedcode, policyno, dedamt, principal, interest, charges, status');
    if (error) {
      result.failed += batch.length;
      result.errors.push(`Insert batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    } else {
      result.added += batch.length;
      const historyRows = (insertedRows as { id: string; stacode: string; empno: string; dedcode: string; policyno: string; dedamt: number; principal: number; interest: number; charges: number; status: string }[]).map((r) => ({
        deduction_id: r.id,
        stacode: r.stacode,
        empno: r.empno,
        dedcode: r.dedcode,
        policyno: r.policyno,
        action: 'ADD' as const,
        prev_dedamt: null,
        new_dedamt: r.dedamt,
        prev_status: null,
        new_status: r.status,
        prev_principal: null,
        new_principal: r.principal,
        prev_interest: null,
        new_interest: r.interest,
        prev_charges: null,
        new_charges: r.charges,
        changed_by: userEmail,
        source,
      }));
      if (historyRows.length > 0) {
        await supabase.from('deduction_history').insert(historyRows);
      }
    }
    current += batch.length;
    onProgress({ phase: 'processing', current, total, message: `${current} / ${total} processed` });
  }

  // --- UPDATE batches ---
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    onProgress({ phase: 'processing', current, total, message: `Updating batch ${Math.floor(i / BATCH_SIZE) + 1}…` });

    let batchOk = 0;
    let batchFail = 0;
    for (const { record, existingId } of batch) {
      const { data: current } = await supabase
        .from('payroll_deductions')
        .select('dedamt, status, principal, interest, charges')
        .eq('id', existingId!)
        .maybeSingle();

      const { error } = await supabase
        .from('payroll_deductions')
        .update({
          dedamt: record.dedAmt,
          principal: record.principal,
          interest: record.interest,
          charges: record.charges,
          proceeds: record.proceeds,
          effmm: record.effMm,
          effyy: record.effYy,
          termm: record.terMm,
          teryy: record.terYy,
          status: dbStatus(record.status),
          agency: record.agency,
          type: dbType(record.type),
          updated_by: userEmail,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingId!);
      if (error) {
        batchFail++;
        result.errors.push(`Update ${record.stacode}/${record.empno}/${record.dedcode}/${record.policyno}: ${error.message}`);
      } else {
        batchOk++;
        const cur = current as { dedamt: number; status: string; principal: number; interest: number; charges: number } | null;
        await supabase.from('deduction_history').insert({
          deduction_id: existingId,
          stacode: record.stacode,
          empno: record.empno,
          dedcode: record.dedcode,
          policyno: record.policyno,
          action: 'UPDATE',
          prev_dedamt: cur?.dedamt ?? null,
          new_dedamt: record.dedAmt,
          prev_status: cur?.status ?? null,
          new_status: dbStatus(record.status),
          prev_principal: cur?.principal ?? null,
          new_principal: record.principal,
          prev_interest: cur?.interest ?? null,
          new_interest: record.interest,
          prev_charges: cur?.charges ?? null,
          new_charges: record.charges,
          changed_by: userEmail,
          source,
        });
      }
    }
    result.updated += batchOk;
    result.failed += batchFail;
    current += batch.length;
    onProgress({ phase: 'processing', current, total, message: `${current} / ${total} processed` });
  }

  // --- TERMINATE batches ---
  for (let i = 0; i < terminates.length; i += BATCH_SIZE) {
    const batch = terminates.slice(i, i + BATCH_SIZE);
    onProgress({ phase: 'processing', current, total, message: `Terminating batch ${Math.floor(i / BATCH_SIZE) + 1}…` });

    let batchOk = 0;
    let batchFail = 0;
    for (const { record, existingId } of batch) {
      const { data: current } = await supabase
        .from('payroll_deductions')
        .select('dedamt, status, principal, interest, charges')
        .eq('id', existingId!)
        .maybeSingle();

      const { error } = await supabase
        .from('payroll_deductions')
        .delete()
        .eq('id', existingId!);
      if (error) {
        batchFail++;
        result.errors.push(`Delete ${record.stacode}/${record.empno}/${record.dedcode}/${record.policyno}: ${error.message}`);
      } else {
        batchOk++;
        const cur = current as { dedamt: number; status: string; principal: number; interest: number; charges: number } | null;
        await supabase.from('deduction_history').insert({
          deduction_id: existingId,
          stacode: record.stacode,
          empno: record.empno,
          dedcode: record.dedcode,
          policyno: record.policyno,
          action: 'DELETE',
          prev_dedamt: cur?.dedamt ?? null,
          new_dedamt: null,
          prev_status: cur?.status ?? null,
          new_status: 'Deleted',
          prev_principal: cur?.principal ?? null,
          new_principal: null,
          prev_interest: cur?.interest ?? null,
          new_interest: null,
          prev_charges: cur?.charges ?? null,
          new_charges: null,
          changed_by: userEmail,
          source,
        });
      }
    }
    result.terminated += batchOk;
    result.failed += batchFail;
    current += batch.length;
    onProgress({ phase: 'processing', current, total, message: `${current} / ${total} processed` });
  }

  result.failed += matched.filter((m) => m.action === 'ERROR').length;
  onProgress({ phase: 'complete', current: total, total, message: 'Import complete' });
  return result;
}
