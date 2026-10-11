import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Upload, Search, Trash2, Plus, X, FileText, CheckCircle2, AlertTriangle, Download,
  Info, Pencil, Printer, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase, fetchAll, chunkedIn } from '@/lib/pb';
import { parseDeductionFile, matchRowsToEmployees, type ParseResult } from '@/lib/textParser';
import { generateDeductionDbf, downloadFile, currency, generateCsv } from '@/lib/reports';
import { validateUpload } from '@/lib/uploadSecurity';
import { inCategory, type PayrollCategory } from '@/lib/categories';
import { getEmployeeFilter } from '@/lib/authz';
import { useOrg, matchesOrgScope } from '@/lib/org';
import type { Employee, Deduction, PayPeriod, DeductionUploadRow, DeductionCode, UndeductedObligation } from '@/types/payroll';
import { getDeductionPriority, getEffectiveDeductionPriority, DEDUCTION_PRIORITY_LABELS } from '@/lib/nthp';
import type { UserProfile } from '@/types/auth';
import { usePagination, Pagination } from '@/components/Pagination';
import {
  EMPTY_BILLING, loadBillingSession, saveBillingSession, clearBillingSession, postBillingSession,
  type BillingLine, type BillingErrorRow, type InvalidBpRow, type BillingSession, type StagedBillingRow,
  type BillingAction,
} from '@/lib/deductionBilling';

export default function Deductions({ category, profile }: { category?: PayrollCategory | null; profile?: UserProfile | null }) {
  const { scopedDivisionIds, scopedCodes } = useOrg();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [summary, setSummary] = useState<{ totalCount: number; totalAmount: number; codeCount: number; empCount: number } | null>(null);
  const [periodId, setPeriodId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  // B-Deduction File (PAYFMEN2) — which legacy step is open, if any.
  const [legacy, setLegacy] = useState<{ step: LegacyStep; choice: string } | null>(null);
  // The billing file the Upload step reformats, and the error/invalid-BP files
  // the Download step works on — the working set the legacy keeps on disk
  // (BILLS/BILLTEXT, GSINVBPN) between steps. It is saved on the server per user
  // and pay period (`deduction_billing.<userId>.<periodId>` in system_settings),
  // so the steps survive a reload and the post can be applied transactionally.
  const [billing, setBilling] = useState<BillingSession>(EMPTY_BILLING);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);
  const [dedCodes, setDedCodes] = useState<DeductionCode[]>([]);
  const dedCodeMap = new Map(dedCodes.map((c) => [c.dedcode, c]));
  // Undeducted obligations for the selected pay period (were invisible in this
  // view) + INCLUDED/priority tags (`payroll_deductions.priority === 1`) that
  // keep an undeducted row at its normal priority position instead of last.
  const [undeductedObs, setUndeductedObs] = useState<UndeductedObligation[]>([]);
  const [priorityTags, setPriorityTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const scopeFilter = profile ? getEmployeeFilter(profile) : null;
      // `appel` and the two GSIS numbers are read by the deduction-file views:
      // the GSIS door keys on the master file's GSIS_ID, so it has to be here.
      const empCols = 'id,empno,employee_number,lname,last_name,fname,first_name,mi,appel,stacode,regcode,divcode,division_id,status,gsis_id,gsis_pn';
      const [emp, { data: per }, codes] = await Promise.all([
        fetchAll(() => {
          let q = supabase.from('employees').select(empCols).order('last_name');
          if (scopeFilter) q = q.eq(scopeFilter.column, scopeFilter.value);
          return q;
        }),
        supabase.from('pay_periods').select('*').order('start_date', { ascending: false }),
        fetchAll(() => supabase.from('deduction_codes').select('*').order('dedcode')),
      ]);
      // Honor the selected Region/Division scope — REGCODE + DIVCODE are the
      // unique reference for one division's payroll.
      setEmployees((emp as unknown as Employee[]).filter((e) => matchesOrgScope(e, { scopedDivisionIds, scopedCodes })));
      const scopedPer = (per ?? [] as any[]).filter((p: any) => matchesOrgScope(p, { scopedDivisionIds, scopedCodes }));
      setPeriods(scopedPer);
      setDedCodes(codes as DeductionCode[]);
      if (scopedPer.length > 0) setPeriodId(scopedPer[0].id);
      setLoading(false);
    })();
  }, [profile, scopedDivisionIds, scopedCodes]);

  /** Keep the working set locally only (the server already holds this copy). */
  const setSession = useCallback((next: BillingSession) => setBilling(next), []);

  /** Keep the working set locally and on the server — one document per period. */
  const persistSession = useCallback((next: BillingSession) => {
    setBilling(next);
    if (!periodId) {
      setBillingNotice('Select a pay period before uploading a billing file.');
      return;
    }
    void saveBillingSession(periodId, next).then(({ session, error }) => {
      if (error) setBillingNotice(`The billing working set could not be saved: ${error}`);
      else if (session) { setBilling(session); setBillingNotice(null); }
    });
  }, [periodId]);

  /** Delete the saved working set — the legacy clearing its flat files. */
  const discardSession = useCallback(() => {
    setBilling(EMPTY_BILLING);
    if (!periodId) return;
    void clearBillingSession(periodId).then(({ cleared, error }) => {
      if (error) setBillingNotice(`The billing working set could not be deleted: ${error}`);
      else if (cleared) setBillingNotice('The billing working set for this pay period was deleted.');
    });
  }, [periodId]);

  // Read back this period's working set — the legacy's files are still there
  // after a reload, so the Uploaded / Print / Download steps resume.
  useEffect(() => {
    let cancelled = false;
    if (!periodId || !profile) return undefined;
    (async () => {
      const { session, error } = await loadBillingSession(periodId);
      if (cancelled) return;
      if (error) { setBillingNotice(`The saved billing working set could not be read: ${error}`); return; }
      setBilling(session ?? EMPTY_BILLING);
    })();
    return () => { cancelled = true; };
  }, [periodId, profile]);

  const loadDeductions = useCallback(async () => {
    // Read the per-period deduction lines table. It holds the DEDFILE masterfile
    // rows (written by the DEDFILE import, stamped with the current open period)
    // plus the computed per-period lines produced by Run Payroll.
    const data = await fetchAll(() =>
      supabase.from('deductions').select('*').order('deduction_code'),
    );
    // Map to Deduction type for display (deductions shares the same field names).
    const mapped = (data as unknown[]).map((r: any) => ({
      id: r.id,
      employee_id: r.employee_id,
      pay_period_id: r.pay_period_id ?? '',
      deduction_code: r.deduction_code || '',
      deduction_name: r.deduction_name || r.deduction_code || '',
      category: r.category || 'Other',
      amount: r.amount || 0,
      source: r.source || 'DEDFILE',
      reference: r.reference || '',
      created_at: r.created_at || '',
      // Full DEDFILE columns
      stacode: r.stacode || '',
      effmm: r.effmm || '',
      effyy: r.effyy || '',
      termm: r.termm || '',
      teryy: r.teryy || '',
      type: r.type || '',
      agency: r.agency || '',
      policyno: r.policyno || '',
      policydate: r.policydate || '',
      status: r.status || '',
      principal: r.principal || 0,
      interest: r.interest || 0,
      charges: r.charges || 0,
      proceeds: r.proceeds || 0,
      absno: r.absno || 0,
      underhr: r.underhr || 0,
      undermin: r.undermin || 0,
      oldcode: r.oldcode || '',
      hiredate: r.hiredate || '',
      birthdate: r.birthdate || '',
      gsis_bpn: r.gsis_bpn || '',
      qs: r.qs || '',
      paydate: r.paydate || '',
      editor: r.editor || '',
    }));
    setDeductions(mapped as Deduction[]);
    // Summary
    const totalAmount = mapped.reduce((s: number, d: any) => s + (d.amount || 0), 0);
    const codeSet = new Set(mapped.map((d: any) => d.deduction_code).filter(Boolean));
    const empSet = new Set(mapped.map((d: any) => d.employee_id).filter(Boolean));
    setSummary({ totalCount: mapped.length, totalAmount, codeCount: codeSet.size, empCount: empSet.size });
  }, []);

  useEffect(() => { loadDeductions(); }, [refetchKey]);

  // Undeducted obligations for the selected pay period — previously invisible
  // in this view. Scoped client-side to the division's employees (same as
  // Payroll/Reports).
  useEffect(() => {
    if (!periodId) { setUndeductedObs([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const unded = await fetchAll(() =>
          supabase.from('undeducted_obligations').select('*').eq('pay_period_id', periodId),
        );
        if (!cancelled) setUndeductedObs((unded as UndeductedObligation[]) ?? []);
      } catch { if (!cancelled) setUndeductedObs([]); }
    })();
    return () => { cancelled = true; };
  }, [periodId, refetchKey]);

  // INCLUDED/priority tags from the deduction masterfile
  // (`payroll_deductions.priority === 1`). A priority-tagged undeducted row
  // keeps its normal APDS priority position; all other undeducted rows sink
  // to least priority. Missing column/table → empty set (safe default).
  useEffect(() => {
    if (employees.length === 0) { setPriorityTags(new Set()); return; }
    let cancelled = false;
    (async () => {
      try {
        const ids = employees.map((e) => e.id).filter(Boolean);
        const rows = await chunkedIn('employee_id', ids, (chunk) =>
          supabase.from('payroll_deductions').select('employee_id,empno,dedcode,priority').in('employee_id', chunk),
        ) as { employee_id?: string; dedcode?: string; priority?: number | string | null }[];
        if (cancelled) return;
        const tags = new Set<string>();
        for (const r of rows ?? []) {
          if (Number(r.priority) !== 1) continue;
          const code = String(r.dedcode ?? '').toUpperCase();
          if (r.employee_id && code) tags.add(`${r.employee_id}|${code}`);
        }
        setPriorityTags(tags);
      } catch { if (!cancelled) setPriorityTags(new Set()); }
    })();
    return () => { cancelled = true; };
  }, [employees, refetchKey]);

  const empMap = new Map(employees.map((e) => [e.id, e]));
  const filtered = deductions.filter((d) => {
    if (category) {
      const e = empMap.get(d.employee_id);
      if (!e || !inCategory(e.stacode, category)) return false;
    }
    const q = search.toLowerCase();
    if (!q) return true;
    const e = empMap.get(d.employee_id);
    return [d.deduction_code, d.deduction_name, e?.employee_number, e?.last_name, e?.first_name]
      .some((v) => v?.toLowerCase().includes(q));
  });

  // ── Priority-ordered display groups ────────────────────────────────────
  // Per Policy Library deped-001 (APDS Order of Priority, FY 2024 GAA Sec. 56):
  // mandatory first (BIR → PhilHealth → GSIS → Pag-IBIG), then loans FIFS.
  // Undeducted rows sort least-priority (1000+ band) EXCEPT priority-tagged
  // rows (INCLUDED band, tag === 1), which keep their APDS position.
  interface DisplayGroup {
    key: string;
    code: string;
    kind: 'deducted' | 'undeducted';
    /** effective sort priority */
    priority: number;
    /** 1–13 APDS base for the badge */
    base: number;
    priorityTagged: boolean;
    items: Deduction[];
    undItems: UndeductedObligation[];
    total: number;
  }

  const resolveAgencyType = (code: string, rowAgency?: string, rowType?: string) => {
    const c = dedCodeMap.get(code);
    return { agency: rowAgency || c?.agency || '', type: rowType || c?.type || '' };
  };

  const deductedGroups: DisplayGroup[] = Object.entries(
    filtered.reduce((acc, d) => {
      (acc[d.deduction_code] ??= []).push(d);
      return acc;
    }, {} as Record<string, Deduction[]>),
  ).map(([code, items]) => {
    let base = 13;
    for (const d of items) {
      const { agency, type } = resolveAgencyType(d.deduction_code, d.agency, d.type);
      base = Math.min(base, getDeductionPriority(agency, type, d.deduction_code));
    }
    return {
      key: `deducted:${code}`, code, kind: 'deducted' as const,
      priority: base, base, priorityTagged: false,
      items, undItems: [],
      total: items.reduce((s, d) => s + (d.amount || 0), 0),
    };
  });

  const undFiltered = undeductedObs.filter((u) => {
    const e = empMap.get(u.employee_id);
    if (!e) return false;
    if (category && !inCategory(e.stacode, category)) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return [u.deduction_code, u.deduction_description, e.employee_number, e.last_name, e.first_name]
      .some((v) => v?.toLowerCase().includes(q));
  });

  const undeductedGroups: DisplayGroup[] = Object.entries(
    undFiltered.reduce((acc, u) => {
      (acc[u.deduction_code] ??= []).push(u);
      return acc;
    }, {} as Record<string, UndeductedObligation[]>),
  ).map(([code, items]) => {
    const { agency, type } = resolveAgencyType(code);
    const base = getDeductionPriority(agency, type, code);
    const tagged = items.some((u) => priorityTags.has(`${u.employee_id}|${code.toUpperCase()}`));
    return {
      key: `undeducted:${code}`, code, kind: 'undeducted' as const,
      // Untagged undeducted rows sink to the least-priority band (2); a row
      // whose masterfile row is INCLUDED/priority-tagged (1) keeps its normal
      // APDS priority position instead (0 → base).
      priority: getEffectiveDeductionPriority(agency, type, code, tagged ? 0 : 2),
      base, priorityTagged: tagged,
      items: [],
      undItems: [...items].sort((a, b) => (b.undeducted_amount || 0) - (a.undeducted_amount || 0)),
      total: items.reduce((s, u) => s + (Number(u.undeducted_amount) || 0), 0),
    };
  });

  const sortedGroups = [...deductedGroups, ...undeductedGroups]
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));

  const totalAmount = filtered.reduce((s, d) => s + d.amount, 0);
  const undTotalAmount = undFiltered.reduce((s, u) => s + (Number(u.undeducted_amount) || 0), 0);

  async function removeDeduction(d: Deduction) {
    if (!confirm('Delete this deduction?')) return;
    await supabase.from('deductions').delete().eq('id', d.id);
    setRefetchKey((k) => k + 1);
  }

  async function removeUndeducted(u: UndeductedObligation) {
    if (!confirm('Delete this undeducted obligation?')) return;
    await supabase.from('undeducted_obligations').delete().eq('id', u.id);
    setRefetchKey((k) => k + 1);
  }

  function exportDbf(code: string) {
    const content = generateDeductionDbf(deductions, employees, code);
    downloadFile({ filename: `DEDUCTION_${code}_${new Date().toISOString().slice(0, 10)}.DBF`, content, mimeType: 'application/dbf' });
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 min-w-[200px]"
          >
            {periods.length === 0 && <option>No pay periods yet</option>}
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name}</option>)}
          </select>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deductions…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* The legacy deduction-file menu — PAYFMEN2's seven prompts, each
              keeping its GSIS / Others sub-menu. */}
          <DedFileMenu
            onAction={(step, choice) => {
              if (choice === 'quit') { setLegacy(null); return; }
              setLegacy({ step, choice });
            }}
          />
          <button
            onClick={() => setShowAdd(true)}
            disabled={!periodId}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" /> Manual Entry
          </button>
          <button
            onClick={() => setShowUpload(true)}
            disabled={!periodId}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload Text File
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && (filtered.length > 0 || undFiltered.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <SummaryCard label="Total Deductions" value={String(filtered.length)} />
          <SummaryCard label="Total Amount" value={currency(totalAmount)} />
          <SummaryCard label="Deduction Codes" value={String(deductedGroups.length)} />
          <SummaryCard label="Employees" value={String(new Set(filtered.map((d) => d.employee_id)).size)} />
          <SummaryCard label="Active" value={String(filtered.filter((d) => d.status === 'Active').length)} />
          <SummaryCard label="Loan Balances" value={currency(filtered.reduce((s, d) => s + (d.principal || 0), 0))} />
          <SummaryCard label="Undeducted" value={currency(undTotalAmount)} />
        </div>
      )}

      {/* Priority order reference (Policy Library deped-001: APDS Order of
          Priority, FY 2024 GAA Sec. 56) — mandatory first, then loans FIFS;
          undeducted last unless priority-tagged. */}
      {!loading && sortedGroups.length > 0 && (
        <p className="text-[11px] text-slate-400" title="Policy Library → DepEd APDS Order of Priority (FY 2024 GAA, Section 56)">
          Sorted by deduction priority: BIR → PhilHealth → GSIS → Pag-IBIG → loans (first-in-first-served).
          Undeducted obligations rank last unless tagged as priority.
        </p>
      )}

      {/* Deduction groups */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading deductions…</div>
        ) : sortedGroups.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-500">
              {periods.length === 0 ? 'Create a pay period first in the Payroll Run tab.' : 'No deductions for this period yet. Upload a text file or add manually.'}
            </p>
          </div>
        ) : (
          sortedGroups.map((g) => g.kind === 'deducted' ? (
            <DeductionGroup
              key={g.key}
              code={g.code}
              codeName={dedCodeMap.get(g.code)?.dedname ?? null}
              priority={g.base}
              items={g.items}
              empMap={empMap}
              resetKey={search}
              onExport={exportDbf}
              onRemove={removeDeduction}
            />
          ) : (
            <UndeductedGroup
              key={g.key}
              code={g.code}
              codeName={dedCodeMap.get(g.code)?.dedname ?? null}
              base={g.base}
              priorityTagged={g.priorityTagged}
              periodName={periods.find((p) => p.id === periodId)?.period_name ?? ''}
              items={g.undItems}
              empMap={empMap}
              resetKey={search}
              onRemove={removeUndeducted}
            />
          ))
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          employees={employees}
          periodId={periodId}
          dedCodes={dedCodes}
          onClose={() => setShowUpload(false)}
          onImported={() => { setShowUpload(false); setRefetchKey((k) => k + 1); }}
        />
      )}

      {/* Manual add modal */}
      {showAdd && (
        <ManualDeductionModal
          employees={employees}
          periodId={periodId}
          dedCodes={dedCodes}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); setRefetchKey((k) => k + 1); }}
        />
      )}

      {/* The billing working set is kept on the server now, so a failure to
          read or write it is surfaced here rather than lost in the console. */}
      {billingNotice && (
        <div className="mb-4">
          <Notice notice={{ tone: /could not/.test(billingNotice) ? 'error' : 'info', text: billingNotice }} />
        </div>
      )}

      {/* ── B-Deduction File — the PAYFMEN2 branch ────────────────────────────
          Every step works on the whole file (`deductions`), not on the
          search-filtered groups above, exactly as the legacy reads DEDFILE. */}
      {/* Each mount is keyed on the step+choice so re-opening a step (or
          switching GSIS ↔ Others) starts a fresh form rather than resuming the
          last one — React would otherwise keep the previous modal's state. */}
      {legacy?.step === 'view' && legacy.choice === 'one' && (
        <ViewOneRecordModal
          key={`${legacy.step}:${legacy.choice}`}
          rows={deductions} empMap={empMap} codes={dedCodeMap}
          onClose={() => setLegacy(null)}
        />
      )}
      {legacy?.step === 'view' && (legacy.choice === 'all' || legacy.choice === 'code') && (
        <ViewAbstractModal
          key={`${legacy.step}:${legacy.choice}`}
          rows={deductions} empMap={empMap} codes={dedCodeMap}
          mode={legacy.choice === 'code' ? 'code' : 'all'}
          onClose={() => setLegacy(null)}
        />
      )}
      {legacy?.step === 'edit' && (
        <EditDeductionModal
          key={`${legacy.step}:${legacy.choice}`}
          leg={legacy.choice === 'gsis' ? 'GSIS' : 'OTHERS'}
          rows={deductions} employees={employees} empMap={empMap} codes={dedCodeMap}
          editor={profile?.email ?? 'SYSTEM'}
          onClose={() => setLegacy(null)}
          onSaved={() => { setLegacy(null); setRefetchKey((k) => k + 1); }}
        />
      )}
      {legacy?.step === 'delete' && (
        <DeleteDeductionModal
          key={`${legacy.step}:${legacy.choice}`}
          leg={legacy.choice === 'gsis' ? 'GSIS' : 'OTHERS'}
          rows={deductions} empMap={empMap} codes={dedCodeMap}
          onClose={() => setLegacy(null)}
          onSaved={() => { setLegacy(null); setRefetchKey((k) => k + 1); }}
        />
      )}
      {legacy?.step === 'add' && (
        <AddDeductionModal
          key={`${legacy.step}:${legacy.choice}`}
          leg={legacy.choice === 'gsis' ? 'GSIS' : 'OTHERS'}
          rows={deductions} employees={employees} empMap={empMap} codes={dedCodeMap}
          periodId={periodId} editor={profile?.email ?? 'SYSTEM'}
          onClose={() => setLegacy(null)}
          onSaved={() => { setLegacy(null); setRefetchKey((k) => k + 1); }}
        />
      )}
      {legacy?.step === 'print' && (
        <PrintBillingModal
          key={`${legacy.step}:${legacy.choice}`}
          leg={legacy.choice === 'gsis' ? 'GSIS' : 'OTHERS'}
          rows={deductions} empMap={empMap} codes={dedCodeMap} billing={billing}
          onClose={() => setLegacy(null)}
        />
      )}
      {legacy?.step === 'upload' && (
        <UploadBillingModal
          key={`${legacy.step}:${legacy.choice}`}
          leg={legacy.choice === 'gsis' ? 'GSIS' : 'OTHERS'}
          employees={employees} empMap={empMap} codes={dedCodeMap} rows={deductions}
          periodId={periodId} editor={profile?.email ?? 'SYSTEM'}
          period={(() => {
            const p = periods.find((x) => x.id === periodId);
            return p ? { month: p.month, year: p.year } : null;
          })()}
          billing={billing} onSession={setSession} onPersist={persistSession} onDiscard={discardSession}
          onClose={() => setLegacy(null)}
          onSaved={() => { setLegacy(null); setRefetchKey((k) => k + 1); }}
        />
      )}
      {legacy?.step === 'download' && (
        <DownloadBillingModal
          key={`${legacy.step}:${legacy.choice}`}
          leg={legacy.choice === 'gsis' ? 'GSIS' : 'OTHERS'}
          rows={deductions} empMap={empMap} codes={dedCodeMap} billing={billing} onPersist={persistSession}
          onDiscard={discardSession}
          onClose={() => setLegacy(null)}
        />
      )}
    </div>
  );
}

function DeductionGroup({ code, codeName, priority, items, empMap, resetKey, onExport, onRemove }: {
  code: string;
  codeName: string | null;
  priority: number;
  items: Deduction[];
  empMap: Map<string, Employee>;
  resetKey: unknown;
  onExport: (code: string) => void;
  onRemove: (d: Deduction) => void;
}) {
  const pag = usePagination(items, 10, resetKey);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-mono font-semibold">{code}</span>
          {codeName && <span className="text-sm text-slate-600">{codeName}</span>}
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700"
            title={`APDS priority ${priority} — Policy Library deped-001 (FY 2024 GAA Sec. 56)`}
          >
            #{priority} {DEDUCTION_PRIORITY_LABELS[priority] ?? 'Other'}
          </span>
          <span className="text-sm text-slate-600">{items.length} entries</span>
          <span className="text-sm font-medium text-slate-700">{currency(items.reduce((s, d) => s + d.amount, 0))}</span>
        </div>
        <button
          onClick={() => onExport(code)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> DBF
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
              <th className="text-left px-4 py-2 font-medium">Emp. No.</th>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Description</th>
              <th className="text-left px-4 py-2 font-medium">Effectivity</th>
              <th className="text-left px-4 py-2 font-medium">Type</th>
              <th className="text-left px-4 py-2 font-medium">Agency</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Reference</th>
              <th className="text-left px-4 py-2 font-medium">Source</th>
              <th className="text-right px-4 py-2 font-medium">Amount</th>
              <th className="text-right px-4 py-2 font-medium">Loan P/I</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pag.pagedItems.map((d) => {
              const e = empMap.get(d.employee_id);
              const effDisplay = [d.effmm, d.effyy].filter(Boolean).join('/') || '—';
              const principal = d.principal ?? 0;
              const interest = d.interest ?? 0;
              const hasLoan = principal > 0 || interest > 0;
              return (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{e?.employee_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-800">{e ? `${e.last_name}, ${e.first_name}` : 'Unknown'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{d.deduction_name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{effDisplay}</td>
                  <td className="px-4 py-2.5">
                    {d.type ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">{d.type}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{d.agency || '—'}</td>
                  <td className="px-4 py-2.5">
                    {d.status ? (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        d.status === 'Active' ? 'bg-emerald-50 text-emerald-700' :
                        d.status === 'Suspended' ? 'bg-amber-50 text-amber-700' :
                        'bg-rose-50 text-rose-700'
                      }`}>{d.status}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.reference || d.policyno || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      d.source === 'Upload' ? 'bg-blue-50 text-blue-700' :
                      d.source === 'DEDFILE' ? 'bg-violet-50 text-violet-700' :
                      'bg-slate-100 text-slate-500'
                    }`}>{d.source}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-700">{currency(d.amount)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                    {hasLoan ? `${currency(principal)}/${currency(interest)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => onRemove(d)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPageChange={pag.setPage} />
    </div>
  );
}

function UndeductedGroup({ code, codeName, base, priorityTagged, periodName, items, empMap, resetKey, onRemove }: {
  code: string;
  codeName: string | null;
  base: number;
  priorityTagged: boolean;
  periodName: string;
  items: UndeductedObligation[];
  empMap: Map<string, Employee>;
  resetKey: unknown;
  onRemove: (u: UndeductedObligation) => void;
}) {
  const pag = usePagination(items, 10, resetKey);
  return (
    <div className="bg-amber-50/40 rounded-xl border border-amber-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-amber-100 bg-amber-50">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-mono font-semibold">{code}</span>
          {codeName && <span className="text-sm text-slate-600">{codeName}</span>}
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700"
            title={`APDS priority ${base} — Policy Library deped-001 (FY 2024 GAA Sec. 56)`}
          >
            #{base} {DEDUCTION_PRIORITY_LABELS[base] ?? 'Other'}
          </span>
          {priorityTagged ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700" title="Tagged as priority in the deduction masterfile — keeps its APDS position">
              PRIORITY
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800" title="Least priority — deducted last, re-deducted first in later periods">
              UNDEDUCTED · LEAST PRIORITY
            </span>
          )}
          <span className="text-sm text-slate-600">{items.length} entr{items.length === 1 ? 'y' : 'ies'}</span>
          <span className="text-sm font-medium text-amber-700">{currency(items.reduce((s, u) => s + (Number(u.undeducted_amount) || 0), 0))}</span>
          {periodName && <span className="text-xs text-slate-400">{periodName}</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-amber-100">
              <th className="text-left px-4 py-2 font-medium">Emp. No.</th>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Description</th>
              <th className="text-right px-4 py-2 font-medium">Scheduled</th>
              <th className="text-right px-4 py-2 font-medium">Undeducted</th>
              <th className="text-left px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100/70">
            {pag.pagedItems.map((u) => {
              const e = empMap.get(u.employee_id);
              return (
                <tr key={u.id} className="hover:bg-amber-50/60">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{e?.employee_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-800">{e ? `${e.last_name}, ${e.first_name}` : 'Unknown'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{u.deduction_description || u.deduction_code}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-500">{currency(Number(u.scheduled_amount) || 0)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-amber-700">{currency(Number(u.undeducted_amount) || 0)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{u.reason || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => onRemove(u)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPageChange={pag.setPage} />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

// ── Upload Modal ───────────────────────────────────────────────────────

function UploadModal({
  employees, periodId, dedCodes, onClose, onImported,
}: {
  employees: Employee[];
  periodId: string;
  dedCodes: DeductionCode[];
  onClose: () => void;
  onImported: () => void;
}) {
  const dedCodeMap = new Map(dedCodes.map((c) => [c.dedcode, c]));
  const [text, setText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [matchRows, setMatchRows] = useState<DeductionUploadRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleParse(raw: string) {
    setText(raw);
    const result = parseDeductionFile(raw, { hasHeader: true });
    setParseResult(result);
    const empNumbers = new Set(employees.map((e) => e.employee_number));
    setMatchRows(matchRowsToEmployees(result.rows, empNumbers));
  }

  async function handleFile(file: File) {
    const validation = await validateUpload(file);
    if (!validation.valid) {
      setParseResult({ rows: [], delimiter: ',', headers: [], rawLines: [], errors: [validation.error ?? 'Invalid file'] });
      return;
    }
    const raw = await file.text();
    handleParse(raw);
  }

  async function doImport() {
    if (!parseResult) return;
    setImporting(true);
    const empByNumber = new Map(employees.map((e) => [e.employee_number, e]));
    const toInsert = parseResult.rows
      .filter((r) => empByNumber.has(r.employee_number))
      .map((r) => {
        const codeInfo = dedCodeMap.get(r.deduction_code);
        return {
          employee_id: empByNumber.get(r.employee_number)!.id,
          pay_period_id: periodId,
          deduction_code: r.deduction_code,
          deduction_name: r.deduction_name || codeInfo?.dedname || r.deduction_code,
          category: codeInfo?.type ?? 'Other',
          amount: r.amount,
          source: 'Upload',
          reference: r.reference,
        };
      });

    let count = 0;
    // Insert in batches of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase.from('deductions').insert(batch);
      if (!error) count += batch.length;
    }
    setImporting(false);
    setImported(count);
    setTimeout(() => onImported(), 1200);
  }

  const matchedCount = matchRows.filter((r) => r.matched).length;
  const unmatchedCount = matchRows.length - matchedCount;
  const totalAmount = parseResult?.rows.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-800">Upload Deductions from Text File</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-5">
          {/* Format help */}
          <div className="flex gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Expected format</p>
              <p className="text-xs text-blue-700">A header row followed by delimited rows (CSV, pipe, tab, or semicolon auto-detected). Required columns: employee number, deduction code, description, amount, reference.</p>
              <pre className="mt-2 text-[11px] bg-white/60 rounded p-2 font-mono overflow-x-auto">{`EMPNO|CODE|DESCRIPTION|AMOUNT|REFERENCE
EMP001|SSS|SSS Premium|581.30|2024-001
EMP002|PHIC|PhilHealth|437.50|2024-001
EMP003|TAX|Withholding Tax|1250.00|BIR-001`}</pre>
            </div>
          </div>

          {/* File picker */}
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.prn,.dat"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <Upload className="w-4 h-4" /> Choose File
            </button>
            <span className="text-xs text-slate-400">or paste text below</span>
          </div>

          {/* Text area */}
          <textarea
            value={text}
            onChange={(e) => handleParse(e.target.value)}
            placeholder="EMPNO,CODE,DESCRIPTION,AMOUNT,REFERENCE&#10;EMP001,SSS,SSS Premium,581.30,2024-001&#10;..."
            rows={5}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-y"
          />

          {/* Parse summary */}
          {parseResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <MiniStat label="Rows Parsed" value={String(parseResult.rows.length)} tone="slate" />
                <MiniStat label="Matched" value={String(matchedCount)} tone="emerald" />
                <MiniStat label="Unmatched" value={String(unmatchedCount)} tone="rose" />
                <MiniStat label="Total Amount" value={currency(totalAmount)} tone="amber" />
              </div>

              {parseResult.errors.length > 0 && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3">
                  <p className="text-sm font-medium text-rose-800 mb-1">Parse Errors ({parseResult.errors.length})</p>
                  <ul className="text-xs text-rose-700 space-y-0.5 max-h-28 overflow-y-auto">
                    {parseResult.errors.slice(0, 20).map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {matchRows.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-slate-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-3 py-2 font-medium">Emp. No.</th>
                        <th className="text-left px-3 py-2 font-medium">Code</th>
                        <th className="text-left px-3 py-2 font-medium">Description</th>
                        <th className="text-right px-3 py-2 font-medium">Amount</th>
                        <th className="text-center px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matchRows.slice(0, 100).map((r, i) => (
                        <tr key={i} className={r.matched ? '' : 'bg-rose-50/50'}>
                          <td className="px-3 py-2 font-mono text-xs">{r.employee_number}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.deduction_code}</td>
                          <td className="px-3 py-2 text-slate-600">{r.deduction_name}</td>
                          <td className="px-3 py-2 text-right font-medium">{currency(r.amount)}</td>
                          <td className="px-3 py-2 text-center">
                            {r.matched
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                              : <span className="inline-flex items-center gap-1 text-xs text-rose-600"><AlertTriangle className="w-3.5 h-3.5" /> No match</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {imported > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
              <CheckCircle2 className="w-4 h-4" /> Successfully imported {imported} deduction records.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">
            {matchedCount > 0 ? `${matchedCount} records will be imported.` : 'No matching employees found.'}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
            <button
              onClick={doImport}
              disabled={importing || matchedCount === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {importing ? 'Importing…' : `Import ${matchedCount} Records`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'emerald' | 'rose' | 'amber' }) {
  const tones = {
    slate: 'text-slate-700', emerald: 'text-emerald-600', rose: 'text-rose-600', amber: 'text-amber-600',
  };
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${tones[tone]} mt-0.5`}>{value}</p>
    </div>
  );
}

// ── Manual Entry Modal ─────────────────────────────────────────────────

function ManualDeductionModal({
  employees, periodId, dedCodes, onClose, onSaved,
}: {
  employees: Employee[];
  periodId: string;
  dedCodes: DeductionCode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [empId, setEmpId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dedCodeMap = new Map(dedCodes.map((c) => [c.dedcode, c]));

  async function save() {
    if (!empId || !code || amount <= 0) { setError('Employee, code, and a positive amount are required.'); return; }
    setSaving(true);
    const codeInfo = dedCodeMap.get(code);
    const { error: err } = await supabase.from('deductions').insert({
      employee_id: empId, pay_period_id: periodId, deduction_code: code,
      deduction_name: name || codeInfo?.dedname || code,
      category: codeInfo?.type ?? 'Other',
      amount, source: 'Manual', reference: ref,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Add Deduction</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-sm">{error}</div>}
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">Employee</span>
            <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls}>
              <option value="">Select employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.employee_number} — {e.last_name}, {e.first_name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs text-slate-600 mb-1">Deduction Code</span>
              <select value={code} onChange={(e) => {
                const c = e.target.value;
                setCode(c);
                const info = dedCodeMap.get(c);
                if (info) setName(info.dedname);
              }} className={inputCls}>
                <option value="">Select code…</option>
                {dedCodes.map((c) => <option key={c.dedcode} value={c.dedcode}>{c.dedcode} — {c.dedname}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-slate-600 mb-1">Amount</span>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className={inputCls} />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">Description</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SSS Premium" className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">Reference</span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Add Deduction'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// B-Deduction File — PAYFMEN2
//
// Ported from the FoxPro deduction-file branch (PAYFMEN2.PRG) and the programs
// behind each of its seven prompts:
//
//   1. View ............ PAYDFVUE → PAYDFVW1 one record / screen,
//                                   PAYDFVW2 abstract, PAYDFVW4 abstract by code
//   2. Edit ............ PAYDFMED → PAYDFGSE (GSIS)     | PAYDFEDT (Others)
//   3. Delete .......... PAYDFMDE → PAYDFGSD (GSIS)     | PAYDFDEL (Others)
//   4. Add ............. PAYDFMAD → PAYDFGSA (GSIS)     | PAYDFADD (Others)
//   5. Print Billing ... PAYDFBFL → PAYDFBLG (GSIS)     | PAYDFUP1 (Others)
//   6. Upload Billing .. PAYDFBFU → PAYDFG1/G2/GDV/GEV/GAV (GSIS)
//                                 | PAYDFUP2/DE2/ED2/AD2 (Others)
//   7. Download ........ PAYDFMEX → PAYDFEXG error-file menu (GSIS)
//                                 | PAYDFEX1 extract per code (Others)
//
// The legacy keeps TWO DOORS into the one file and keys them differently — the
// part of the branch this port must not lose:
//
//   • GSIS   — keyed on the GSIS business partner number (`gsis_bpn`, the ten
//              digits the master file shows as GSIS_ID). GSIS codes may only be
//              touched through this door; the Others door answers with the
//              legacy line "This is GSIS Code; Use menu for GSIS".
//   • Others — keyed on the employee number and the policy/loan number.
//
// V3 keeps the file in `deductions` — the rows this screen already lists — and
// the master file's BP number in `employees.gsis_id`.
//
// The legacy sort key is EMPNO+P+YY+MM+DD+HR+MIN+DEDCODE+POLICYNO. These rows
// do not carry the period prefix, so every ledger below orders by EMPNO,
// DEDCODE, POLICYNO — the same sequence with the period coordinates dropped.
//
// Two legacy writes have no V3 home and are not faked: the Others delete's
// JED/PAYJOB journal rows, and the DEDTABLE per-code interest/charges ceilings
// (`max_inte` / `max_char`) which the code table does not carry here — the
// principal is used as the ceiling instead.
// ══════════════════════════════════════════════════════════════════════════════

type LegacyLeg = 'GSIS' | 'OTHERS';
type LegacyStep = 'view' | 'edit' | 'delete' | 'add' | 'print' | 'upload' | 'download';

interface LegacyChoice { id: string; label: string; note?: string }
interface LegacyStepDef { step: LegacyStep; label: string; legacy: string; choices: LegacyChoice[] }

const LEGACY_QUIT: LegacyChoice = { id: 'quit', label: 'Q u i t' };

/** PAYFMEN2's seven prompts, each with the sub-menu the legacy opens. */
const LEGACY_STEPS: LegacyStepDef[] = [
  {
    step: 'view', label: 'View', legacy: 'PAYDFVUE',
    choices: [
      { id: 'one', label: 'One Record / Screen', note: 'PAYDFVW1' },
      { id: 'all', label: 'All Deduction Records', note: 'PAYDFVW2' },
      { id: 'code', label: 'By Deduction Code', note: 'PAYDFVW4' },
      LEGACY_QUIT,
    ],
  },
  {
    step: 'edit', label: 'Edit', legacy: 'PAYDFMED',
    choices: [
      { id: 'gsis', label: 'G S I S', note: 'PAYDFGSE — keyed on the GSIS BP number' },
      { id: 'others', label: 'Others', note: 'PAYDFEDT — keyed on the employee number' },
      LEGACY_QUIT,
    ],
  },
  {
    step: 'delete', label: 'Delete', legacy: 'PAYDFMDE',
    choices: [
      { id: 'gsis', label: 'G S I S', note: 'PAYDFGSD' },
      { id: 'others', label: 'Others', note: 'PAYDFDEL' },
      LEGACY_QUIT,
    ],
  },
  {
    step: 'add', label: 'Add', legacy: 'PAYDFMAD',
    choices: [
      { id: 'gsis', label: 'G S I S', note: 'PAYDFGSA' },
      { id: 'others', label: 'Others', note: 'PAYDFADD' },
      LEGACY_QUIT,
    ],
  },
  {
    step: 'print', label: 'Print Billing', legacy: 'PAYDFBFL',
    choices: [
      { id: 'gsis', label: 'G S I S', note: 'PAYDFBLG — list contents of billing file' },
      { id: 'others', label: 'Others', note: 'PAYDFUP1 — list contents of billing file' },
      LEGACY_QUIT,
    ],
  },
  {
    step: 'upload', label: 'Upload Billing', legacy: 'PAYDFBFU',
    choices: [
      { id: 'gsis', label: 'G S I S', note: 'PAYDFG1 · G2 · GDV · GEV · GAV' },
      { id: 'others', label: 'Others', note: 'PAYDFUP2 · DE2 · ED2 · AD2' },
      LEGACY_QUIT,
    ],
  },
  {
    step: 'download', label: 'Download', legacy: 'PAYDFMEX',
    choices: [
      { id: 'gsis', label: 'G S I S', note: 'PAYDFEXG — error files, invalid BP numbers' },
      { id: 'others', label: 'Others', note: 'PAYDFEX1 — extract deduction records per code' },
      LEGACY_QUIT,
    ],
  },
];

// ── Shared helpers ──────────────────────────────────────────────────────────

function empNumberOf(emp?: Employee | null): string {
  return String(emp?.employee_number || emp?.empno || '').trim();
}

/** "F M I LNAME APPEL", the way the legacy prints a name on every ledger. */
function empDisplayName(emp?: Employee | null): string {
  if (!emp) return 'Unknown';
  const mi = String(emp.mi ?? '').trim();
  const first = String(emp.fname || emp.first_name || '').trim();
  const last = String(emp.lname || emp.last_name || '').trim();
  const appel = String(emp.appel ?? '').trim();
  return `${first}${mi ? ` ${mi.charAt(0)}.` : ''} ${last}${appel ? ` ${appel}` : ''}`.replace(/\s+/g, ' ').trim();
}

/** MASTFILE fields the legacy reads that are not on the Employee type. */
function empField(emp: Employee | null | undefined, field: string): string {
  if (!emp) return '';
  const v = (emp as unknown as Record<string, unknown>)[field];
  return v == null ? '' : String(v);
}

function empNumberValue(emp: Employee | null | undefined, field: string): number {
  const n = Number(empField(emp, field));
  return Number.isFinite(n) ? n : 0;
}

function findEmployeeByNumber(employees: Employee[], number: string): Employee | undefined {
  const k = number.trim().toUpperCase();
  // An empty key must match nothing: some master rows carry a blank employee
  // number, and a seek on "" would otherwise land on the first of them.
  if (!k) return undefined;
  return employees.find((e) => empNumberOf(e).toUpperCase() === k);
}

/** The GSIS door's key: the BP number is the master file's GSIS_ID. */
function findEmployeeByBpn(employees: Employee[], bpn: string): Employee | undefined {
  const k = bpn.trim().toUpperCase();
  if (!k) return undefined;
  return employees.find((e) =>
    String(e.gsis_id ?? '').trim().toUpperCase() === k
    || String(e.gsis_pn ?? '').trim().toUpperCase() === k,
  );
}

function codeAgencyOf(code: string, codes: Map<string, DeductionCode>): string {
  return String(codes.get(code.trim().toUpperCase())?.agency ?? '').trim().toUpperCase();
}

function codeNameOf(code: string, codes: Map<string, DeductionCode>): string {
  return String(codes.get(code.trim().toUpperCase())?.dedname ?? '');
}

function isGsisCode(code: string, codes: Map<string, DeductionCode>): boolean {
  return codeAgencyOf(code, codes) === 'GSIS';
}

/** EMPNO → DEDCODE → POLICYNO, the legacy sequence minus the period prefix. */
function ledgerSort(rows: Deduction[], keyOf: (r: Deduction) => string): Deduction[] {
  return [...rows].sort((a, b) =>
    keyOf(a).localeCompare(keyOf(b))
    || String(a.deduction_code ?? '').localeCompare(String(b.deduction_code ?? ''))
    || String(a.policyno ?? '').localeCompare(String(b.policyno ?? '')),
  );
}

function empnoKeyOf(empMap: Map<string, Employee>) {
  return (r: Deduction) => empNumberOf(empMap.get(r.employee_id));
}

/** The legacy seek: GSIS on BPN+DEDCODE, Others on EMPNO+DEDCODE+POLICYNO. */
function matchLegacyRows(
  rows: Deduction[],
  leg: LegacyLeg,
  key: string,
  code: string,
  policy: string,
  empMap: Map<string, Employee>,
): Deduction[] {
  const k = key.trim().toUpperCase();
  const c = code.trim().toUpperCase();
  const p = policy.trim().toUpperCase();
  // No key, no seek — see findEmployeeByNumber above.
  if (!k) return [];
  return rows.filter((r) => {
    if (c && String(r.deduction_code ?? '').toUpperCase() !== c) return false;
    if (leg === 'GSIS') {
      if (String(r.gsis_bpn ?? '').trim().toUpperCase() !== k) return false;
    } else if (empNumberOf(empMap.get(r.employee_id)).toUpperCase() !== k) {
      return false;
    }
    if (p && String(r.policyno ?? '').toUpperCase() !== p) return false;
    return true;
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Shared chrome ───────────────────────────────────────────────────────────

function ModalShell({ title, subtitle, onClose, footer, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">{footer}</div>
        )}
      </div>
    </div>
  );
}

function Notice({ notice }: { notice: { tone: 'error' | 'info'; text: string } | null }) {
  if (!notice) return null;
  const error = notice.tone === 'error';
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${error ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>
      {error ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <Info className="w-4 h-4 shrink-0 mt-0.5" />}
      <span>{notice.text}</span>
    </div>
  );
}

function ReadOut({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-800 font-medium text-right">{value || '—'}</span>
    </div>
  );
}

function MoneyField({ label, value, onChange, error }: {
  label: string; value: number; onChange: (n: number) => void; error?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-600 mb-1">{label}</span>
      <input
        type="number" step="0.01" value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${error ? 'border-rose-300' : 'border-slate-200 focus:border-emerald-400'}`}
      />
      {error && <span className="block text-[11px] text-rose-600 mt-1">{error}</span>}
    </label>
  );
}

// ── 1. The menu itself — PAYFMEN2 ───────────────────────────────────────────

function DedFileMenu({ onAction }: { onAction: (step: LegacyStep, choice: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<LegacyStep | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setStep(null); }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = LEGACY_STEPS.find((s) => s.step === step) ?? null;

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => { setOpen((o) => !o); setStep(null); }}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        title="B-Deduction File (PAYFMEN2)"
      >
        <FileText className="w-4 h-4" /> Deduction File <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          {!active ? (
            <>
              <p className="px-4 py-2 text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                B-Deduction File · PAYFMEN2
              </p>
              <ul className="py-1">
                {LEGACY_STEPS.map((s, i) => (
                  <li key={s.step}>
                    <button
                      onClick={() => setStep(s.step)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <span><span className="text-slate-400 mr-2">{i + 1}.</span>{s.label}</span>
                      <span className="text-[10px] text-slate-400">{s.legacy}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(null)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50 border-b border-slate-100 hover:bg-slate-100"
              >
                <ChevronLeft className="w-4 h-4" /> {active.label}
                <span className="ml-auto text-[10px] font-normal text-slate-400">{active.legacy}</span>
              </button>
              <ul className="py-1">
                {active.choices.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => { onAction(active.step, c.id); setOpen(false); setStep(null); }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {c.label}
                      {c.note && <span className="block text-[10px] text-slate-400">{c.note}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── 1a. View — one record / screen (PAYDFVW1) ──────────────────────────────

function ViewOneRecordModal({ rows, empMap, codes, onClose }: {
  rows: Deduction[]; empMap: Map<string, Employee>; codes: Map<string, DeductionCode>; onClose: () => void;
}) {
  const ledger = ledgerSort(rows, empnoKeyOf(empMap));
  const [pt, setPt] = useState(1); // the legacy PT, 1-based
  const total = ledger.length;
  const row = total > 0 ? ledger[Math.min(pt, total) - 1] : undefined;
  const emp = row ? empMap.get(row.employee_id) : undefined;
  const gsis = row ? String(row.agency ?? '').toUpperCase() === 'GSIS' || isGsisCode(row.deduction_code, codes) : false;
  const netPay = empNumberValue(emp, 'netpay');
  const netNet = netPay - Number(row?.amount ?? 0);

  return (
    <ModalShell
      title="D E D U C T I O N   F I L E"
      subtitle="View · One Record / Screen (PAYDFVW1) — Next and Previous walk the file in EMPNO / DEDCODE / POLICYNO order"
      onClose={onClose}
      footer={total > 0 ? (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {pt <= 1 && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Top of File</span>}
            {pt >= total && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">Bottom of File</span>}
            <span className="font-mono">{pt} / {total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPt((p) => Math.max(1, p - 1))} disabled={pt <= 1}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button onClick={() => setPt((p) => Math.min(total, p + 1))} disabled={pt >= total}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
              Next <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900">Quit</button>
          </div>
        </>
      ) : (
        <span className="text-sm text-slate-500">NOTHING TO DISPLAY</span>
      )}
    >
      {!row ? (
        <p className="py-12 text-center text-sm text-slate-500">The deduction file holds no records.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Employee</p>
            <ReadOut label="Stn" value={String(row.stacode || empField(emp, 'stacode'))} />
            <ReadOut label="Emp No." value={empNumberOf(emp)} />
            <ReadOut label="Name" value={empDisplayName(emp)} />
            <ReadOut label="Reg / Div" value={[empField(emp, 'regcode'), empField(emp, 'divcode')].filter(Boolean).join(' / ')} />
            <ReadOut label="Net Pay" value={currency(netPay)} />
            <ReadOut label="Net-net (Net Pay − Deduction)" value={currency(netNet)} />
            <ReadOut label="Absences / Undertime" value={`${row.absno ?? 0}d ${row.underhr ?? 0}h ${row.undermin ?? 0}m`} />
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-4 mb-2">Deduction</p>
            <ReadOut label="Code" value={`${row.deduction_code} ${codeNameOf(row.deduction_code, codes) || row.deduction_name}`} />
            <ReadOut
              label={gsis ? 'GSIS BP No.' : 'Policy / Loan No.'}
              value={gsis ? String(row.gsis_bpn ?? '') : String(row.policyno ?? '')}
            />
            <ReadOut label="Agency / Type" value={[row.agency, row.type].filter(Boolean).join(' · ')} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Schedule</p>
            <ReadOut label="Effectivity" value={[row.effyy, row.effmm].filter(Boolean).join(' ')} />
            <ReadOut label="Term" value={[row.teryy, row.termm].filter(Boolean).join(' ')} />
            <ReadOut label="Policy date" value={String(row.policydate ?? '')} />
            <ReadOut label="Amount" value={currency(Number(row.amount) || 0)} />
            <ReadOut label="Principal" value={currency(Number(row.principal) || 0)} />
            <ReadOut label="Interest" value={currency(Number(row.interest) || 0)} />
            <ReadOut label="Charges" value={currency(Number(row.charges) || 0)} />
            <ReadOut label="Proceeds" value={currency(Number(row.proceeds) || 0)} />
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-4 mb-2">Record</p>
            <ReadOut label="Status" value={String(row.status ?? '')} />
            <ReadOut label="Pay date" value={String(row.paydate ?? '')} />
            <ReadOut label="Editor" value={String(row.editor ?? '')} />
            <ReadOut label="Source" value={String(row.source ?? '')} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── 1b. View — the abstract (PAYDFVW2) / abstract by code (PAYDFVW4) ───────

const ABSTRACT_PAGE = 17; // the legacy screen prints CTR < 18 rows

function ViewAbstractModal({ rows, empMap, codes, mode, onClose }: {
  rows: Deduction[]; empMap: Map<string, Employee>; codes: Map<string, DeductionCode>;
  mode: 'all' | 'code'; onClose: () => void;
}) {
  const [wanted, setWanted] = useState('');       // what the operator typed
  const [applied, setApplied] = useState(mode === 'all' ? '' : null as string | null);
  const [page, setPage] = useState(1);

  const ledger = ledgerSort(rows, empnoKeyOf(empMap));
  const shown = applied ? ledger.filter((r) => String(r.deduction_code ?? '').toUpperCase() === applied.toUpperCase()) : ledger;
  const pages = Math.max(1, Math.ceil(shown.length / ABSTRACT_PAGE));
  const current = Math.min(page, pages);
  const slice = shown.slice((current - 1) * ABSTRACT_PAGE, current * ABSTRACT_PAGE);
  const atTop = current <= 1;
  const atBottom = current >= pages;

  function applyCode() {
    const c = wanted.trim().toUpperCase();
    if (!c) return;
    setApplied(c);
    setPage(1);
  }

  const name = applied ? codeNameOf(applied, codes) : '';

  return (
    <ModalShell
      title="Abstract of Deductions"
      subtitle={`View · ${mode === 'code' ? 'By Deduction Code (PAYDFVW4)' : 'All Deduction Records (PAYDFVW2)'} — ${ABSTRACT_PAGE} rows a screen, the legacy page size`}
      onClose={onClose}
      footer={(
        <>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {shown.length > 0 && atTop && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Top of File</span>}
            {shown.length > 0 && atBottom && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">Bottom of File</span>}
            <span>{shown.length} record(s)</span>
            <span className="font-mono">page {current} / {pages}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(1, current - 1))} disabled={atTop}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" /> PageUp
            </button>
            <button onClick={() => setPage(Math.min(pages, current + 1))} disabled={atBottom}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
              PageDown <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900">Quit</button>
          </div>
        </>
      )}
    >
      {mode === 'code' && (
        <div className="flex flex-wrap items-end gap-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200">
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">Enter Code</span>
            <input
              value={wanted}
              onChange={(e) => setWanted(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') applyCode(); }}
              placeholder="DEDCODE"
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </label>
          <button onClick={applyCode} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            Confirm
          </button>
          {applied && <span className="text-sm text-slate-600">{name || 'Unknown code'}</span>}
          {applied && (
            <button onClick={() => { setApplied(''); setPage(1); }} className="text-xs text-slate-500 underline">
              show every record
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">Nothing to Display</p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left px-3 py-2 font-medium">Stn</th>
                <th className="text-left px-3 py-2 font-medium">Emp No.</th>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Code</th>
                <th className="text-left px-3 py-2 font-medium">GSIS BP / PN</th>
                <th className="text-left px-3 py-2 font-medium">Effect</th>
                <th className="text-left px-3 py-2 font-medium">Term</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slice.map((r) => {
                const emp = empMap.get(r.employee_id);
                const gsis = String(r.agency ?? '').toUpperCase() === 'GSIS' || isGsisCode(r.deduction_code, codes);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs text-slate-500">{r.stacode || empField(emp, 'stacode') || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{empNumberOf(emp) || '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{empDisplayName(emp)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.deduction_code}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{gsis ? String(r.gsis_bpn ?? '—') : String(r.policyno ?? '—')}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{[r.effyy, r.effmm].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{[r.teryy, r.termm].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{currency(Number(r.amount) || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  );
}

// ── 2. Edit — PAYDFGSE (GSIS) / PAYDFEDT (Others) ─────────────────────────

interface AmountForm {
  principal: number; interest: number; charges: number; proceeds: number; amount: number;
  absno: number; underhr: number; undermin: number;
}

function amountsOf(row: Deduction): AmountForm {
  return {
    principal: Number(row.principal) || 0,
    interest: Number(row.interest) || 0,
    charges: Number(row.charges) || 0,
    proceeds: Number(row.proceeds) || 0,
    amount: Number(row.amount) || 0,
    absno: Number(row.absno) || 0,
    underhr: Number(row.underhr) || 0,
    undermin: Number(row.undermin) || 0,
  };
}

/** The two validations both edit doors share; the ceilings are the principal. */
function amountErrors(f: AmountForm) {
  const ceiled = (n: number, label: string) => (n < 0 || n > f.principal ? `${label} may not exceed the principal.` : '');
  return {
    amount: f.amount === 0 ? 'Enter a deduction amount — it may not be zero.' : '',
    interest: ceiled(f.interest, 'Interest'),
    charges: ceiled(f.charges, 'Charges'),
    proceeds: f.proceeds < 0 || f.proceeds > f.principal - (f.interest + f.charges)
      ? 'Proceeds may not exceed principal − (interest + charges).'
      : '',
  };
}

function EditDeductionModal({ leg, rows, employees, empMap, codes, editor, onClose, onSaved }: {
  leg: LegacyLeg; rows: Deduction[]; employees: Employee[]; empMap: Map<string, Employee>;
  codes: Map<string, DeductionCode>; editor: string; onClose: () => void; onSaved: () => void;
}) {
  const gsis = leg === 'GSIS';
  const [stage, setStage] = useState<'key' | 'confirm' | 'edit'>('key');
  const [key, setKey] = useState('');
  const [code, setCode] = useState('');
  const [policy, setPolicy] = useState('');
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [target, setTarget] = useState<Deduction | null>(null);
  const [form, setForm] = useState<AmountForm>({ principal: 0, interest: 0, charges: 0, proceeds: 0, amount: 0, absno: 0, underhr: 0, undermin: 0 });
  const [saving, setSaving] = useState(false);

  const errors = amountErrors(form);
  const emp = target ? empMap.get(target.employee_id) : undefined;

  function find() {
    setNotice(null); setTarget(null); setStage('key');
    const k = key.trim();
    if (!k) { setNotice({ tone: 'error', text: gsis ? 'ENTER GSIS BUSINESS PARTNER NUMBER' : 'ENTER EMPLOYEE NUMBER' }); return; }
    if (gsis) {
      if (!findEmployeeByBpn(employees, k)) { setNotice({ tone: 'error', text: 'No Master Record' }); return; }
    } else if (!findEmployeeByNumber(employees, k)) {
      setNotice({ tone: 'error', text: 'No Master Record' }); return;
    }
    const c = code.trim().toUpperCase();
    if (!c) { setNotice({ tone: 'error', text: 'ENTER DEDUCTION CODE' }); return; }
    if (!codes.get(c)) { setNotice({ tone: 'error', text: 'Invalid Code' }); return; }
    if (gsis && !isGsisCode(c, codes)) {
      setNotice({ tone: 'error', text: `YOU MAY NOT USE THIS DEDUCTION CODE — ${c} is not a GSIS code. Use the Others door.` }); return;
    }
    if (!gsis && isGsisCode(c, codes)) { setNotice({ tone: 'error', text: 'This is GSIS Code; Use menu for GSIS' }); return; }
    const hits = matchLegacyRows(rows, leg, k, c, policy, empMap);
    if (hits.length === 0) { setNotice({ tone: 'error', text: 'DEDUCTION RECORD NOT IN FILE' }); return; }
    setTarget(hits[0]);
    setForm(amountsOf(hits[0]));
    setStage('confirm');
  }

  async function save() {
    if (!target) return;
    if (errors.amount || errors.interest || errors.charges || errors.proceeds) return;
    setSaving(true);
    const patch: Record<string, unknown> = {
      principal: form.principal, interest: form.interest, charges: form.charges,
      proceeds: form.proceeds, amount: form.amount,
      editor, paydate: todayIso(),
    };
    // Undertime belongs to the Others door, exactly as in PAYDFEDT.
    if (!gsis) { patch.absno = form.absno; patch.underhr = form.underhr; patch.undermin = form.undermin; }
    const { error } = await supabase.from('deductions').update(patch).eq('id', target.id);
    setSaving(false);
    if (error) { setNotice({ tone: 'error', text: error.message }); return; }
    onSaved();
  }

  const keyLabel = gsis ? 'GSIS Business Partner No.' : 'Employee No.';

  return (
    <ModalShell
      title={`E D I T — ${gsis ? 'GSIS' : 'Others'}`}
      subtitle={gsis
        ? 'PAYDFMED → PAYDFGSE · the record is found by GSIS BP number + deduction code'
        : 'PAYDFMED → PAYDFEDT · the record is found by employee number + deduction code + policy number'}
      onClose={onClose}
      footer={stage === 'confirm' ? (
        <>
          <span className="text-xs text-slate-500">EDIT THIS RECORD ?</span>
          <div className="flex items-center gap-2">
            <button onClick={() => { setTarget(null); setStage('key'); }} className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">No — get another record</button>
            <button onClick={() => setStage('edit')} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">Yes — edit</button>
          </div>
        </>
      ) : stage === 'edit' ? (
        <>
          <button onClick={() => { setStage('key'); setTarget(null); }} className="text-xs text-slate-500 underline">Edit another record</button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">Quit</button>
            <button onClick={save} disabled={saving || !!errors.amount || !!errors.interest || !!errors.charges || !!errors.proceeds}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : (
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">Quit</button>
      )}
    >
      <Notice notice={notice} />

      {stage === 'key' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">{keyLabel}</span>
            <input value={key} onChange={(e) => setKey(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </label>
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">Deduction Code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            {code && <span className="block text-[11px] text-slate-400 mt-1">{codeNameOf(code, codes) || 'Unknown code'}{codeAgencyOf(code, codes) ? ` · ${codeAgencyOf(code, codes)}` : ''}</span>}
          </label>
          <label className="block">
            <span className="block text-xs text-slate-600 mb-1">Policy / Loan No. {gsis ? '(optional)' : ''}</span>
            <input value={policy} onChange={(e) => setPolicy(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </label>
          <div className="sm:col-span-3 flex items-center gap-3">
            <button onClick={find} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900">
              <Search className="w-4 h-4" /> Find record
            </button>
            <span className="text-xs text-slate-400">Keyed the same way the legacy seeks the file.</span>
          </div>
        </div>
      )}

      {target && stage !== 'key' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Record</p>
            <ReadOut label="Emp No." value={empNumberOf(emp)} />
            <ReadOut label="Name" value={empDisplayName(emp)} />
            <ReadOut label="Code" value={`${target.deduction_code} ${codeNameOf(target.deduction_code, codes) || target.deduction_name}`} />
            <ReadOut label={gsis ? 'GSIS BP No.' : 'Policy / Loan No.'} value={gsis ? String(target.gsis_bpn ?? '') : String(target.policyno ?? '')} />
            <ReadOut label="Effectivity / Term" value={`${[target.effyy, target.effmm].filter(Boolean).join(' ')} → ${[target.teryy, target.termm].filter(Boolean).join(' ')}`} />
          </div>
          {stage === 'edit' ? (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Amounts</p>
              <div className="grid grid-cols-2 gap-3">
                <MoneyField label="Principal" value={form.principal} onChange={(n) => setForm({ ...form, principal: n })} />
                <MoneyField label="Interest" value={form.interest} onChange={(n) => setForm({ ...form, interest: n })} error={errors.interest} />
                <MoneyField label="Charges" value={form.charges} onChange={(n) => setForm({ ...form, charges: n })} error={errors.charges} />
                <MoneyField label="Proceeds" value={form.proceeds} onChange={(n) => setForm({ ...form, proceeds: n })} error={errors.proceeds} />
                <MoneyField label="Deduction Amount" value={form.amount} onChange={(n) => setForm({ ...form, amount: n })} error={errors.amount} />
              </div>
              {!gsis && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Absences / Undertime — Days · Hours · Minutes</p>
                  <div className="grid grid-cols-3 gap-3">
                    <input type="number" min="0" value={form.absno} onChange={(e) => setForm({ ...form, absno: parseInt(e.target.value, 10) || 0 })} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                    <input type="number" min="0" value={form.underhr} onChange={(e) => setForm({ ...form, underhr: parseInt(e.target.value, 10) || 0 })} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                    <input type="number" min="0" value={form.undermin} onChange={(e) => setForm({ ...form, undermin: parseInt(e.target.value, 10) || 0 })} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Amounts on file</p>
              <ReadOut label="Deduction Amount" value={currency(Number(target.amount) || 0)} />
              <ReadOut label="Principal" value={currency(Number(target.principal) || 0)} />
              <ReadOut label="Interest" value={currency(Number(target.interest) || 0)} />
              <ReadOut label="Charges" value={currency(Number(target.charges) || 0)} />
              <ReadOut label="Proceeds" value={currency(Number(target.proceeds) || 0)} />
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

// ── 3. Delete — PAYDFGSD (GSIS) / PAYDFDEL (Others) ─────────────────────────

function DeleteDeductionModal({ leg, rows, empMap, codes, onClose, onSaved }: {
  leg: LegacyLeg; rows: Deduction[]; empMap: Map<string, Employee>;
  codes: Map<string, DeductionCode>; onClose: () => void; onSaved: () => void;
}) {
  const gsis = leg === 'GSIS';
  const [key, setKey] = useState('');
  const [code, setCode] = useState('');
  const [policy, setPolicy] = useState('');
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [target, setTarget] = useState<Deduction | null>(null);
  const [deleting, setDeleting] = useState(false);

  function find() {
    setNotice(null); setTarget(null);
    const k = key.trim().toUpperCase();
    if (!k) { setNotice({ tone: 'error', text: gsis ? 'ENTER GSIS BUSINESS PARTNER NUMBER' : 'ENTER EMPLOYEE NUMBER' }); return; }
    const c = code.trim().toUpperCase();
    if (!c) { setNotice({ tone: 'error', text: 'ENTER DEDUCTION CODE' }); return; }
    if (gsis && !isGsisCode(c, codes)) { setNotice({ tone: 'error', text: `YOU MAY NOT USE THIS DEDUCTION CODE — ${c} is not a GSIS code.` }); return; }
    if (!gsis && isGsisCode(c, codes)) { setNotice({ tone: 'error', text: 'This is GSIS Code; Use menu for GSIS' }); return; }
    const hits = matchLegacyRows(rows, leg, k, c, policy, empMap);
    if (hits.length === 0) { setNotice({ tone: 'error', text: 'DEDUCTION RECORD NOT IN FILE' }); return; }
    setTarget(hits[0]);
  }

  async function remove() {
    if (!target) return;
    setDeleting(true);
    const { error } = await supabase.from('deductions').delete().eq('id', target.id);
    setDeleting(false);
    if (error) { setNotice({ tone: 'error', text: error.message }); return; }
    onSaved();
  }

  const emp = target ? empMap.get(target.employee_id) : undefined;

  return (
    <ModalShell
      title={`D E L E T E — ${gsis ? 'GSIS' : 'Others'}`}
      subtitle={gsis
        ? 'PAYDFMDE → PAYDFGSD · found by GSIS BP number + deduction code'
        : 'PAYDFMDE → PAYDFDEL · found by employee number + deduction code + policy number'}
      onClose={onClose}
      footer={target ? (
        <>
          <span className="text-xs text-slate-500">DELETE THIS RECORD ?</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setTarget(null)} className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">No — get another record</button>
            <button onClick={remove} disabled={deleting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-60">
              <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </>
      ) : (
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">Quit</button>
      )}
    >
      <Notice notice={notice} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">{gsis ? 'GSIS Business Partner No.' : 'Employee No.'}</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Deduction Code</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Policy / Loan No.</span>
          <input value={policy} onChange={(e) => setPolicy(e.target.value.toUpperCase())} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
        </label>
      </div>
      <button onClick={find} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900">
        <Search className="w-4 h-4" /> Find record
      </button>

      {target && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 pt-2">
          <div>
            <ReadOut label="Emp No." value={empNumberOf(emp)} />
            <ReadOut label="Name" value={empDisplayName(emp)} />
            <ReadOut label="Code" value={`${target.deduction_code} ${codeNameOf(target.deduction_code, codes) || target.deduction_name}`} />
          </div>
          <div>
            <ReadOut label={gsis ? 'GSIS BP No.' : 'Policy / Loan No.'} value={gsis ? String(target.gsis_bpn ?? '') : String(target.policyno ?? '')} />
            <ReadOut label="Amount" value={currency(Number(target.amount) || 0)} />
            <ReadOut label="Effectivity / Term" value={`${[target.effyy, target.effmm].filter(Boolean).join(' ')} → ${[target.teryy, target.termm].filter(Boolean).join(' ')}`} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── 4. Add — PAYDFGSA (GSIS) / PAYDFADD (Others) ────────────────────────────

function AddDeductionModal({ leg, rows, employees, empMap, codes, periodId, editor, onClose, onSaved }: {
  leg: LegacyLeg; rows: Deduction[]; employees: Employee[]; empMap: Map<string, Employee>;
  codes: Map<string, DeductionCode>; periodId: string; editor: string;
  onClose: () => void; onSaved: () => void;
}) {
  const gsis = leg === 'GSIS';
  const [key, setKey] = useState('');
  const [code, setCode] = useState('');
  const [policy, setPolicy] = useState('');
  const [policyDate, setPolicyDate] = useState('');
  const [agent, setAgent] = useState('');
  const [form, setForm] = useState<AmountForm>({ principal: 0, interest: 0, charges: 0, proceeds: 0, amount: 0, absno: 0, underhr: 0, undermin: 0 });
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [ready, setReady] = useState(false);
  const [existing, setExisting] = useState<Deduction | null>(null);
  const [addToExisting, setAddToExisting] = useState<AmountForm | null>(null);
  const [saving, setSaving] = useState(false);

  const errors = amountErrors(form);

  /** The key prompt, the master-file lookup and the status gate (both doors). */
  function checkKey() {
    setNotice(null); setEmployee(null); setReady(false); setExisting(null); setAddToExisting(null);
    const k = key.trim();
    if (!k) { setNotice({ tone: 'error', text: gsis ? 'ENTER GSIS BUSINESS PARTNER NUMBER' : 'ENTER EMPLOYEE NUMBER' }); return; }
    const emp = gsis ? findEmployeeByBpn(employees, k) : findEmployeeByNumber(employees, k);
    if (!emp) { setNotice({ tone: 'error', text: 'No Master Record' }); return; }
    const status = empField(emp, 'status').toUpperCase();
    if (status.includes('INACTIVE')) { setNotice({ tone: 'error', text: 'Employee in Inactive Status' }); return; }
    if (status.includes('RETIRED')) { setNotice({ tone: 'error', text: 'Employee Retired, record ignored' }); return; }

    const c = code.trim().toUpperCase();
    if (!c) { setNotice({ tone: 'error', text: 'ENTER DEDUCTION CODE' }); return; }
    if (!codes.get(c)) { setNotice({ tone: 'error', text: 'Invalid Code' }); return; }
    if (gsis && !isGsisCode(c, codes)) { setNotice({ tone: 'error', text: `YOU MAY NOT USE THIS DEDUCTION CODE — ${c} is not a GSIS code. Use the Others door.` }); return; }
    if (!gsis && isGsisCode(c, codes)) { setNotice({ tone: 'error', text: 'This is GSIS Code; Use menu for GSIS' }); return; }

    setEmployee(emp);
    setReady(true);
    setNotice({ tone: 'info', text: `Master record found — ${empNumberOf(emp)} ${empDisplayName(emp)}.` });
  }

  async function save() {
    if (!employee || !ready) { checkKey(); return; }
    if (errors.amount || errors.interest || errors.charges || errors.proceeds) return;

    const c = code.trim().toUpperCase();
    // The legacy keeps one row per key + code + policy. If it is already there
    // it offers to add the new amounts onto it rather than refusing.
    const same = matchLegacyRows(rows, leg, key, c, policy, empMap)
      .find((r) => r.employee_id === employee.id);
    if (same && !addToExisting) {
      setExisting(same);
      setAddToExisting({ principal: 0, interest: 0, charges: 0, proceeds: 0, amount: 0, absno: 0, underhr: 0, undermin: 0 });
      setNotice({ tone: 'info', text: 'A record with this key is already in the file — enter the amounts to add onto it.' });
      return;
    }

    setSaving(true);
    if (existing && addToExisting) {
      const { error } = await supabase.from('deductions').update({
        principal: (Number(existing.principal) || 0) + addToExisting.principal,
        interest: (Number(existing.interest) || 0) + addToExisting.interest,
        charges: (Number(existing.charges) || 0) + addToExisting.charges,
        proceeds: (Number(existing.proceeds) || 0) + addToExisting.proceeds,
        amount: (Number(existing.amount) || 0) + addToExisting.amount,
        editor,
        paydate: todayIso(),
      }).eq('id', existing.id);
      setSaving(false);
      if (error) { setNotice({ tone: 'error', text: error.message }); return; }
      onSaved();
      return;
    }

    const info = codes.get(c);
    const { error } = await supabase.from('deductions').insert({
      employee_id: employee.id,
      pay_period_id: periodId,
      deduction_code: c,
      deduction_name: info?.dedname ?? c,
      category: info?.type ?? 'Other',
      amount: form.amount,
      source: 'Manual',
      // The legacy AGENT column has no V3 equivalent; `reference` is the same
      // free-text slot on this screen, so the agent is kept there.
      reference: agent || policy,
      stacode: empField(employee, 'stacode') || String(employee.stacode ?? ''),
      type: info?.type ?? '',
      agency: info?.agency ?? '',
      policyno: policy,
      policydate: policyDate,
      status: '',
      principal: form.principal,
      interest: form.interest,
      charges: form.charges,
      proceeds: form.proceeds,
      gsis_bpn: gsis ? key.trim() : '',
      absno: gsis ? 0 : form.absno,
      underhr: gsis ? 0 : form.underhr,
      undermin: gsis ? 0 : form.undermin,
      editor,
      paydate: todayIso(),
    });
    setSaving(false);
    if (error) { setNotice({ tone: 'error', text: error.message }); return; }
    onSaved();
  }

  return (
    <ModalShell
      title={`A D D — ${gsis ? 'GSIS' : 'Others'}`}
      subtitle={gsis
        ? 'PAYDFMAD → PAYDFGSA · keyed on the GSIS BP number, GSIS codes only'
        : 'PAYDFMAD → PAYDFADD · keyed on the employee number, GSIS codes refused'}
      onClose={onClose}
      footer={(
        <>
          <span className="text-xs text-slate-500">
            {!ready ? 'Enter the key, then check the master record.' : `${empNumberOf(employee)} — ${codeNameOf(code, codes) || code}`}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">Quit</button>
            {!ready ? (
              <button onClick={checkKey} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900">
                <Search className="w-4 h-4" /> Check master record
              </button>
            ) : (
              <button onClick={save} disabled={saving || !!errors.amount || !!errors.interest || !!errors.charges || !!errors.proceeds}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
                {saving ? 'Saving…' : existing ? 'Add onto record' : 'Add record'}
              </button>
            )}
          </div>
        </>
      )}
    >
      <Notice notice={notice} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">{gsis ? 'GSIS Business Partner No.' : 'Employee No.'}</span>
          <input value={key} onChange={(e) => { setKey(e.target.value); setReady(false); }} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Deduction Code</span>
          <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setReady(false); }} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
          {code && <span className="block text-[11px] text-slate-400 mt-1">{codeNameOf(code, codes) || 'Unknown code'}{codeAgencyOf(code, codes) ? ` · ${codeAgencyOf(code, codes)}` : ''}</span>}
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Policy / Loan No.</span>
          <input value={policy} onChange={(e) => { setPolicy(e.target.value.toUpperCase()); setReady(false); }} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Policy Date</span>
          <input type="date" value={policyDate} onChange={(e) => setPolicyDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Agent</span>
          <input value={agent} onChange={(e) => setAgent(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
        </label>
      </div>

      {ready && !existing && (
        <div className="space-y-3 pt-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Amounts</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MoneyField label="Principal" value={form.principal} onChange={(n) => setForm({ ...form, principal: n })} />
            <MoneyField label="Interest" value={form.interest} onChange={(n) => setForm({ ...form, interest: n })} error={errors.interest} />
            <MoneyField label="Charges" value={form.charges} onChange={(n) => setForm({ ...form, charges: n })} error={errors.charges} />
            <MoneyField label="Proceeds" value={form.proceeds} onChange={(n) => setForm({ ...form, proceeds: n })} error={errors.proceeds} />
            <MoneyField label="Deduction Amount" value={form.amount} onChange={(n) => setForm({ ...form, amount: n })} error={errors.amount} />
          </div>
          {!gsis && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Absences / Undertime — Days · Hours · Minutes</p>
              <div className="grid grid-cols-3 gap-3">
                <input type="number" min="0" value={form.absno} onChange={(e) => setForm({ ...form, absno: parseInt(e.target.value, 10) || 0 })} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                <input type="number" min="0" max="7" value={form.underhr} onChange={(e) => setForm({ ...form, underhr: parseInt(e.target.value, 10) || 0 })} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                <input type="number" min="0" max="59" value={form.undermin} onChange={(e) => setForm({ ...form, undermin: parseInt(e.target.value, 10) || 0 })} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
            </div>
          )}
        </div>
      )}

      {existing && addToExisting && (
        <div className="space-y-3 pt-1">
          <div className="px-3 py-2 rounded-lg bg-amber-50 text-amber-800 text-sm">
            {existing.deduction_code} — {existing.deduction_name} on {empDisplayName(employee)} is already in the file
            (amount {currency(Number(existing.amount) || 0)}). Enter the amounts to add onto it.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MoneyField label="Principal to add" value={addToExisting.principal} onChange={(n) => setAddToExisting({ ...addToExisting, principal: n })} />
            <MoneyField label="Interest to add" value={addToExisting.interest} onChange={(n) => setAddToExisting({ ...addToExisting, interest: n })} />
            <MoneyField label="Charges to add" value={addToExisting.charges} onChange={(n) => setAddToExisting({ ...addToExisting, charges: n })} />
            <MoneyField label="Proceeds to add" value={addToExisting.proceeds} onChange={(n) => setAddToExisting({ ...addToExisting, proceeds: n })} />
            <MoneyField label="Amount to add" value={addToExisting.amount} onChange={(n) => setAddToExisting({ ...addToExisting, amount: n })} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Billing leg — Print (PAYDFBFL) · Upload (PAYDFBFU) · Download (PAYDFMEX)
//
// The billing file is the fixed-width 152-character record the legacy reformats
// from TXT to DBF in PAYDFG1 (GSIS) and PAYDFUP2 (Others). The offsets below are
// taken straight out of those two programs:
//
//   1–3 REGCODE    4–6 DIVCODE     7–9 STACODE    10–16 EMPNO   17–36 FNAME
//   38–39 MI      41–60 LNAME     62–64 APPEL     65 SLTAG     66–70 DEDCODE
//   71–84 POLICYNO     85–88 EFFYY   89–90 EFFMM   91–94 TERYY   95–96 TERMM
//   97–104 DEDAMT  105–113 PRINCIPAL   114–120 INTEREST   121–127 CHARGES
//   128–136 PROCEEDS    137 BILL     142 UPD     143–152 GSIS BP NUMBER
//
// GSIS rows are keyed by the BP number and carry GSIS codes only; Others rows by
// EMPNO + DEDCODE + POLICYNO, with GSIS codes refused — the same split the four
// maintenance steps use. A delimited file (comma/pipe/tab) is accepted as the
// same fields in order, with an optional header row.
// ══════════════════════════════════════════════════════════════════════════════

// BillingLine / StagedBillingRow / BillingErrorRow / InvalidBpRow /
// BillingSession and the server-side session helpers live in
// `@/lib/deductionBilling` — the working set is shared with the backend now.

const BILLING_COLUMNS = [
  'regcode', 'divcode', 'stacode', 'empno', 'fname', 'mi', 'lname', 'appel',
  'dedcode', 'policyno', 'effyy', 'effmm', 'teryy', 'termm',
  'dedamt', 'principal', 'interest', 'charges', 'proceeds', 'bpn',
];

function billingSlice(line: string, from: number, len: number): string {
  return line.slice(from - 1, from - 1 + len);
}

function billingNum(line: string, from: number, len: number): number {
  const n = Number.parseFloat(billingSlice(line, from, len).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** A money field of the billing record: whole centavos in the file, pesos out
 *  — the legacy's `val(field) / 100` (PAYDFG1 REPRTN2, PAYDFUP2 REPRTN2). */
function billingMoney(line: string, from: number, len: number): number {
  return billingNum(line, from, len) / 100;
}

/** One fixed-width 152-character billing record, at the legacy offsets. */
function parseBillingFixed(line: string, lineNumber: number): BillingLine {
  return {
    regcode: billingSlice(line, 1, 3).trim(),
    divcode: billingSlice(line, 4, 3).trim(),
    stacode: billingSlice(line, 7, 3).trim(),
    empno: billingSlice(line, 10, 7).trim(),
    fname: billingSlice(line, 17, 20).trim(),
    mi: billingSlice(line, 38, 2).trim(),
    lname: billingSlice(line, 41, 20).trim(),
    appel: billingSlice(line, 62, 3).trim(),
    sltag: billingSlice(line, 65, 1).trim(),
    dedcode: billingSlice(line, 66, 5).trim().toUpperCase(),
    policyno: billingSlice(line, 71, 14).trim().toUpperCase(),
    effyy: billingSlice(line, 85, 4).trim(),
    effmm: billingSlice(line, 89, 2).trim(),
    teryy: billingSlice(line, 91, 4).trim(),
    termm: billingSlice(line, 95, 2).trim(),
    dedamt: billingMoney(line, 97, 8),
    principal: billingMoney(line, 105, 9),
    interest: billingMoney(line, 114, 7),
    charges: billingMoney(line, 121, 7),
    proceeds: billingMoney(line, 128, 9),
    bill: billingSlice(line, 137, 1).trim(),
    upd: billingSlice(line, 142, 1).trim(),
    bpn: billingSlice(line, 143, 10).trim(),
    raw: line,
    lineNumber,
  };
}

function billingDetectDelimiter(line: string): string | null {
  for (const d of ['\t', '|', ';', ',']) if (line.includes(d)) return d;
  return null;
}

/** TXT → the billing records, fixed-width or delimited (PAYDFG1 / PAYDFUP2). */
function parseBillingFile(text: string): { records: BillingLine[]; layout: 'fixed' | 'delimited'; errors: string[] } {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  if (lines.length === 0) return { records: [], layout: 'fixed', errors: ['The billing file is empty.'] };

  const delimiter = billingDetectDelimiter(lines[0]);
  if (!delimiter) {
    const records = lines.map((l, i) => parseBillingFixed(l.padEnd(152, ' '), i + 1));
    const short = lines.filter((l) => l.length < 100).length;
    if (short > 0) errors.push(`${short} line(s) are shorter than the 152-character billing record and were read as far as they go.`);
    return { records, layout: 'fixed', errors };
  }

  const cells = lines.map((l) => l.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, '')));
  const header = cells[0].map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const hasHeader = header.some((h) => h.includes('empno') || h.includes('dedcode') || h.includes('regcode'));
  const body = hasHeader ? cells.slice(1) : cells;

  const records = body.map((c, i) => {
    const at = (name: string) => c[BILLING_COLUMNS.indexOf(name)] ?? '';
    const num = (name: string) => {
      const n = Number.parseFloat(String(at(name)).replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    return {
      regcode: at('regcode'), divcode: at('divcode'), stacode: at('stacode'), empno: at('empno'),
      fname: at('fname'), mi: at('mi'), lname: at('lname'), appel: at('appel'),
      sltag: '', dedcode: at('dedcode').toUpperCase(), policyno: at('policyno').toUpperCase(),
      effyy: at('effyy'), effmm: at('effmm'), teryy: at('teryy'), termm: at('termm'),
      dedamt: num('dedamt'), principal: num('principal'), interest: num('interest'),
      charges: num('charges'), proceeds: num('proceeds'),
      bill: '', upd: '', bpn: at('bpn'),
      raw: c.join(delimiter), lineNumber: (hasHeader ? i + 2 : i + 1),
    } satisfies BillingLine;
  });
  if (records.some((r) => !r.empno && !r.bpn && !r.dedcode)) {
    errors.push('Some rows carry neither an employee number, a BP number nor a deduction code.');
  }
  return { records, layout: 'delimited', errors };
}

function billingDisplayName(line: BillingLine): string {
  const mi = line.mi ? ` ${line.mi.charAt(0)}.` : '';
  return `${line.fname}${mi} ${line.lname}${line.appel ? ` ${line.appel}` : ''}`.replace(/\s+/g, ' ').trim();
}

/**
 * Validate and classify the reformatted billing rows — the GDV/GEV/GAV (GSIS)
 * and DE2/ED2/AD2 (Others) passes. Mirrors the legacy closely:
 *   • the update code decides the action: blank = add, `D` = delete, `R` =
 *     replace; anything else is the GSINVUPC invalid-update-code file (PAYDFG1);
 *   • a GSIS line whose BP number resolves to no master record is the GSINVBPN
 *     invalid-BP file (PAYDFG2), not an error row;
 *   • the GSIS door keys on GSIS_BPN+DEDCODE, the Others door on
 *     EMPNO+DEDCODE+POLICYNO, and a delete/replace needs the record to exist;
 *   • the `sltag` flags an E/R line whose dedcode becomes 0002E/0002R;
 *   • the effectivity/termination dates and the amounts are validated the way
 *     PAYDFGAV/PAYDFGEV do, against the payroll month/year of the period.
 */
function classifyBilling(
  lines: BillingLine[],
  leg: LegacyLeg,
  employees: Employee[],
  empMap: Map<string, Employee>,
  codes: Map<string, DeductionCode>,
  rows: Deduction[],
  layout: 'fixed' | 'delimited' | '',
  period: { month: number | null; year: number | null } | null,
): { staged: StagedBillingRow[]; invalidBp: InvalidBpRow[]; invalidUpd: InvalidBpRow[] } {
  const staged: StagedBillingRow[] = [];
  const invalidBp: InvalidBpRow[] = [];
  const invalidUpd: InvalidBpRow[] = [];
  const fixed = layout === 'fixed';

  const digitField = (line: BillingLine, from: number, len: number, allowBlank: boolean): boolean => {
    if (!fixed) return true;
    const raw = billingSlice(line.raw, from, len).trim();
    if (!raw) return allowBlank;
    return /^[0-9]+$/.test(raw);
  };

  for (const line of lines) {
    const errors: string[] = [];
    const name = billingDisplayName(line);

    // The update code decides the action. Blank = add, D = delete, R = replace;
    // the legacy writes any other value to the invalid-update-code file.
    const upd = line.upd.toUpperCase();
    if (upd && upd !== 'D' && upd !== 'R') {
      invalidUpd.push({
        bpn: line.bpn, empno: line.empno, name,
        reason: `Update code "${upd}" is neither blank, D nor R`,
      });
      continue;
    }
    const isDelete = upd === 'D';
    const isReplace = upd === 'R';

    // `sltag` E/R rewrites the dedcode to 0002E/0002R. The GSIS door always does
    // it; the Others door only when the entered code belongs to GSIS (PAYDFUP2).
    let code = line.dedcode;
    if (line.sltag === 'E' || line.sltag === 'R') {
      if (leg === 'GSIS' || isGsisCode(code, codes)) code = line.sltag === 'E' ? '0002E' : '0002R';
    }

    let employee: Employee | undefined;
    if (leg === 'GSIS') {
      employee = findEmployeeByBpn(employees, line.bpn) ?? findEmployeeByNumber(employees, line.empno);
      if (!employee) {
        invalidBp.push({
          bpn: line.bpn, empno: line.empno, name,
          reason: line.bpn ? 'BP number is on no master record' : 'No BP number and no employee number on the line',
        });
        continue;
      }
    } else {
      employee = findEmployeeByNumber(employees, line.empno);
      if (!employee) errors.push('Employee number is not on the master file');
    }

    if (!code) errors.push('No deduction code on the line');
    else if (!codes.get(code)) errors.push(`Deduction code ${code || '(blank)'} is not in the code table`);
    else if (leg === 'GSIS' && !isGsisCode(code, codes)) errors.push(`${code} is not a GSIS code — it belongs to the Others door`);
    else if (leg === 'OTHERS' && isGsisCode(code, codes)) errors.push(`${code} is a GSIS code — use the GSIS door`);

    const info = codes.get(code);
    const isLoan = String(info?.type ?? '').trim().toUpperCase() === 'L';

    // The delete pass only checks the code and that the record exists; the add
    // and replace passes validate the dates and amounts too.
    if (!isDelete && code && codes.get(code)) {
      const pyear = period?.year ?? null;
      const pmonth = period?.month ?? null;
      if (pmonth != null && Number(line.effmm) !== pmonth) errors.push('Invalid effectivity month — it must be the payroll month');
      if (pyear != null && String(line.effyy) !== String(pyear)) errors.push('Invalid effectivity year — it must be the payroll year');
      const termMonth = Number(line.termm) || 0;
      const effYear = pyear ?? (Number(line.effyy) || 0);
      const effMonth = pmonth ?? (Number(line.effmm) || 0);
      const termYear = Number(line.teryy) || 0;
      if (termMonth < 1 || termMonth > 12) errors.push('Invalid termination month');
      if (termYear > effYear + 40) errors.push('Invalid termination year');
      if (termYear && termYear < effYear) errors.push('Invalid termination year');
      if (termYear === effYear && termMonth && termMonth < effMonth) errors.push('Invalid termination month');
      if (!digitField(line, 97, 8, false) || line.dedamt === 0) errors.push('Invalid deduction amount');
      if (!digitField(line, 105, 9, false)) errors.push('Invalid principal amount');
      if (isLoan && line.principal === 0) errors.push('Invalid principal amount for a loan');
      if (!digitField(line, 114, 7, true)) errors.push('Invalid interest amount');
      if (!digitField(line, 121, 7, true)) errors.push('Invalid charges amount');
      if (!digitField(line, 128, 9, true)) errors.push('Invalid proceeds amount');
    }

    // The legacy seek: GSIS keys on BPN+DEDCODE (policy is not validated),
    // Others on EMPNO+DEDCODE+POLICYNO. GSIS also never keeps two rows with the
    // same dedcode for one employee, so the match is employee + code.
    const key = leg === 'GSIS' ? line.bpn : line.empno;
    const existing = employee
      ? leg === 'GSIS'
        ? rows.find((r) => r.employee_id === employee!.id && String(r.deduction_code ?? '').toUpperCase() === code) ?? null
        : matchLegacyRows(rows, leg, key, code, line.policyno, empMap)
          .find((r) => r.employee_id === employee!.id) ?? null
      : null;

    if (isDelete && !existing) errors.push('No record in the file to delete');
    if (isReplace && !existing) errors.push('No record in the file to replace');

    let action: BillingAction = 'ADD';
    if (errors.length > 0) action = 'ERROR';
    else if (isDelete) action = 'DELETE';
    else if (isReplace) action = 'UPDATE';
    else action = existing ? 'UPDATE' : 'ADD';

    staged.push({
      ...line,
      dedcode: code,
      action,
      errors,
      employeeId: employee?.id ?? '',
      employeeName: employee ? `${empNumberOf(employee)} ${empDisplayName(employee)}` : name,
      existingId: existing?.id ?? null,
    });
  }

  return { staged, invalidBp, invalidUpd };
}

function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  downloadFile({ filename, content: generateCsv(headers, rows), mimeType: 'text/csv' });
}

/** The legacy prints to a device; here the listing opens as a print sheet. */
function printListing(title: string, subtitle: string, headers: string[], rows: string[][]) {
  const sheet = window.open('', '_blank', 'width=1200,height=860');
  if (!sheet) return;
  const html = `<!doctype html><html><head><title>${title}</title><style>
    body{font:12px/1.45 'Courier New',monospace;margin:24px;color:#111}
    h1{font-size:14px;margin:0 0 2px}h2{font-size:12px;font-weight:400;margin:0 0 12px;color:#444}
    table{border-collapse:collapse;width:100%}th,td{padding:3px 6px;border-bottom:1px solid #ddd;white-space:pre}
    th{text-align:left;border-bottom:1px solid #333;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    td.n{text-align:right}
  </style></head><body><h1>${title}</h1><h2>${subtitle}</h2><table><thead><tr>${
    headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c, i) => `<td${i >= 3 && /^[\d,.-]+$/.test(c) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}
  }</tbody></table></body></html>`;
  sheet.document.write(html);
  sheet.document.close();
  sheet.focus();
  sheet.print();
}

interface BillingDisplay {
  bpn: string; regcode: string; divcode: string; stacode: string; empno: string; name: string;
  dedcode: string; policyno: string; effyy: string; effmm: string; teryy: string; termm: string;
  amount: number; principal: number; interest: number; charges: number; bill: string;
}

function displayFromBilling(line: BillingLine): BillingDisplay {
  return {
    bpn: line.bpn, regcode: line.regcode, divcode: line.divcode, stacode: line.stacode,
    empno: line.empno, name: billingDisplayName(line), dedcode: line.dedcode, policyno: line.policyno,
    effyy: line.effyy, effmm: line.effmm, teryy: line.teryy, termm: line.termm,
    amount: line.dedamt, principal: line.principal, interest: line.interest,
    charges: line.charges, bill: line.bill,
  };
}

function displayFromRow(r: Deduction, empMap: Map<string, Employee>): BillingDisplay {
  const emp = empMap.get(r.employee_id);
  return {
    bpn: String(r.gsis_bpn ?? ''), regcode: empField(emp, 'regcode'), divcode: empField(emp, 'divcode'),
    stacode: String(r.stacode ?? '') || empField(emp, 'stacode'), empno: empNumberOf(emp),
    name: empDisplayName(emp), dedcode: r.deduction_code, policyno: String(r.policyno ?? ''),
    effyy: String(r.effyy ?? ''), effmm: String(r.effmm ?? ''), teryy: String(r.teryy ?? ''), termm: String(r.termm ?? ''),
    amount: Number(r.amount) || 0, principal: Number(r.principal) || 0, interest: Number(r.interest) || 0,
    charges: Number(r.charges) || 0, bill: '',
  };
}

const BILLING_HEADERS: Record<LegacyLeg, string[]> = {
  GSIS: ['BP No.', 'Name', 'Code', 'Policy', 'Eff YY MM', 'Ter YY MM', 'Amount', 'Prin', 'Int', 'Chg', 'Bill'],
  OTHERS: ['Reg', 'Div', 'Stn', 'Emp No.', 'Name', 'Code', 'Policy', 'Eff', 'Ter', 'Amount', 'Prin', 'Int', 'Chg', 'Bill'],
};

function billingCells(d: BillingDisplay, leg: LegacyLeg): string[] {
  const money = (n: number) => n.toFixed(2);
  const tail = [
    d.dedcode,
    d.policyno,
    `${d.effyy} ${d.effmm}`.trim(),
    `${d.teryy} ${d.termm}`.trim(),
    money(d.amount),
    money(d.principal),
    money(d.interest),
    money(d.charges),
    d.bill,
  ];
  return leg === 'GSIS'
    ? [d.bpn, d.name, ...tail]
    : [d.regcode, d.divcode, d.stacode, d.empno, d.name, ...tail];
}

// ── 5. Print Billing — PAYDFBLG (GSIS) / PAYDFUP1 (Others) ──────────────────

function PrintBillingModal({ leg, rows, empMap, codes, billing, onClose }: {
  leg: LegacyLeg; rows: Deduction[]; empMap: Map<string, Employee>;
  codes: Map<string, DeductionCode>; billing: BillingSession; onClose: () => void;
}) {
  const [wanted, setWanted] = useState('');
  const [applied, setApplied] = useState('');
  const ledger = ledgerSort(rows, empnoKeyOf(empMap));

  const fromFile = applied ? billing.records.filter((r) => r.dedcode === applied).map(displayFromBilling) : [];
  const fromFileRows = applied ? ledger.filter((r) => String(r.deduction_code ?? '').toUpperCase() === applied).map((r) => displayFromRow(r, empMap)) : [];
  const listing = fromFile.length > 0 ? fromFile : fromFileRows;
  const source = fromFile.length > 0 ? `billing file ${billing.fileName || '(uploaded this session)'}` : 'the deduction file';
  const name = applied ? codeNameOf(applied, codes) : '';

  const headers = BILLING_HEADERS[leg];
  const cells = listing.map((d) => billingCells(d, leg));
  const total = listing.reduce((s, d) => s + d.amount, 0);

  function confirmCode() {
    const c = wanted.trim().toUpperCase();
    if (!c) return;
    setApplied(c);
  }

  return (
    <ModalShell
      title={`Print Billing — ${leg === 'GSIS' ? 'GSIS (PAYDFBLG)' : 'Others (PAYDFUP1)'}`}
      subtitle="List Contents of Billing File — the legacy asks for a deduction code, confirms it on DEDTABLE and prints it"
      onClose={onClose}
      footer={(
        <>
          <span className="text-xs text-slate-500">
            {applied ? `${listing.length} record(s) · ${currency(total)} total` : 'Enter a deduction code'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printListing(
                `${leg === 'GSIS' ? 'GSIS' : 'Others'} Billing File — ${applied}${name ? ` ${name}` : ''}`,
                `Division of ${empField(empMap.values().next().value, 'divcode') || ''} · ${source} · ${listing.length} record(s)`,
                headers, cells,
              )}
              disabled={!applied || listing.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              onClick={() => exportCsv(`BILLING_${leg}_${applied}.csv`, headers, cells)}
              disabled={!applied || listing.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">Quit</button>
          </div>
        </>
      )}
    >
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200">
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Enter Deduction Code</span>
          <input
            value={wanted}
            onChange={(e) => setWanted(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmCode(); }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </label>
        <button onClick={confirmCode} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          Confirm
        </button>
        {applied && <span className="text-sm text-slate-600">{name || 'Unknown code'} — reading {source}</span>}
      </div>

      {!applied ? (
        <p className="py-10 text-center text-sm text-slate-500">Enter a deduction code to list the billing file.</p>
      ) : listing.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No Valid Codes Found</p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-[11px] uppercase tracking-wider">
                {headers.map((h) => <th key={h} className="text-left px-2 py-2 font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-xs">
              {listing.slice(0, 300).map((d, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {billingCells(d, leg).map((c, j) => (
                    <td key={j} className={`px-2 py-1.5 whitespace-nowrap ${j >= headers.length - 6 ? 'text-right' : 'text-slate-600'}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {listing.length > 300 && <p className="text-xs text-slate-400">Showing the first 300 of {listing.length} records — the CSV carries them all.</p>}
    </ModalShell>
  );
}

// ── 6. Upload Billing — PAYDFG1/G2/GDV/GEV/GAV · PAYDFUP2/DE2/ED2/AD2 ──────

function UploadBillingModal({ leg, employees, empMap, codes, rows, periodId, editor, period, billing, onSession, onPersist, onDiscard, onClose, onSaved }: {
  leg: LegacyLeg; employees: Employee[]; empMap: Map<string, Employee>; codes: Map<string, DeductionCode>;
  rows: Deduction[]; periodId: string; editor: string;
  /** the payroll month/year the file is validated against (PAYDFGAV eff checks) */
  period: { month: number | null; year: number | null } | null;
  billing: BillingSession;
  /** keep the working set locally (the server already holds this copy) */
  onSession: (s: BillingSession) => void;
  /** keep the working set locally and on the server */
  onPersist: (s: BillingSession) => void;
  /** delete the saved working set for this pay period */
  onDiscard: () => void;
  onClose: () => void; onSaved: () => void;
}) {
  // Resume from the saved working set: the legacy leaves BILLS/ERRTXT/GSINVBPN on
  // disk, so re-opening this step (or opening it after a reload) shows the file
  // uploaded earlier rather than an empty form.
  const [fileName, setFileName] = useState(billing.fileName);
  const [layout, setLayout] = useState<'fixed' | 'delimited' | ''>(billing.layout);
  const [parsed, setParsed] = useState<BillingLine[]>(billing.records);
  const [staged, setStaged] = useState<StagedBillingRow[]>(billing.staged);
  const [invalidBp, setInvalidBp] = useState<InvalidBpRow[]>(billing.invalidBp);
  const [invalidUpd, setInvalidUpd] = useState<InvalidBpRow[]>(billing.invalidUpd ?? []);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [postNotice, setPostNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const adds = staged.filter((r) => r.action === 'ADD');
  const updates = staged.filter((r) => r.action === 'UPDATE');
  const deletes = staged.filter((r) => r.action === 'DELETE');
  const errors = staged.filter((r) => r.action === 'ERROR');
  const posted = staged.filter((r) => r.action === 'POSTED');

  /** The error file and the invalid-BP file are written by the reformat and
   *  validation passes themselves (PAYDFG2, GDV/GEV/GAV), i.e. before anything
   *  is posted — so the working set is saved here, not in post(). It goes to the
   *  server now, which is what makes the steps survive a reload. */
  function saveSession(
    records: BillingLine[],
    stagedRows: StagedBillingRow[],
    invalid: InvalidBpRow[],
    invalidCodes: InvalidBpRow[],
    name: string,
    resultLayout: 'fixed' | 'delimited' | '',
  ) {
    onPersist({
      fileName: name,
      layout: resultLayout,
      uploadedAt: new Date().toISOString(),
      records,
      staged: stagedRows,
      errorRows: stagedRows
        .filter((r) => r.action === 'ERROR')
        .map((r) => ({
          lineNumber: r.lineNumber, bpn: r.bpn, empno: r.empno, name: r.employeeName,
          dedcode: r.dedcode, policyno: r.policyno, amount: r.dedamt,
          error: r.errors.join('; '),
        })),
      invalidBp: invalid,
      invalidUpd: invalidCodes,
      leg,
    });
  }

  function handleText(raw: string, name: string) {
    const result = parseBillingFile(raw);
    setFileName(name);
    setLayout(result.layout);
    setParsed(result.records);
    setParseErrors(result.errors);
    const classified = classifyBilling(result.records, leg, employees, empMap, codes, rows, result.layout, period);
    setStaged(classified.staged);
    setInvalidBp(classified.invalidBp);
    setInvalidUpd(classified.invalidUpd);
    saveSession(result.records, classified.staged, classified.invalidBp, classified.invalidUpd, name, result.layout);
  }

  async function handleFile(file: File) {
    const validation = await validateUpload(file);
    if (!validation.valid) { setParseErrors([validation.error ?? 'Invalid file']); return; }
    handleText(await file.text(), file.name);
  }

  /**
   * Post the validated rows. The SERVER applies them: it re-reads the saved
   * working set, re-validates every row and writes them in one SQL transaction,
   * so a row that no longer passes validation rolls the whole post back and
   * nothing at all is written. The error and invalid-BP files stay behind for
   * the Download step, exactly as the legacy left them on disk.
   */
  async function post() {
    setPosting(true);
    setPostNotice(null);
    const { result, session, error } = await postBillingSession(periodId, editor);
    setPosting(false);
    if (error) { setParseErrors([error]); return; }
    if (session) {
      onSession(session);
      setFileName(session.fileName);
      setLayout(session.layout);
      setParsed(session.records);
      setStaged(session.staged);
      setInvalidBp(session.invalidBp);
      setInvalidUpd(session.invalidUpd ?? []);
    }
    if (result) {
      setPostNotice(
        `Posted ${result.posted} record(s) — ${result.inserted} added, ${result.updated} updated, ${result.deleted ?? 0} deleted`
        + (result.skipped ? `, ${result.skipped} invalid skipped` : '')
        + '. The billing, error and invalid-BP files remain for the Download step.',
      );
      setParseErrors(result.skippedReasons ?? []);
      if (result.posted > 0) onSaved();
    }
  }

  return (
    <ModalShell
      title={`Upload Billing — ${leg === 'GSIS' ? 'GSIS (PAYDFG1 · G2 · GDV · GEV · GAV)' : 'Others (PAYDFUP2 · DE2 · ED2 · AD2)'}`}
      subtitle={leg === 'GSIS'
        ? 'Reformat the billing TXT to records, resolve EMPNO through the BP number, then validate before posting'
        : 'Reformat the billing TXT to records, then validate against the deduction file before posting'}
      onClose={onClose}
      footer={(
        <>
          <span className="text-xs text-slate-500">
            {filename0(fileName) ? `${fileName} · ` : ''}
            {staged.length === 0
              ? 'Choose a billing file'
              : `${adds.length} add · ${updates.length} update · ${deletes.length} delete · ${errors.length} error · ${invalidBp.length} invalid BP`
                + (posted.length > 0 ? ` · ${posted.length} already posted` : '')}
          </span>
          <div className="flex items-center gap-2">
            {filename0(fileName) && (
              <button
                onClick={onDiscard}
                className="px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-200"
                title="Delete this pay period's billing, error and invalid-BP files"
              >
                Discard working set
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">Quit</button>
            <button
              onClick={post}
              disabled={posting || staged.length === 0 || adds.length + updates.length + deletes.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              {posting ? 'Posting…' : `Post ${adds.length + updates.length + deletes.length} record(s)`}
            </button>
          </div>
        </>
      )}
    >
      <Notice notice={postNotice ? { tone: 'info', text: postNotice } : null} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,.prn,.dat"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
        >
          <Upload className="w-4 h-4" /> Choose billing file
        </button>
        {layout && (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-xs text-slate-600">
            {layout === 'fixed' ? 'fixed-width billing record' : 'delimited'} · {parsed.length} line(s)
          </span>
        )}
      </div>

      {parseErrors.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-1">Reformat notes</p>
          <ul className="text-xs text-amber-700 space-y-0.5">{parseErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      {staged.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-slate-500 text-[11px] uppercase tracking-wider">
                <th className="text-left px-3 py-2 font-medium">Line</th>
                <th className="text-left px-3 py-2 font-medium">{leg === 'GSIS' ? 'BP No.' : 'Emp No.'}</th>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Code</th>
                <th className="text-left px-3 py-2 font-medium">Policy</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="text-left px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staged.slice(0, 200).map((r, i) => (
                <tr key={i} className={r.action === 'ERROR' ? 'bg-rose-50/60' : ''}>
                  <td className="px-3 py-1.5 text-xs text-slate-400 font-mono">{r.lineNumber}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{leg === 'GSIS' ? r.bpn : r.empno}</td>
                  <td className="px-3 py-1.5 text-slate-700">{r.employeeName}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.dedcode}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{r.policyno}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{currency(r.dedamt)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      r.action === 'ADD' ? 'bg-emerald-100 text-emerald-700'
                        : r.action === 'UPDATE' ? 'bg-blue-100 text-blue-700'
                          : r.action === 'DELETE' ? 'bg-amber-100 text-amber-700'
                            : r.action === 'POSTED' ? 'bg-slate-200 text-slate-600'
                              : 'bg-rose-100 text-rose-700'
                    }`}>{r.action}</span>
                    {r.action === 'ERROR' && <span className="block text-[10px] text-rose-600 mt-0.5">{r.errors.join('; ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invalidBp.length > 0 && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-sm font-medium text-slate-700 mb-1">Invalid / unmatched BP numbers ({invalidBp.length}) — kept for the Download step</p>
          <ul className="text-xs text-slate-500 space-y-0.5 max-h-24 overflow-y-auto">
            {invalidBp.slice(0, 30).map((r, i) => <li key={i}><span className="font-mono">{r.bpn || '(blank)'}</span> · {r.name} — {r.reason}</li>)}
          </ul>
        </div>
      )}

      {invalidUpd.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-1">Invalid update codes ({invalidUpd.length}) — neither blank, D nor R (PAYDFG1 GSINVUPC)</p>
          <ul className="text-xs text-amber-700 space-y-0.5 max-h-24 overflow-y-auto">
            {invalidUpd.slice(0, 30).map((r, i) => (
              <li key={i}>
                line <span className="font-mono">{r.bpn || r.empno || '(blank)'}</span> · {r.name} — {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {staged.length === 0 && (
        <p className="text-xs text-slate-400">
          Nothing has been uploaded for this pay period yet. The billing file replaces the legacy BILLS table; the error
          and invalid-BP files it produces are what the Download step works on.
        </p>
      )}

      {filename0(fileName) && (
        <p className="text-xs text-slate-400">
          {billing.savedAt
            ? `Saved for this pay period on the server (${billing.savedAt}). `
            : 'Saving the billing file for this pay period… '}
          {billing.postedAt
            ? `Last posted ${billing.postedAt} by ${billing.postedBy || 'SYSTEM'} (${billing.postedCount ?? 0} record(s)).`
            : 'Not posted yet.'}
        </p>
      )}
    </ModalShell>
  );
}

function filename0(name: string): boolean {
  return name.trim().length > 0;
}

// ── 7. Download — PAYDFEXG (GSIS) / PAYDFEX1 (Others) ───────────────────────

function DownloadBillingModal({ leg, rows, empMap, codes, billing, onPersist, onDiscard, onClose }: {
  leg: LegacyLeg; rows: Deduction[]; empMap: Map<string, Employee>; codes: Map<string, DeductionCode>;
  billing: BillingSession;
  /** keep the working set locally and on the server — editing the error file
   *  (PAYDFXGE / XGD / XGA) changes what the next post and download see */
  onPersist: (s: BillingSession) => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  // GSIS opens its own menu (PAYDFEXG); Others asks for a code (PAYDFEX1).
  const [choice, setChoice] = useState<'menu' | 'edit' | 'add' | 'invalid'>('menu');
  const [wanted, setWanted] = useState('');
  const [applied, setApplied] = useState('');
  const [draft, setDraft] = useState<BillingErrorRow>({ lineNumber: 0, bpn: '', empno: '', name: '', dedcode: '', policyno: '', amount: 0, error: '' });
  const [editIndex, setEditIndex] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);

  const ledger = ledgerSort(rows, empnoKeyOf(empMap));
  // The legacy (PAYDFEX1) reads DEDFILE — the deduction masterfile — then seeks
  // MASTFILE for each record and skips the ones whose employee is gone
  // (`if found() ... else skip`). The same two rules apply here:
  //   • the masterfile rows are the ones DEDFILE holds; Run Payroll's per-period
  //     lines and the INCLUDED tags are a different artifact, so they are only
  //     used for a code that has no masterfile records at all (otherwise they
  //     repeat the master population and print a blank policy / effectivity the
  //     master record actually carries);
  //   • a record whose employee is no longer on the master file is dropped, not
  //     printed as a blank "Unknown" line that would corrupt the extracted DBF.
  const ENGINE_SOURCES = new Set(['Payroll Run', 'INCLUDED']);
  const codeRows = applied
    ? ledger.filter((r) => String(r.deduction_code ?? '').toUpperCase() === applied)
    : [];
  const masterRows = codeRows.filter((r) => !ENGINE_SOURCES.has(String(r.source ?? '')));
  const extractRows = masterRows.length > 0 ? masterRows : codeRows;
  const extracted = extractRows.filter((r) => empMap.has(r.employee_id));
  const skipped = extractRows.length - extracted.length;

  function saveErrorRow() {
    const next = [...billing.errorRows];
    if (editIndex >= 0) next[editIndex] = draft;
    else next.push({ ...draft, lineNumber: draft.lineNumber || next.length + 1 });
    onPersist({ ...billing, errorRows: next });
    setDraft({ lineNumber: 0, bpn: '', empno: '', name: '', dedcode: '', policyno: '', amount: 0, error: '' });
    setEditIndex(-1);
    setChoice('menu');
    setNotice('Error file updated.');
  }

  function deleteErrorRow(index: number) {
    const next = billing.errorRows.filter((_, i) => i !== index);
    onPersist({ ...billing, errorRows: next });
    setNotice('Error record removed.');
  }

  function extract() {
    const c = wanted.trim().toUpperCase();
    if (!c) return;
    setApplied(c);
    setChoice('menu');
    setNotice(null);
  }

  const extractedHeaders = ['Reg', 'Div', 'Stn', 'Emp No.', 'Name', 'Code', 'Policy', 'Eff', 'Ter', 'Amount', 'Principal', 'Interest', 'Charges', 'Proceeds'];
  const extractedCells = extracted.map((r) => {
    const emp = empMap.get(r.employee_id);
    return [
      empField(emp, 'regcode'), empField(emp, 'divcode'),
      String(r.stacode ?? '').trim() || empField(emp, 'stacode'), empNumberOf(emp),
      empDisplayName(emp), r.deduction_code, String(r.policyno ?? ''),
      `${r.effyy ?? ''} ${r.effmm ?? ''}`.trim(), `${r.teryy ?? ''} ${r.termm ?? ''}`.trim(),
      (Number(r.amount) || 0).toFixed(2), (Number(r.principal) || 0).toFixed(2),
      (Number(r.interest) || 0).toFixed(2), (Number(r.charges) || 0).toFixed(2), (Number(r.proceeds) || 0).toFixed(2),
    ];
  });

  const errorHeaders = ['Line', 'BP No.', 'Emp No.', 'Name', 'Code', 'Policy', 'Amount', 'Error'];
  const errorCells = billing.errorRows.map((r) => [
    r.lineNumber, r.bpn, r.empno, r.name, r.dedcode, r.policyno, r.amount.toFixed(2), r.error,
  ]);

  const invalidHeaders = ['BP No.', 'Emp No.', 'Name', 'Reason'];
  const invalidCells = billing.invalidBp.map((r) => [r.bpn, r.empno, r.name, r.reason]);

  return (
    <ModalShell
      title={`Download — ${leg === 'GSIS' ? 'GSIS (PAYDFEXG)' : 'Others (PAYDFEX1)'}`}
      subtitle={leg === 'GSIS'
        ? 'The legacy sub-menu: edit / delete / add error file, and the invalid BP number file'
        : 'Extract deduction records per code — the legacy copies them to a drive as a DBF'}
      onClose={onClose}
      footer={(
        <>
          <span className="text-xs text-slate-500">
            {filename0(billing.fileName)
              ? `${billing.fileName} · saved for this pay period`
                + (billing.savedAt ? ` (${billing.savedAt})` : '')
                + (billing.postedAt ? ` · posted ${billing.postedAt}` : ' · not posted')
              : 'No billing file saved for this pay period'}
          </span>
          <div className="flex items-center gap-2">
            {filename0(billing.fileName) && (
              <button
                onClick={onDiscard}
                className="px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-200"
              >
                Discard working set
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">Quit</button>
          </div>
        </>
      )}
    >
      <Notice notice={notice ? { tone: 'info', text: notice } : null} />

      {leg === 'GSIS' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {([
              { id: 'edit', label: 'Edit Error File', note: 'PAYDFXGE' },
              { id: 'add', label: 'Add Error File', note: 'PAYDFXGA' },
              { id: 'invalid', label: 'Invalid BP No File', note: 'PAYDFG2 → GSINVBPN' },
            ] as const).map((c) => (
              <button
                key={c.id}
                onClick={() => { setChoice(c.id); setNotice(null); setEditIndex(-1); }}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  choice === c.id ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {c.label}
                <span className="block text-[10px] font-normal text-slate-400">{c.note}</span>
              </button>
            ))}
          </div>

          {choice === 'edit' && (
            <>
              {billing.errorRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">The error file is empty. Upload a billing file first.</p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-slate-500 text-[11px] uppercase tracking-wider">
                        {errorHeaders.map((h) => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billing.errorRows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-400">{r.lineNumber}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{r.bpn}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{r.empno}</td>
                          <td className="px-3 py-1.5">{r.name}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{r.dedcode}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{r.policyno}</td>
                          <td className="px-3 py-1.5 text-right">{currency(r.amount)}</td>
                          <td className="px-3 py-1.5 text-xs text-rose-600">{r.error}</td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            <button onClick={() => { setDraft(r); setEditIndex(i); setChoice('add'); }}
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteErrorRow(i)}
                              className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button onClick={() => exportCsv('GSIS_ERROR_FILE.csv', errorHeaders, errorCells)}
                disabled={billing.errorRows.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                <Download className="w-4 h-4" /> Download error file
              </button>
            </>
          )}

          {(choice === 'add' || editIndex >= 0) && (
            <div className="space-y-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-sm font-medium text-slate-700">{editIndex >= 0 ? 'Edit error record' : 'Add error record'}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([['bpn', 'BP No.'], ['empno', 'Emp No.'], ['name', 'Name'], ['dedcode', 'Code'], ['policyno', 'Policy']] as const).map(([field, label]) => (
                  <label key={field} className="block">
                    <span className="block text-[11px] text-slate-500 mb-1">{label}</span>
                    <input
                      value={String(draft[field] ?? '')}
                      onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm font-mono"
                    />
                  </label>
                ))}
                <MoneyField label="Amount" value={draft.amount} onChange={(n) => setDraft({ ...draft, amount: n })} />
              </div>
              <label className="block">
                <span className="block text-[11px] text-slate-500 mb-1">Error</span>
                <input value={draft.error} onChange={(e) => setDraft({ ...draft, error: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
              </label>
              <div className="flex items-center gap-2">
                <button onClick={saveErrorRow} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">Save record</button>
                <button onClick={() => { setChoice('menu'); setEditIndex(-1); }} className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">Cancel</button>
              </div>
            </div>
          )}

          {choice === 'invalid' && (
            <>
              {billing.invalidBp.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No unmatched BP numbers from the last upload.</p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-slate-500 text-[11px] uppercase tracking-wider">
                        {invalidHeaders.map((h) => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billing.invalidBp.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-mono text-xs">{r.bpn || '(blank)'}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{r.empno}</td>
                          <td className="px-3 py-1.5">{r.name}</td>
                          <td className="px-3 py-1.5 text-xs text-slate-500">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button onClick={() => exportCsv('GSIS_INVALID_BP.csv', invalidHeaders, invalidCells)}
                disabled={billing.invalidBp.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                <Download className="w-4 h-4" /> Download invalid BP file
              </button>
            </>
          )}

          {choice === 'invalid' && billing.invalidBp.length === 0 && (
            <p className="text-xs text-slate-400">Unmatched BP numbers come out of the Upload Billing step (PAYDFG2).</p>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200">
            <label className="block">
              <span className="block text-xs text-slate-600 mb-1">Enter Deduction Code</span>
              <input value={wanted} onChange={(e) => setWanted(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') extract(); }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </label>
            <button onClick={extract} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">Extract</button>
            {applied && <span className="text-sm text-slate-600">{codeNameOf(applied, codes) || 'Unknown code'} — {extracted.length} record(s) extracted{skipped > 0 ? ` · ${skipped} skipped` : ''}</span>}
          </div>

          {applied && extracted.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-slate-500 text-[11px] uppercase tracking-wider">
                    {extractedHeaders.map((h) => <th key={h} className="text-left px-2 py-2 font-medium whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {extracted.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      {extractedCells[i].map((c, j) => <td key={j} className="px-2 py-1.5 whitespace-nowrap">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {applied && skipped > 0 && (
            <p className="text-xs text-amber-600">
              {skipped} record(s) for {applied} were skipped — their employee is no longer on the master file,
              and the legacy seek skipped them too.
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCsv(`DEDRECS_${applied}.csv`, extractedHeaders, extractedCells)}
              disabled={!applied || extracted.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> dedrecs.csv
            </button>
            <button
              onClick={() => downloadFile({
                filename: `DEDRECS_${applied}.DBF`,
                content: generateDeductionDbf(extracted, [...empMap.values()], applied),
                mimeType: 'application/dbf',
              })}
              disabled={!applied || extracted.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> dedrecs.dbf
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

