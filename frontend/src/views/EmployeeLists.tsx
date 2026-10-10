/**
 * Employee Movement + Newly Hired Employees — the School Payroll Coordinator's
 * employee lists, built on the Division's employee records.
 *
 * Requested by the School Payroll Coordinator and approved by the Super Admin.
 *
 *   Employee Movement   ONE menu entry for Inclusion / Exclusion / Detailed: a
 *                       List dropdown picks which list you are on, the table
 *                       mirrors Employee Records (minus BASIC and NETPAY) and
 *                       adds a Request column whose dropdown sets the request
 *                       type per employee. Employees are added from the
 *                       Division's employee records by searching EMPNO or name.
 *   Newly Hired         employees recently hired at the school.
 *
 * The requests live in the NEW `employee_lists` table (see
 * pb_migrations/1800010006_created_employee_lists.js). It is deliberately NOT
 * the payroll's `dbf_included` / `dbf_excluded` tables — those are deduction
 * artifacts of the FoxPro import. This is a list of EMPLOYEES, linked to the
 * Division's employee records by EMPNO.
 *
 * Writes: the coordinator may raise and withdraw their OWN pending requests
 * (collection rules compare `requested_by = @request.auth.id`), and may not
 * touch an approved one — settling (approve / reject) and revoking an
 * approved request both stay with the Super Admin. A revoke deletes the
 * approved request and returns the employee to the school the approval moved
 * it from (server-side guard in main.go).
 *
 * The Super Admin files too: they pick the school a row belongs to from the
 * School Directory (the stamp a school account takes from its own
 * assigned_stacode), and their entries follow the same pending rules as the
 * coordinator's — see the toolbar and card below.
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { School } from '@/types/schools';
import {
  AlertCircle, ArrowRightLeft, CheckCircle2, ChevronDown, ChevronRight, Download, GitBranch,
  Lock, Pencil, Plus, Search, Undo2, UserMinus, UserPlus, X, XCircle,
  type LucideIcon,
} from 'lucide-react';
import LoadingIndicator from '@/components/LoadingIndicator';
import { Pagination, usePagination } from '@/components/Pagination';
import { supabase, fetchAll, chunkedIn } from '@/lib/pb';
import { isSchoolScoped, isSuperAdminRole } from '@/lib/authz';
import { useOrg } from '@/lib/org';
import { currency } from '@/lib/reports';
import type { UserProfile } from '@/types/auth';
import type { Employee } from '@/types/payroll';

type ListType = 'inclusion' | 'exclusion' | 'detailed';

const LIST_OPTIONS: { key: ListType; label: string }[] = [
  { key: 'inclusion', label: 'Inclusion' },
  { key: 'exclusion', label: 'Exclusion' },
  { key: 'detailed', label: 'Detailed' },
];

const LIST_LABEL: Record<ListType, string> = {
  inclusion: 'Inclusion',
  exclusion: 'Exclusion',
  detailed: 'Detailed',
};

// ── STACODE scoping ─────────────────────────────────────────────────────────

/** Raw / zero-padded / digit-only spellings of a STACODE, as used elsewhere in
 *  the app (School dashboard, School Directory, handleQueryEmployees). */
function stacodeVariants(code: string | null | undefined): string[] {
  const raw = (code ?? '').trim();
  if (!raw) return [];
  const digits = raw.replace(/\D+/g, '');
  const out = new Set<string>([raw]);
  if (digits) {
    out.add(digits);
    out.add(digits.padStart(3, '0'));
  }
  return [...out];
}

/** Whether a row belongs to the school being filed for: on a school account's
 *  screen that is every row it can see (they are already its own school's), and
 *  for the Super Admin it is the school picked in the toolbar — with no school
 *  picked, no row counts. Used for the per-school duplicate EMPNO check. */
function onFilingList(rowStacode: string | null | undefined, stamp: string, scoped: boolean): boolean {
  if (scoped) return true;
  const variants = stacodeVariants(stamp);
  if (variants.length === 0) return false;
  return matchesScope(rowStacode, variants);
}

/** An empty variant list means "not school-scoped" (division roles) — see all. */
function matchesScope(rowStacode: string | null | undefined, variants: string[]): boolean {
  if (variants.length === 0) return true;
  const raw = String(rowStacode ?? '').trim();
  if (!raw) return false;
  const digits = raw.replace(/\D+/g, '');
  return (
    variants.includes(raw) ||
    (digits !== '' && (variants.includes(digits) || variants.includes(digits.padStart(3, '0'))))
  );
}

// ── Row shapes ──────────────────────────────────────────────────────────────

interface EmployeeListRow {
  id: string;
  list_type?: string;
  empno?: string;
  employee_id?: string;
  employee_name?: string;
  stacode?: string;
  regcode?: string;
  divcode?: string;
  period?: string;
  effective_date?: string;
  reason?: string;
  remarks?: string;
  status?: string;
  requested_by?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  /** Where the employee sat before a transfer moved them (see 1800010013). */
  previous_stacode?: string;
  /** The transfer stamp — who moved the employee into the requesting school,
   *  and when. Set by the dialog's Transfer tab, applied by the pb_hooks twin. */
  transferred_by?: string;
  transferred_at?: string;
  created?: string;
}

// ── Formatting ──────────────────────────────────────────────────────────────

function fullName(e: Employee | undefined, fallback?: string): string {
  if (!e) return (fallback ?? '').trim() || '—';
  const last = (e.lname || e.last_name || '').trim();
  const first = (e.fname || e.first_name || '').trim();
  const mi = (e.mi ?? '').trim();
  if (last || first) return `${last}${last && first ? ', ' : ''}${first}${mi ? ' ' + mi : ''}`;
  return (e.empname ?? '').trim() || (e.employee_number ?? '').trim() || (e.empno ?? '').trim() || fallback || '—';
}

function empnoOf(e: Employee | undefined): string {
  if (!e) return '';
  return ((e.empno || e.employee_number || '') as string).trim();
}

function shortDate(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  return raw ? raw.slice(0, 10) : '—';
}

function daysSince(value: string | null | undefined): number | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw.slice(0, 10));
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '—';
  try {
    return currency(value);
  } catch {
    return String(value);
  }
}

function downloadCsv(headers: string[], body: string[][], filename: string) {
  const csv = [headers.join(','), ...body.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Hooks ───────────────────────────────────────────────────────────────────

function useScope(profile: UserProfile) {
  const scoped = isSchoolScoped(profile.role);
  const assigned = (profile.assigned_stacode ?? '').trim();
  const variants = useMemo(() => stacodeVariants(assigned), [assigned]);
  // A school-scoped account with no assigned school has nothing to stamp a row
  // with; the Super Admin stamps rows with a school chosen in the screen, so
  // they can always file.
  const noSchool = scoped && variants.length === 0;
  return { scoped, assigned, variants, noSchool, canFile: !noSchool };
}

/** Every request/list row, filtered to the caller's school on the client. */
function useListRows(variants: string[]) {
  const [rows, setRows] = useState<EmployeeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchAll<EmployeeListRow>(() => supabase.from('employee_lists').select('*'));
        if (!cancelled) setRows((data ?? []).filter((r) => matchesScope(r.stacode, variants)));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the lists.');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [JSON.stringify(variants), refreshKey]);

  return { rows, loading, error, refresh: () => setRefreshKey((k) => k + 1) };
}

/** Employee records for the given EMPNOs, wherever they sit in the division.
 *  `refreshSignal` re-fetches the same set — used after an approval so the
 *  employee's new station is shown right away. */
function useEmployeesByEmpno(empnos: string[], refreshSignal = 0) {
  const [byEmpno, setByEmpno] = useState<Map<string, Employee>>(new Map());
  const key = empnos.filter(Boolean).sort().join(',');

  useEffect(() => {
    let cancelled = false;
    const unique = [...new Set(empnos.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) { setByEmpno(new Map()); return; }
    (async () => {
      try {
        const rows = await chunkedIn<Employee>('empno', unique, (chunk) =>
          supabase.from('employees').select('*').in('empno', chunk),
        );
        if (cancelled) return;
        const map = new Map<string, Employee>();
        rows.forEach((e) => { const n = empnoOf(e); if (n) map.set(n, e); });
        setByEmpno(map);
      } catch {
        if (!cancelled) setByEmpno(new Map());
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshSignal]);

  return byEmpno;
}

/** The School Directory — the Super Admin files entries against a school of
 *  their choice because a super-admin account carries no assigned_stacode; the
 *  chosen school's code is what a school account would have taken from its own
 *  profile. */
function useSchoolDirectory(active: boolean) {
  const [rows, setRows] = useState<School[]>([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAll<School>(() =>
          supabase.from('schools').select('*').order('school_name'),
        );
        if (!cancelled) setRows(data ?? []);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  return rows;
}

/** The Division's employee records, used by the Add Employee search. */
function useDivisionEmployees(active: boolean, regcode?: string, divcode?: string) {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active || loaded) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchAll<Employee>(() => {
          const q = supabase.from('employees').select('*');
          // Division scope when the account carries one, otherwise the whole
          // masterfile — the coordinator may need an employee who is not yet
          // attributed to their station.
          return regcode ? q.eq('regcode', regcode) : q;
        });
        if (!cancelled) { setRows(data ?? []); setLoaded(true); }
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, loaded, regcode, divcode]);

  return { rows, loading };
}

// ── Small UI pieces ─────────────────────────────────────────────────────────

function Notice({ tone, children }: { tone: 'info' | 'warn'; children: ReactNode }) {
  const cls =
    tone === 'warn'
      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
      : 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400';
  return (
    <div className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-sm ${cls}`}>
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function StatePill({ status }: { status: string }) {
  const s = (status || 'Pending').toLowerCase();
  const cls =
    s === 'approved'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      : s === 'rejected'
        ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return <span className={`badge ${cls}`}>{status || 'Pending'}</span>;
}

function EmployeeStatus({ status }: { status: string }) {
  const active = (status || '').trim().toLowerCase() === 'active';
  return (
    <span
      className={`badge ${
        active
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {status || '—'}
    </span>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
      <LoadingIndicator size={32} />
      Loading...
    </div>
  );
}

const inputCls =
  'px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 transition-all';

function employeeDetail(e: Employee | undefined, row: EmployeeListRow): { label: string; value: string }[] {
  const list: { label: string; value: string }[] = [
    { label: 'Request status', value: (row.status ?? '').trim() || 'Pending' },
    { label: 'List', value: LIST_LABEL[(row.list_type ?? '') as ListType] ?? (row.list_type || '—') },
    { label: 'Period', value: (row.period ?? '').trim() || '—' },
    { label: 'Reason', value: (row.reason ?? '').trim() || '—' },
    { label: 'Remarks', value: (row.remarks ?? '').trim() || '—' },
    { label: 'Requested', value: shortDate(row.created) },
    { label: 'Approved by', value: (row.approved_by ?? '').trim() || '—' },
    { label: 'Approved at', value: shortDate(row.approved_at) },
    { label: 'Rejected by', value: (row.rejected_by ?? '').trim() || '—' },
    { label: 'Rejected at', value: shortDate(row.rejected_at) },
    { label: 'Rejection reason', value: (row.rejection_reason ?? '').trim() || '—' },
    // The transfer is a separate act from the decision (see 1800010013).
    { label: 'Transferred by', value: (row.transferred_by ?? '').trim() || '—' },
    { label: 'Transferred at', value: shortDate(row.transferred_at) },
    { label: 'Previous station', value: (row.previous_stacode ?? '').trim() || '—' },
  ];
  if (!e) return list;
  return [
    ...list,
    { label: 'Position', value: e.position || e.poscode || '—' },
    { label: 'Grade / Step', value: `${e.grade ?? '—'} / ${e.step ?? '—'}` },
    { label: 'Basic salary', value: money(e.basic || e.basic_salary) },
    { label: 'Net pay', value: money(e.netpay) },
    { label: 'Station', value: (e.stacode ?? '').trim() || '—' },
    { label: 'Hire date', value: shortDate(e.hiredate || e.hire_date) },
    { label: 'GSIS PN', value: e.gsis_pn || '—' },
    { label: 'TIN', value: e.tin || '—' },
  ];
}

// ── Employee Movement ───────────────────────────────────────────────────────

function AddEmployeeModal({
  profile,
  listType,
  scoped,
  stamp,
  existingEmpnos,
  onClose,
  onAdded,
}: {
  profile: UserProfile;
  listType: ListType;
  scoped: boolean;
  /** The school the request is filed for — the coordinator's own STACODE, or
   *  the Super Admin's choice in the toolbar. */
  stamp: string;
  existingEmpnos: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { scopedCodes } = useOrg();
  const regcode = scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].regcode : undefined;
  const divcode = scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].divcode : undefined;
  const { rows, loading } = useDivisionEmployees(true, regcode, divcode);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ListType>(listType);
  const [busyEmpno, setBusyEmpno] = useState('');
  const [error, setError] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = rows.filter((e) => !existingEmpnos.has(empnoOf(e)));
    if (!q) return pool.slice(0, 25);
    return pool
      .filter((e) =>
        empnoOf(e).toLowerCase().includes(q) ||
        fullName(e).toLowerCase().includes(q) ||
        (e.empname ?? '').toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [rows, query, existingEmpnos]);

  async function add(e: Employee) {
    const empno = empnoOf(e);
    if (!empno) { setError('This employee record has no employee number.'); return; }
    if (!stamp) {
      setError(scoped
        ? 'No school is assigned to your account, so nothing can be filed for it.'
        : 'Choose the school this request belongs to first.');
      return;
    }
    setBusyEmpno(empno);
    setError('');
    try {
      const { error: insertErr } = await supabase.from('employee_lists').insert({
        list_type: type,
        empno,
        employee_id: e.id ?? '',
        employee_name: fullName(e),
        // The request is stamped with the school it belongs to: the
        // coordinator's own STACODE, or the Super Admin's chosen school.
        stacode: stamp,
        regcode: e.regcode ?? regcode ?? '',
        divcode: e.divcode ?? divcode ?? '',
        period: '',
        reason: '',
        remarks:
          (e.stacode ?? '').trim() && (e.stacode ?? '').trim() !== stamp
            ? `Employee station in the masterfile: ${(e.stacode ?? '').trim()}`
            : '',
        status: 'Pending',
        requested_by: profile.id,
      });
      if (insertErr) throw insertErr;
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the request.');
    } finally {
      setBusyEmpno('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Add Employee</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Search the Division's employee records by employee number or name.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Employee number or name..."
              className={inputCls + ' w-full pl-10'}
            />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value as ListType)} className={inputCls}>
            {LIST_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="px-6 pb-2"><Notice tone="warn">{error}</Notice></div>}

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <Loading />
          ) : results.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              {query.trim() ? 'No matching employee records.' : 'Search for an employee to add.'}
            </p>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 font-medium">Employee No.</th>
                    <th className="text-left px-4 py-2.5 font-medium">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium">Position</th>
                    <th className="text-left px-4 py-2.5 font-medium">Station</th>
                    <th className="text-right px-4 py-2.5 font-medium">Request</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {results.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">{empnoOf(e) || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-800 dark:text-slate-100">{fullName(e)}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{e.position || e.poscode || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{(e.stacode ?? '').trim() || '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => void add(e)}
                          disabled={busyEmpno !== '' || !stamp}
                          title={!stamp ? 'Choose the school this request belongs to first' : undefined}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-deped-700 text-white hover:bg-deped-800 disabled:opacity-50 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {busyEmpno === empnoOf(e) ? 'Adding…' : `Add as ${LIST_LABEL[type]}`}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The Super Admin's decision dialog for one pending row — an Employee Movement
 *  request or a Newly Hired / Separated list row (`table`).
 *
 *  The acts are separate, so they get tabs rather than one row of buttons:
 *
 *  - **Approve** stamps `status/approved_by/approved_at` and moves nobody — it
 *    only records the decision.
 *  - **Reject** stamps the matching rejection fields (and the typed reason).
 *    Either way the other stamp is cleared so a row never carries both.
 *  - **Transfer** — offered only where `transfer` is passed, i.e. Employee
 *    Movement — stamps `transferred_by/transferred_at`. That stamp is what makes
 *    the server put the employee into the requesting school's Employee Records
 *    and remember their previous station on the row
 *    (`pb_hooks/employee_movement.pb.js`), so a later rejection or revoke can put
 *    them back. The Newly Hired and Separated lists do not offer it: they are
 *    deliberately not linked to Employee Records and only settle the entry.
 *
 *  Every write is a plain record update — the collections' update rule already
 *  lets a non-school-scoped account (the Super Admin) through, and stops a
 *  coordinator from settling a request themselves. */
type ReviewTab = 'approve' | 'reject' | 'transfer';

function ReviewModal({
  profile,
  row,
  table,
  heading,
  subtitle,
  details,
  footerNote,
  transfer,
  initialTab = 'approve',
  onClose,
  onReviewed,
}: {
  profile: UserProfile;
  /** The row being settled — only its id is written to. */
  row: { id: string; status?: string };
  /** Collection to update; the Employee Movement list by default. */
  table?: string;
  heading?: string;
  subtitle?: string;
  /** What the reviewer is deciding on, as label/value pairs. */
  details: { label: string; value: string }[];
  /** Shown beside the tab's action button. */
  footerNote: ReactNode;
  /** Offer the Transfer tab (Employee Movement only). */
  transfer?: {
    /** The school the employee is transferred into — the request's STACODE. */
    school: string;
    /** Where the employee sits right now, shown as the “from”. */
    from: string;
    /** Set once the request has already been transferred. */
    transferredAt?: string;
  };
  /** Which tab the dialog opens on. */
  initialTab?: ReviewTab;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [tab, setTab] = useState<ReviewTab>(initialTab);
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  /** The tabs on offer — Transfer only where the caller asked for it. */
  const tabs: { key: ReviewTab; label: string; icon: LucideIcon }[] = [
    { key: 'approve', label: 'Approve', icon: CheckCircle2 },
    { key: 'reject', label: 'Reject', icon: XCircle },
    ...(transfer ? [{ key: 'transfer' as ReviewTab, label: 'Transfer', icon: ArrowRightLeft }] : []),
  ];

  async function decide(next: 'Approved' | 'Rejected') {
    setBusy(next);
    setError('');
    try {
      const stamp = new Date().toISOString();
      const payload =
        next === 'Approved'
          ? {
              status: 'Approved',
              approved_by: profile.id,
              approved_at: stamp,
              rejected_by: '',
              rejected_at: '',
              rejection_reason: '',
            }
          : {
              status: 'Rejected',
              rejected_by: profile.id,
              rejected_at: stamp,
              rejection_reason: reason.trim(),
              approved_by: '',
              approved_at: '',
            };
      const { error: saveErr } = await supabase.from(table ?? 'employee_lists').update(payload).eq('id', row.id);
      if (saveErr) throw saveErr;
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision.');
    } finally {
      setBusy('');
    }
  }

  /** Transfer the employee into the requesting school's Employee Records.
   *
   *  Only the stamp is written here — the server hook
   *  (`pb_hooks/employee_movement.pb.js`) reads it and performs the move, so the
   *  stamp and the employee's station can never disagree. */
  async function transferEmployee() {
    setBusy('Transfer');
    setError('');
    try {
      const { error: saveErr } = await supabase
        .from(table ?? 'employee_lists')
        .update({ transferred_by: profile.id, transferred_at: new Date().toISOString() })
        .eq('id', row.id);
      if (saveErr) throw saveErr;
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not transfer the employee.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">
              {heading ?? 'Review Request'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {subtitle ?? 'Decide whether this request should be approved or rejected.'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {details.map((d) => (
            <p key={d.label} className="flex justify-between gap-4 text-xs">
              <span className="text-slate-500 dark:text-slate-400">{d.label}</span>
              <span className="text-slate-700 dark:text-slate-200 text-right">{d.value}</span>
            </p>
          ))}
        </div>

        <div className="px-6 pt-4">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setError(''); }}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'approve' && (
          <p className="px-6 pt-3 text-xs text-slate-500 dark:text-slate-400">
            Approving records the decision. The employee's Employee Records are not touched by it — use the Transfer
            tab to move them into the requesting school.
          </p>
        )}

        {tab === 'reject' && (
          <div className="px-6 pt-3">
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Rejection reason <span className="text-slate-400 normal-case">(needed when rejecting)</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional — why this request is being turned down"
                rows={3}
                className={inputCls + ' w-full resize-none'}
              />
            </label>
          </div>
        )}

        {tab === 'transfer' && transfer && (
          <div className="px-6 pt-3 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Move <span className="font-semibold">{transfer.from || 'the employee'}</span> into STACODE{' '}
              <span className="font-semibold">{transfer.school || '—'}</span>'s Employee Records. Their record then
              reads as this school's, and the station they came from is kept on the request so a later rejection or
              revoke can put them back.
            </p>
            {transfer.transferredAt ? (
              <Notice tone="info">
                Already transferred on {shortDate(transfer.transferredAt)} — the employee is in this school's Employee
                Records. Use Reject or the row's Revoke action to put them back.
              </Notice>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-400 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                This changes the employee's masterfile station. It is not the decision — the request stays Pending
                until it is approved or rejected.
              </p>
            )}
          </div>
        )}

        {error && <div className="px-6 pb-2"><Notice tone="warn">{error}</Notice></div>}

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-400 dark:text-slate-500 max-w-md">{footerNote}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            {tab === 'reject' && (
              <button
                onClick={() => void decide('Rejected')}
                disabled={busy !== ''}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                {busy === 'Rejected' ? 'Rejecting…' : 'Reject'}
              </button>
            )}
            {tab === 'approve' && (
              <button
                onClick={() => void decide('Approved')}
                disabled={busy !== ''}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                {busy === 'Approved' ? 'Approving…' : 'Approve'}
              </button>
            )}
            {tab === 'transfer' && transfer && (
              <button
                onClick={() => void transferEmployee()}
                disabled={busy !== '' || Boolean(transfer.transferredAt)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                <ArrowRightLeft className="w-4 h-4" />
                {busy === 'Transfer' ? 'Transferring…' : transfer.transferredAt ? 'Already transferred' : 'Transfer'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The Super Admin's revoke dialog for an APPROVED Employee Movement request.
 *
 *  Revoke deletes the settled request AND puts the employee's masterfile record
 *  back to the school the approval moved it from — the server-side delete guard
 *  in `main.go` (employeeMovementRevokeGuard) restores `employees.stacode` to
 *  the request's `previous_stacode` before the row is removed, and only lets a
 *  super_admin delete a settled request at all. Rejected rows are simply frozen
 *  — there is nothing to undo — so this dialog is only offered for Approved. */
function RevokeModal({
  row,
  heading,
  subtitle,
  details,
  onClose,
  onRevoked,
}: {
  /** The approved row being revoked — only its id is deleted. */
  row: { id: string };
  heading?: string;
  subtitle?: string;
  details: { label: string; value: string }[];
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function revoke() {
    setBusy(true);
    setError('');
    try {
      const { error: delErr } = await supabase.from('employee_lists').delete().eq('id', row.id);
      if (delErr) throw delErr;
      onRevoked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-600">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              {heading ?? 'Revoke approval'}
            </h3>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {details.map((d) => (
              <p key={d.label} className="flex justify-between gap-4 text-xs">
                <span className="text-slate-500 dark:text-slate-400">{d.label}</span>
                <span className="text-slate-700 dark:text-slate-200 text-right">{d.value}</span>
              </p>
            ))}
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
            Revoking deletes this approved request and returns the employee's record to the school the
            approval moved it from. The decision is not reversible — the request would have to be
            filed again.
          </p>
          {error && (
            <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-600">
          <button
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void revoke()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 dark:bg-amber-500 text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            <Undo2 className="w-4 h-4" />
            {busy ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmployeeMovement({ profile }: { profile: UserProfile }) {
  const scope = useScope(profile);
  const { rows: listRows, loading, error, refresh } = useListRows(scope.variants);
  // Bumped after a review so the masterfile rows are re-read: approving a
  // request moves the employee to the requesting school, and the screen should
  // show that station right away.
  const [empRefresh, setEmpRefresh] = useState(0);
  const byEmpno = useEmployeesByEmpno(listRows.map((r) => (r.empno ?? '').trim()), empRefresh);
  const [listType, setListType] = useState<ListType>('inclusion');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [saveError, setSaveError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  // The Super Admin reviews the requests raised across all schools: the row
  // open in the Review dialog.
  const [reviewId, setReviewId] = useState<string | null>(null);
  /** Which tab the review dialog opens on — the row's buttons pick it. */
  const [reviewTab, setReviewTab] = useState<ReviewTab>('approve');
  const reviewer = isSuperAdminRole(profile.role);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  // The Super Admin has no assigned school: the school a new request belongs to
  // is chosen here (the School Directory). A school account keeps its own
  // STACODE and is not offered the picker.
  const schools = useSchoolDirectory(!scope.scoped);
  const [schoolCode, setSchoolCode] = useState('');
  const stamp = scope.scoped ? scope.assigned : schoolCode.trim();

  // One row per employee per list: the request type IS the list they are on.
  const rows = useMemo(() => {
    return listRows
      .filter((r) => (r.list_type ?? '') === listType)
      .map((r) => {
        const empno = (r.empno ?? '').trim();
        const emp = byEmpno.get(empno);
        return { row: r, empno, emp, status: (r.status ?? '').trim() || 'Pending' };
      });
  }, [listRows, listType, byEmpno]);

  const reviewRow = useMemo(
    () => rows.find((r) => r.row.id === reviewId) ?? null,
    [rows, reviewId],
  );
  const revokeRow = useMemo(
    () => rows.find((r) => r.row.id === revokeId) ?? null,
    [rows, revokeId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      ({ empno, emp, row }) =>
        empno.toLowerCase().includes(q) ||
        fullName(emp, row.employee_name).toLowerCase().includes(q) ||
        (row.employee_name ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const pagination = usePagination(filtered, 10, `${listType}|${search}`);

  // Employees already on the list being filed for: the coordinator's own
  // school's rows, or — for the Super Admin — only the chosen school's, so
  // adding a name for one school does not hide it for another.
  const existingEmpnos = useMemo(
    () =>
      new Set(
        listRows
          .filter((r) => onFilingList(r.stacode, stamp, scope.scoped))
          .map((r) => (r.empno ?? '').trim())
          .filter(Boolean),
      ),
    [listRows, scope.scoped, stamp],
  );

  /** Move an employee between lists, or withdraw the request ('' = remove). */
  async function setRequest(entry: { row: EmployeeListRow; empno: string; emp: Employee | undefined; status: string }, next: ListType | '') {
    if (entry.status.toLowerCase() !== 'pending') {
      setSaveError('This request is already settled and can no longer be changed here.');
      return;
    }
    // Only the account that filed a request may move or withdraw it — the
    // collection rule agrees (requested_by = @request.auth.id && Pending).
    if ((entry.row.requested_by ?? '') !== profile.id) {
      setSaveError('This request was raised by another user, so only its requester or the Division can change it.');
      return;
    }
    setBusyId(entry.row.id);
    setSaveError('');
    try {
      // Withdraw the pending request first (only our own pending rows may be
      // touched — the collection rule enforces it, and it keeps one row per
      // employee per list).
      const { error: delErr } = await supabase.from('employee_lists').delete().eq('id', entry.row.id);
      if (delErr) throw delErr;

      if (next) {
        const { error: insErr } = await supabase.from('employee_lists').insert({
          list_type: next,
          empno: entry.empno,
          employee_id: entry.emp?.id ?? entry.row.employee_id ?? '',
          employee_name: entry.row.employee_name ?? fullName(entry.emp),
          // Keep the school the request already belongs to; a new request the
          // Super Admin files takes the school chosen in the toolbar.
          stacode: entry.row.stacode || stamp,
          regcode: entry.row.regcode ?? entry.emp?.regcode ?? '',
          divcode: entry.row.divcode ?? entry.emp?.divcode ?? '',
          period: entry.row.period ?? '',
          reason: entry.row.reason ?? '',
          remarks: entry.row.remarks ?? '',
          status: 'Pending',
          requested_by: profile.id,
        });
        if (insErr) throw insErr;
      }
      refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not update the request.');
    } finally {
      setBusyId('');
    }
  }

  function exportRows() {
    const headers = ['Employee No.', 'Name', 'Position', 'Grade/Step', 'Status', 'Request', 'Request Status'];
    const body = filtered.map(({ empno, emp, row, status }) => [
      empno,
      fullName(emp, row.employee_name),
      emp?.position || emp?.poscode || '',
      emp ? `${emp.grade ?? ''}/${emp.step ?? ''}` : '',
      emp?.status || '',
      LIST_LABEL[listType],
      status,
    ]);
    downloadCsv(headers, body, `employee_${listType}.csv`);
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Employee Movement</h1>
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-deped-700 text-white flex items-center justify-center">
              <GitBranch className="w-5 h-5" />
            </span>
            Employee Movement
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 ml-13">
            {scope.scoped
              ? "Inclusion, Exclusion and Detailed requests for your school, linked to the Division's employee records."
              : "Inclusion, Exclusion and Detailed requests across all schools, linked to the Division's employee records. Pick a school to file a request for it."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-400">
            {filtered.length.toLocaleString()} on the {LIST_LABEL[listType]} list
          </span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            {scope.scoped ? 'Request only' : 'All schools — file & move'}
          </span>
        </div>
      </div>

      {scope.noSchool && (
        <Notice tone="warn">
          No school is assigned to your account yet, so these lists are empty. Ask your Division Office to set your
          Assigned STACODE.
        </Notice>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
      {saveError && <Notice tone="warn">{saveError}</Notice>}

      {!scope.noSchool && (
        <>
          {/* Toolbar: add + export, plus the List selector for a viewer who sees
              every school (the Super Admin needs it to move between the three
              lists). For the coordinator the selector and the search box are
              deliberately NOT rendered (removed from the UI on request) — the
              `listType` / `search` state and the filtering below stay exactly as
              they are, so the controls can be re-attached without rebuilding the
              data flow. The Super Admin files too: the school a new request
              belongs to is picked from the School Directory. */}
          <div className="enterprise-card p-4 sticky top-16 z-20 flex flex-wrap items-center justify-end gap-3">
            {!scope.scoped && (
              <div className="flex items-center gap-2 mr-auto">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  List
                </label>
                <select
                  value={listType}
                  onChange={(e) => { setListType(e.target.value as ListType); setSearch(''); setExpanded(null); }}
                  className={inputCls}
                >
                  {LIST_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-2">
                  School
                </label>
                <select
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value)}
                  className={inputCls + ' max-w-56'}
                >
                  <option value="">— Choose school —</option>
                  {schools.map((s) => (
                    <option key={s.id} value={(s.stacode || s.school_code || '').trim()}>
                      {(s.stacode || s.school_code || '—').trim()} · {s.school_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSaveError(''); setShowAdd(true); }}
                disabled={!stamp}
                title={!stamp ? (scope.scoped
                  ? 'No school is assigned to your account'
                  : 'Choose the school this request belongs to first') : undefined}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-deped-700 text-white text-sm font-medium hover:bg-deped-800 disabled:opacity-50 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Employee
              </button>
              <button
                onClick={exportRows}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Download className="w-4 h-4" /> Export
              </button>
            </div>
          </div>

          {/* Table — Employee Records columns minus BASIC and NETPAY, plus Request */}
          <div className="enterprise-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left font-semibold">EMPNO</th>
                    <th className="px-4 py-3 text-left font-semibold">Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Position</th>
                    <th className="px-4 py-3 text-left font-semibold">Grade/Step</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Request</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {pagination.pagedItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                        {search.trim()
                          ? 'No matching employees on this list.'
                          : `No employees are on the ${LIST_LABEL[listType]} list yet. Use “Add Employee” to raise a request.`}
                      </td>
                    </tr>
                  ) : (
                    pagination.pagedItems.map(({ emp, empno, row, status }) => {
                      // A settled request (approved / rejected) is frozen for
                      // everyone. A pending one may be moved or withdrawn by the
                      // account that filed it — the coordinator for its own
                      // request, the Super Admin for one they filed themselves —
                      // and, for the Super Admin, reviewed (approved / rejected)
                      // regardless of who filed it.
                      const pending = status.toLowerCase() === 'pending';
                      const mine = (row.requested_by ?? '') === profile.id;
                      const open = expanded === row.id;
                      return (
                        <Fragment key={row.id}>
                          <tr
                            onClick={() => setExpanded(open ? null : row.id)}
                            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{empno || '—'}</td>
                            <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                              <span className="inline-flex items-center gap-1.5">
                                {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                                {fullName(emp, row.employee_name)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                              {emp ? (emp.position || emp.poscode || '—') : <span className="text-amber-600 dark:text-amber-400">Not in the masterfile</span>}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                              {emp ? `${emp.grade ?? '—'}/${emp.step ?? '—'}` : '—'}
                            </td>
                            <td className="px-4 py-3"><EmployeeStatus status={emp?.status ?? ''} /></td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2 flex-wrap">
                                {!pending ? (
                                  <>
                                    {reviewer && status.toLowerCase() === 'approved' && (
                                      <button
                                        onClick={() => { setSaveError(''); setRevokeId(row.id); }}
                                        disabled={busyId === row.id}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 transition-colors"
                                      >
                                        <Undo2 className="w-3.5 h-3.5" /> Revoke
                                      </button>
                                    )}
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                      <Lock className="w-3.5 h-3.5" /> {LIST_LABEL[listType]}
                                    </span>
                                    <StatePill status={status} />
                                  </>
                                ) : (
                                  <>
                                    {mine && (
                                      <select
                                        value={row.list_type ?? ''}
                                        disabled={busyId === row.id}
                                        onChange={(e) => void setRequest({ row, empno, emp, status }, (e.target.value || '') as ListType | '')}
                                        className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-deped-500/30"
                                      >
                                        {LIST_OPTIONS.map((o) => (
                                          <option key={o.key} value={o.key}>
                                            {o.label}
                                          </option>
                                        ))}
                                        <option value="">— Remove request</option>
                                      </select>
                                    )}
                                    {reviewer && (
                                      <>
                                        <button
                                          onClick={() => { setSaveError(''); setReviewTab('approve'); setReviewId(row.id); }}
                                          disabled={busyId === row.id}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50 transition-colors"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                                        </button>
                                        <button
                                          onClick={() => { setSaveError(''); setReviewTab('reject'); setReviewId(row.id); }}
                                          disabled={busyId === row.id}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50 transition-colors"
                                        >
                                          <XCircle className="w-3.5 h-3.5" /> Reject
                                        </button>
                                      </>
                                    )}
                                    {!mine && !reviewer && (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                        <Lock className="w-3.5 h-3.5" /> {LIST_LABEL[listType]}
                                      </span>
                                    )}
                                    <StatePill status={status} />
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {open && (
                            <tr className="bg-slate-50 dark:bg-slate-800/40">
                              <td />
                              <td colSpan={5} className="px-4 py-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                                  {employeeDetail(emp, row).map((d) => (
                                    <p key={d.label} className="flex justify-between gap-4 text-xs">
                                      <span className="text-slate-500 dark:text-slate-400">{d.label}</span>
                                      <span className="text-slate-700 dark:text-slate-200 text-right">{d.value}</span>
                                    </p>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <Pagination pagination={pagination} label={`${LIST_LABEL[listType]} entries`} />
            )}
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            {scope.scoped
              ? 'Requests are saved as Pending and decided by the Super Admin. You can change or withdraw a pending request; an approved or rejected one is locked.'
              : 'Approve or reject each pending request to settle it, or use the request dialog\'s Transfer tab to move the employee into the requesting school\'s Employee Records. Requests you file yourself can still be moved between the lists or withdrawn while pending. A settled request is locked, but an approved one can be revoked — the employee then returns to their previous school.'}
          </p>
        </>
      )}

      {showAdd && (
        <AddEmployeeModal
          profile={profile}
          listType={listType}
          scoped={scope.scoped}
          stamp={stamp}
          existingEmpnos={existingEmpnos}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); refresh(); }}
        />
      )}

      {reviewRow && (
        <ReviewModal
          profile={profile}
          row={reviewRow.row}
          details={[
            { label: 'Employee', value: fullName(reviewRow.emp, reviewRow.row.employee_name) },
            { label: 'EMPNO', value: reviewRow.empno || '—' },
            {
              label: 'List',
              value:
                LIST_LABEL[(reviewRow.row.list_type ?? '') as ListType] ?? (reviewRow.row.list_type || '—'),
            },
            { label: 'Requested', value: shortDate(reviewRow.row.created) },
            { label: 'Period', value: (reviewRow.row.period ?? '').trim() || '—' },
            { label: 'Reason', value: (reviewRow.row.reason ?? '').trim() || '—' },
            { label: 'Remarks', value: (reviewRow.row.remarks ?? '').trim() || '—' },
          ]}
          footerNote="Approving or rejecting only records the decision; Transfer is the act that moves the employee into the requesting school's Employee Records."
          transfer={{
            school: (reviewRow.row.stacode ?? '').trim(),
            from: (reviewRow.emp?.stacode ?? '').trim(),
            transferredAt: reviewRow.row.transferred_at,
          }}
          initialTab={reviewTab}
          onClose={() => setReviewId(null)}
          onReviewed={() => { setReviewId(null); refresh(); setEmpRefresh((n) => n + 1); }}
        />
      )}

      {revokeRow && (
        <RevokeModal
          row={revokeRow.row}
          details={[
            { label: 'Employee', value: fullName(revokeRow.emp, revokeRow.row.employee_name) },
            { label: 'EMPNO', value: revokeRow.empno || '—' },
            {
              label: 'List',
              value:
                LIST_LABEL[(revokeRow.row.list_type ?? '') as ListType] ?? (revokeRow.row.list_type || '—'),
            },
            { label: 'Approved', value: shortDate(revokeRow.row.approved_at) },
            { label: 'Period', value: (revokeRow.row.period ?? '').trim() || '—' },
            { label: 'Reason', value: (revokeRow.row.reason ?? '').trim() || '—' },
          ]}
          onClose={() => setRevokeId(null)}
          onRevoked={() => { setRevokeId(null); refresh(); setEmpRefresh((n) => n + 1); }}
        />
      )}
    </div>
  );
}

/** Why a newly hired entry can or cannot be changed, shown beside its actions.
 *  Only a still-Pending entry may be edited or withdrawn, and only by the
 *  account that filed it (the requester) — the same rule the collection's
 *  update/delete rules enforce. An approved one is frozen. */
function entryNote(status: string, mine: boolean): string {
  const s = status.toLowerCase();
  if (s === 'pending') {
    return mine
      ? 'Pending — you can edit or withdraw this entry.'
      : 'Pending — raised by another user, so only its requester or the Division can change it.';
  }
  if (s === 'approved') return 'Approved — this entry can no longer be changed here.';
  return `${status} — this entry is closed; add a new one if it needs to change.`;
}

interface ListColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

interface ListRow {
  key: string;
  cells: Record<string, string>;
  detail?: { label: string; value: string }[];
  /** Set for a still-pending request the coordinator may edit. */
  canEdit?: boolean;
  /** Set for a still-pending request the coordinator may withdraw. */
  canWithdraw?: boolean;
  /** Set for a still-pending entry the Super Admin may approve or reject. */
  canReview?: boolean;
  /** Short hint shown beside the row's actions (e.g. why it is locked). */
  note?: string;
}

function RowTable({
  columns,
  rows,
  emptyMessage,
  onEdit,
  onWithdraw,
  onReview,
}: {
  columns: ListColumn[];
  rows: ListRow[];
  emptyMessage: string;
  onEdit?: (key: string) => void;
  onWithdraw?: (key: string) => void;
  /** Opens the review dialog — it carries the Approve / Reject decision. */
  onReview?: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const hasDetail = rows.some((r) => r.detail && r.detail.length > 0);

  if (rows.length === 0) {
    return <div className="enterprise-card py-16 text-center text-slate-400">{emptyMessage}</div>;
  }

  return (
    <div className="enterprise-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              {hasDetail && <th className="w-8" />}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.key}>
                <tr
                  onClick={() => hasDetail && setExpanded(expanded === r.key ? null : r.key)}
                  className={`border-b border-slate-100 dark:border-slate-800/50 transition-colors ${
                    hasDetail ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30' : ''
                  }`}
                >
                  {hasDetail && (
                    <td className="pl-4 text-slate-400">
                      {expanded === r.key ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 ${
                        c.align === 'right'
                          ? 'text-right tabular'
                          : c.align === 'center'
                            ? 'text-center'
                            : 'text-left text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {r.cells[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
                {hasDetail && expanded === r.key && (
                  <tr className="bg-slate-50 dark:bg-slate-800/40">
                    <td />
                    <td colSpan={columns.length} className="px-4 py-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                        {(r.detail ?? []).map((d) => (
                          <p key={d.label} className="flex justify-between gap-4 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">{d.label}</span>
                            <span className="text-slate-700 dark:text-slate-200 text-right">{d.value}</span>
                          </p>
                        ))}
                      </div>
                      {(r.note || (r.canEdit && onEdit) || (r.canWithdraw && onWithdraw) || (r.canReview && onReview)) && (
                        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                          <span className="text-xs text-slate-400 dark:text-slate-500">{r.note ?? ''}</span>
                          <div className="flex items-center gap-2">
                            {r.canReview && onReview && (
                              <>
                                <button
                                  onClick={() => onReview(r.key)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                                </button>
                                <button
                                  onClick={() => onReview(r.key)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                >
                                  <XCircle className="w-3.5 h-3.5" /> Reject
                                </button>
                              </>
                            )}
                            {r.canEdit && onEdit && (
                              <button
                                onClick={() => onEdit(r.key)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit entry
                              </button>
                            )}
                            {r.canWithdraw && onWithdraw && (
                              <button
                                onClick={() => onWithdraw(r.key)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" /> Withdraw request
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Newly Hired / Separated Employees — their own tables ────────────────────
// Each list is backed by its own dedicated collection (`newly_hired_employees`,
// `separated_employees`) — NOT the employee masterfile and NOT the payroll's own
// newly-hired handling. Neither is linked to Employee Records: the coordinator
// adds a row from a blank fill-out card and the row keeps exactly the columns
// asked for — EMPNO, Account No., Last Name, First Name, M.I., Position.
// See pb_migrations/1800010007_created_newly_hired_employees.js and
// pb_migrations/1800010008_created_separated_employees.js.
//
// Both lists are the SAME screen with different labels and tables, so the shell
// below is driven by an `EmployeeEntryConfig`: adding another list (retired,
// transferred, ...) means one config object, one migration and one export.

/** One coordinator-only employee list: its table, its date column, its words. */
interface EmployeeEntryConfig {
  /** PocketBase collection holding the entries. */
  table: string;
  /** Header icon for the screen. */
  icon: LucideIcon;
  /** Noun used by the pagination footer ("Showing 1–10 of 25 …"). */
  paginationLabel: string;
  /** Date column on that collection, and the label to show for it. */
  dateColumn: string;
  dateLabel: string;
  detailDateLabel: string;
  title: string;
  subtitle: string;
  cardTitle: string;
  editTitle: string;
  cardIntro: string;
  cardIntroEdit: string;
  emptyMessage: string;
  csvName: string;
  /** Hide the Account No. column (the separated list omits it and adds STATUS). */
  hideAccountColumn?: boolean;
  /** Optional per-list reason column: a dropdown in the card, a column in the
   *  table and a row in the detail panel. Deliberately separate from the
   *  approval `status` (Pending / Approved / Rejected). */
  statusField?: { column: string; label: string; options: string[] };
}

const NEWLY_HIRED_LIST: EmployeeEntryConfig = {
  table: 'newly_hired_employees',
  icon: UserPlus,
  paginationLabel: 'newly hired entries',
  dateColumn: 'hiredate',
  dateLabel: 'Hire Date',
  detailDateLabel: 'Hire date',
  title: 'Newly Hired Employees',
  subtitle: 'Newly hired employees recorded for your school — added by filling out a new entry.',
  cardTitle: 'Newly Hired Employee',
  editTitle: 'Edit Newly Hired Employee',
  cardIntro:
    "Fill out the fields below. This is a new entry for your school's newly hired list — it is not taken from, and does not change, Employee Records.",
  cardIntroEdit:
    'Update the fields below. Only your own pending entry can be changed — an approved one is locked.',
  emptyMessage:
    'No newly hired employees have been recorded for your school yet. Use “New Entry” to fill one out.',
  csvName: 'newly_hired_employees.csv',
};

const SEPARATED_LIST: EmployeeEntryConfig = {
  table: 'separated_employees',
  icon: UserMinus,
  paginationLabel: 'separated entries',
  dateColumn: 'separation_date',
  dateLabel: 'Effectivity',
  detailDateLabel: 'Effectivity',
  // The account number is not kept on this list; STATUS carries why the
  // employee left.
  hideAccountColumn: true,
  statusField: {
    column: 'separation_status',
    label: 'STATUS',
    options: ['Resigned', 'Retired', 'Transferred', 'Deceased'],
  },
  title: 'Separated Employees',
  subtitle: 'Separated employees recorded for your school — added by filling out a new entry.',
  cardTitle: 'Separated Employee',
  editTitle: 'Edit Separated Employee',
  cardIntro:
    "Fill out the fields below. This is a new entry for your school's separated list — it is not taken from, and does not change, Employee Records.",
  cardIntroEdit:
    'Update the fields below. Only your own pending entry can be changed — an approved one is locked.',
  emptyMessage:
    'No separated employees have been recorded for your school yet. Use “New Entry” to fill one out.',
  csvName: 'separated_employees.csv',
};

interface EmployeeEntryRow {
  id: string;
  empno?: string;
  account?: string;
  last_name?: string;
  first_name?: string;
  mi?: string;
  position?: string;
  stacode?: string;
  regcode?: string;
  divcode?: string;
  /** Exactly one of these is used, depending on the list's `dateColumn`. */
  hiredate?: string;
  separation_date?: string;
  /** The separated list's reason (Resigned / Retired / Transferred / Deceased). */
  separation_status?: string;
  status?: string;
  requested_by?: string;
  approved_by?: string;
  approved_at?: string;
  /** The Super Admin's rejection stamp (see 1800010011). */
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  created?: string;
}

/** The review dialog's summary of one Newly Hired / Separated entry — the
 *  columns the list shows plus the entry's own date, its reason and the request
 *  state, so the Super Admin decides on the same facts the requester entered. */
function entryReviewDetails(config: EmployeeEntryConfig, row: EmployeeEntryRow): { label: string; value: string }[] {
  const last = (row.last_name ?? '').trim();
  const first = (row.first_name ?? '').trim();
  const mi = (row.mi ?? '').trim();
  const name = `${last}${last && first ? ', ' : ''}${first}${mi ? ' ' + mi : ''}`;
  return [
    { label: 'EMPNO', value: (row.empno ?? '').trim() || '—' },
    { label: 'Employee', value: name || '—' },
    ...(config.hideAccountColumn
      ? []
      : [{ label: 'Account No.', value: (row.account ?? '').trim() || '—' }]),
    { label: 'Position', value: (row.position ?? '').trim() || '—' },
    { label: config.detailDateLabel, value: shortDate(row.hiredate ?? row.separation_date) },
    ...(config.statusField
      ? [{ label: config.statusField.label, value: (row.separation_status ?? '').trim() || '—' }]
      : []),
    { label: 'Station', value: (row.stacode ?? '').trim() || '—' },
    { label: 'Request status', value: (row.status ?? '').trim() || 'Pending' },
    { label: 'Added', value: shortDate(row.created) },
  ];
}

/** Rows of one entry table, filtered to the caller's school. */
function useEmployeeEntries(table: string, variants: string[]) {
  const [rows, setRows] = useState<EmployeeEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchAll<EmployeeEntryRow>(() => supabase.from(table).select('*'));
        if (!cancelled) setRows((data ?? []).filter((r) => matchesScope(r.stacode, variants)));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the list.');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [table, JSON.stringify(variants), refreshKey]);

  return { rows, loading, error, refresh: () => setRefreshKey((k) => k + 1) };
}

/** The entry card — blank when adding, prefilled when editing.
 *
 * This list is deliberately NOT linked to Employee Records: the coordinator
 * fills out the fields instead of picking an existing masterfile record, so
 * nothing is read from — or written to — `employees`. Whatever is typed here is
 * what the list stores.
 *
 * Editing is limited to the coordinator's OWN still-Pending entries; an approved
 * one is frozen here and by the collection's update rule on the server. */
function EmployeeEntryCard({
  profile,
  scope,
  stamp,
  config,
  entry,
  existingEmpnos,
  onClose,
  onSaved,
}: {
  profile: UserProfile;
  scope: { assigned: string; variants: string[]; scoped: boolean };
  /** The school a NEW entry is filed for — the account's own STACODE, or the
   *  Super Admin's choice in the toolbar. An edit keeps the row's own school. */
  stamp: string;
  config: EmployeeEntryConfig;
  /** The row being edited; omitted (or null) when adding a new entry. */
  entry?: EmployeeEntryRow | null;
  existingEmpnos: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { scopedCodes } = useOrg();
  const regcode = scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].regcode : '';
  const divcode = scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].divcode : '';
  const isEdit = !!entry;
  const [form, setForm] = useState({
    empno: (entry?.empno ?? '').trim(),
    account: (entry?.account ?? '').trim(),
    last_name: (entry?.last_name ?? '').trim(),
    first_name: (entry?.first_name ?? '').trim(),
    mi: (entry?.mi ?? '').trim(),
    position: (entry?.position ?? '').trim(),
    entry_status: (entry?.separation_status ?? '').trim(),
    hiredate: ((entry?.hiredate ?? entry?.separation_date) ?? '').trim().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSave =
    form.empno.trim() !== '' &&
    form.last_name.trim() !== '' &&
    form.first_name.trim() !== '' &&
    // A new entry needs a school to belong to; an edit keeps the row's own.
    (isEdit || stamp !== '');

  async function save() {
    const empno = form.empno.trim();
    if (!empno) { setError('Employee number is required.'); return; }
    if (!isEdit && !stamp) {
      setError(scope.scoped
        ? 'No school is assigned to your account, so nothing can be filed for it.'
        : 'Choose the school this entry belongs to first.');
      return;
    }
    // The employee number is unique per school's list, but an unchanged one on
    // the row being edited is not a duplicate.
    if (existingEmpnos.has(empno) && empno !== (entry?.empno ?? '').trim()) {
      setError(`Employee number ${empno} is already on your list.`);
      return;
    }
    if (entry && (entry.status ?? 'Pending').trim().toLowerCase() !== 'pending') {
      setError('This entry is already approved and can no longer be changed here.');
      return;
    }
    setBusy(true);
    setError('');
    // The date column is named per list (`hiredate` / `separation_date`).
    const fields: Record<string, string> = {
      empno,
      // The account number is only kept where the list shows it as a column.
      ...(config.hideAccountColumn ? {} : { account: form.account.trim() }),
      last_name: form.last_name.trim(),
      first_name: form.first_name.trim(),
      mi: form.mi.trim(),
      position: form.position.trim(),
      [config.dateColumn]: form.hiredate ? form.hiredate.slice(0, 10) : '',
    };
    // The list's own reason column (e.g. `separation_status`), when it has one.
    if (config.statusField) fields[config.statusField.column] = form.entry_status;
    try {
      // Only the typed fields move — status, requester and school are left as
      // they are, so an edit never re-stamps or re-assigns the entry.
      const { error: saveErr } = entry
        ? await supabase.from(config.table).update(fields).eq('id', entry.id)
        : await supabase.from(config.table).insert({
            ...fields,
            // The entry belongs to the school it is filed for: the school
            // account's own STACODE, or the school the Super Admin picked.
            stacode: stamp,
            regcode: regcode,
            divcode: divcode,
            status: 'Pending',
            requested_by: profile.id,
          });
      if (saveErr) throw saveErr;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the entry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">
              {isEdit ? config.editTitle : config.cardTitle}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isEdit ? config.cardIntroEdit : config.cardIntro}
            </p>
            {!isEdit && stamp && (
              <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg text-xs font-semibold bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-400">
                Filing for school {stamp}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form
            onSubmit={(e) => { e.preventDefault(); void save(); }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                EMPNO <span className="text-rose-500">*</span>
              </span>
              <input
                autoFocus
                value={form.empno}
                onChange={(e) => set('empno', e.target.value)}
                placeholder="e.g. 0012345"
                className={inputCls + ' w-full font-mono'}
              />
            </label>
            {!config.hideAccountColumn && (
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Account No.
                </span>
                <input
                  value={form.account}
                  onChange={(e) => set('account', e.target.value)}
                  placeholder="Account number"
                  className={inputCls + ' w-full font-mono'}
                />
              </label>
            )}
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Last Name <span className="text-rose-500">*</span>
              </span>
              <input
                value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
                placeholder="Last name"
                className={inputCls + ' w-full'}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                First Name <span className="text-rose-500">*</span>
              </span>
              <input
                value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
                placeholder="First name"
                className={inputCls + ' w-full'}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                M.I.
              </span>
              <input
                value={form.mi}
                onChange={(e) => set('mi', e.target.value)}
                placeholder="M.I."
                maxLength={4}
                className={inputCls + ' w-full'}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Position
              </span>
              <input
                value={form.position}
                onChange={(e) => set('position', e.target.value)}
                placeholder="e.g. Teacher I"
                className={inputCls + ' w-full'}
              />
            </label>
            {config.statusField && (
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  {config.statusField.label}
                </span>
                <select
                  value={form.entry_status}
                  onChange={(e) => set('entry_status', e.target.value)}
                  className={inputCls + ' w-full'}
                >
                  <option value="">— select —</option>
                  {config.statusField.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                {config.dateLabel} <span className="text-slate-400 normal-case">(optional)</span>
              </span>
              <input
                type="date"
                value={form.hiredate}
                onChange={(e) => set('hiredate', e.target.value)}
                className={inputCls + ' w-full sm:max-w-xs'}
              />
            </label>
          </form>
        </div>

        {error && <div className="px-6 pb-3"><Notice tone="warn">{error}</Notice></div>}

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {isEdit
              ?        'Changes keep the entry Pending until the Super Admin approves it.'
              : 'Saved as Pending for the Super Admin to approve.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={busy || !canSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-deped-700 text-white hover:bg-deped-800 disabled:opacity-50 transition-colors"
            >
              {isEdit ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add to list'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeeEntryList({ profile, config }: { profile: UserProfile; config: EmployeeEntryConfig }) {
  const scope = useScope(profile);
  const { rows, loading, error, refresh } = useEmployeeEntries(config.table, scope.variants);
  const [showAdd, setShowAdd] = useState(false);
  /** Search stays available to the screen even though its input is not rendered
   *  (see the toolbar note) — the list is filtered by it as before. */
  const [search, setSearch] = useState('');
  /** The row open in the card, or null when the card is closed. */
  const [editing, setEditing] = useState<EmployeeEntryRow | null>(null);
  const [saveError, setSaveError] = useState('');
  /** The Super Admin settles the pending entries of every school. */
  const reviewer = isSuperAdminRole(profile.role);
  /** The row open in the review dialog, or null when it is closed. */
  const [reviewId, setReviewId] = useState<string | null>(null);
  // A school account files against its own assigned STACODE; the Super Admin
  // picks the school a new entry belongs to from the School Directory, since a
  // super-admin profile carries no assigned_stacode of its own.
  const schools = useSchoolDirectory(!scope.scoped);
  const [schoolCode, setSchoolCode] = useState('');
  const stamp = scope.scoped ? scope.assigned : schoolCode.trim();

  // Exactly the columns asked for: EMPNO, Account No., Last Name, First Name,
  // M.I., Position — minus Account No., plus STATUS, on the separated list.
  // The list's date, the station and the request state live in the expandable
  // row so the table stays to those columns.
  const columns: ListColumn[] = [
    { key: 'empno', label: 'EMPNO' },
    ...(config.hideAccountColumn ? [] : [{ key: 'account', label: 'Account No.' }]),
    { key: 'last_name', label: 'Last Name' },
    { key: 'first_name', label: 'First Name' },
    { key: 'mi', label: 'M.I.' },
    { key: 'position', label: 'Position' },
    ...(config.statusField
      ? [{ key: config.statusField.column, label: config.statusField.label }]
      : []),
  ];

  const entries = useMemo(
    () =>
      rows.map((r): { row: EmployeeEntryRow; status: string; cells: Record<string, string> } => ({
        row: r,
        status: (r.status ?? '').trim() || 'Pending',
        cells: {
          empno: (r.empno ?? '').trim() || '—',
          ...(config.hideAccountColumn ? {} : { account: (r.account ?? '').trim() || '—' }),
          last_name: (r.last_name ?? '').trim() || '—',
          first_name: (r.first_name ?? '').trim() || '—',
          mi: (r.mi ?? '').trim() || '—',
          position: (r.position ?? '').trim() || '—',
          ...(config.statusField
            ? { [config.statusField.column]: (r.separation_status ?? '').trim() || '—' }
            : {}),
        },
      })),
    [rows, config.hideAccountColumn, config.statusField],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => Object.values(e.cells).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [entries, search]);

  const pagination = usePagination(filtered, 10, search);

  // Employees already on the list being filed for: the school account's own
  // rows, or — for the Super Admin — only the chosen school's. An entry being
  // edited keeps its own school's list as the reference.
  const filingScope = editing ? (editing.stacode ?? '') : stamp;
  const existingEmpnos = useMemo(
    () =>
      new Set(
        rows
          .filter((r) => onFilingList(r.stacode, filingScope, scope.scoped))
          .map((r) => (r.empno ?? '').trim())
          .filter(Boolean),
      ),
    [rows, scope.scoped, filingScope],
  );

  const pageRows: ListRow[] = useMemo(
    () =>
      pagination.pagedItems.map(({ row, cells, status }) => {
        const pending = status.toLowerCase() === 'pending';
        // An entry may be changed by the account that filed it, and only while
        // it is still pending — the same rule the collection and
        // schoolEntryScopeGuard enforce server-side. That is the coordinator
        // for its school's entries and the Super Admin for one they filed.
        const mine = (row.requested_by ?? '') === profile.id;
        const canTouch = pending && mine;
        return {
          key: row.id,
          cells,
          canEdit: canTouch,
          canWithdraw: canTouch,
          // The decision is the Super Admin's, and only a still-pending entry is
          // open to it — a settled one is frozen for everyone (the collection's
          // update rule enforces the same line server-side).
          canReview: reviewer && pending,
          note: pending && reviewer
            ? mine
              ? 'Pending — approve or reject it; you filed this one, so you may also edit or withdraw it.'
              : 'Pending — approve or reject to settle this entry.'
            : entryNote(status, mine),
          detail: [
            { label: config.detailDateLabel, value: shortDate(row.hiredate ?? row.separation_date) },
            ...(config.statusField
              ? [
                  {
                    label: config.statusField.label,
                    value: (row.separation_status ?? '').trim() || '—',
                  },
                ]
              : []),
            { label: 'Station', value: (row.stacode ?? '').trim() || '—' },
            { label: 'Request status', value: status },
            { label: 'Added', value: shortDate(row.created) },
            { label: 'Approved by', value: (row.approved_by ?? '').trim() || '—' },
            { label: 'Approved at', value: shortDate(row.approved_at) },
            { label: 'Rejected by', value: (row.rejected_by ?? '').trim() || '—' },
            { label: 'Rejected at', value: shortDate(row.rejected_at) },
            { label: 'Rejection reason', value: (row.rejection_reason ?? '').trim() || '—' },
          ],
        };
      }),
    [pagination.pagedItems, profile.id, reviewer],
  );

  /** The row the review dialog is deciding on, or null. */
  const reviewRow = useMemo(
    () => rows.find((r) => r.id === reviewId) ?? null,
    [rows, reviewId],
  );

  /** Whether the signed-in account filed this row (an entry belongs to its requester). */
  function isMine(row: EmployeeEntryRow): boolean {
    return (row.requested_by ?? '') === profile.id;
  }

  /** Open an existing entry in the card. A closed or foreign row is never opened. */
  function openEdit(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if ((row.status ?? 'Pending').trim().toLowerCase() !== 'pending') {
      setSaveError('This entry is already approved and can no longer be changed here.');
      return;
    }
    if (!isMine(row)) {
      setSaveError('This entry was raised by another user, so only its requester or the Division can change it.');
      return;
    }
    setSaveError('');
    setShowAdd(false);
    setEditing(row);
  }

  /** Withdraw a still-pending entry — an approved or foreign one is frozen here. */
  async function withdraw(id: string) {
    const row = rows.find((r) => r.id === id);
    if (row && (row.status ?? 'Pending').trim().toLowerCase() !== 'pending') {
      setSaveError('This entry is already approved and can no longer be withdrawn.');
      return;
    }
    if (row && !isMine(row)) {
      setSaveError('This entry was raised by another user, so only its requester or the Division can withdraw it.');
      return;
    }
    setSaveError('');
    try {
      const { error: delErr } = await supabase.from(config.table).delete().eq('id', id);
      if (delErr) throw delErr;
      setEditing(null);
      refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not withdraw the entry.');
    }
  }

  function exportRows() {
    downloadCsv(
      columns.map((c) => c.label),
      filtered.map((e) => columns.map((c) => e.cells[c.key] ?? '')),
      config.csvName,
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{config.title}</h1>
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-deped-700 text-white flex items-center justify-center">
              {(() => { const Icon = config.icon; return <Icon className="w-5 h-5" />; })()}
            </span>
            {config.title}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 ml-13">{config.subtitle}</p>
          {!scope.scoped && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 ml-13">
              You are viewing every school's list — pick a school above to file a new entry for it.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-400">
            {filtered.length.toLocaleString()} on the list
          </span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            {scope.scoped ? `School STACODE ${scope.assigned}` : 'All Schools'}
          </span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            {scope.scoped ? 'Request only' : 'All schools — file entries'}
          </span>
        </div>
      </div>

      {scope.noSchool && (
        <Notice tone="warn">
          No school is assigned to your account yet, so there are no records to show. Ask your Division Office to set
          your Assigned STACODE.
        </Notice>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
      {saveError && <Notice tone="warn">{saveError}</Notice>}

      {!scope.noSchool && (
        <>
          <div className="enterprise-card p-4 sticky top-16 z-20 flex flex-wrap items-center justify-end gap-3">
            {/* Both accounts file: the coordinator's entry takes its own
                STACODE, the Super Admin's takes the school picked here. */}
            {!scope.scoped && (
              <div className="flex items-center gap-2 mr-auto">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  School
                </label>
                <select
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value)}
                  className={inputCls + ' max-w-64'}
                >
                  <option value="">— Choose school —</option>
                  {schools.map((s) => (
                    <option key={s.id} value={(s.stacode || s.school_code || '').trim()}>
                      {(s.stacode || s.school_code || '—').trim()} · {s.school_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => { setSaveError(''); setEditing(null); setShowAdd(true); }}
              disabled={!stamp}
              title={!stamp ? (scope.scoped
                ? 'No school is assigned to your account'
                : 'Choose the school this entry belongs to first') : undefined}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-deped-700 text-white text-sm font-medium hover:bg-deped-800 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Entry
            </button>
            <button
              onClick={exportRows}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          </div>

          <RowTable
            columns={columns}
            rows={pageRows}
            emptyMessage={search.trim() ? 'No matching records.' : config.emptyMessage}
            onEdit={openEdit}
            onWithdraw={(key) => void withdraw(key)}
            onReview={(key) => { setSaveError(''); setReviewId(key); }}
          />
          {filtered.length > 0 && <Pagination pagination={pagination} label={config.paginationLabel} />}
        </>
      )}

      {(showAdd || editing) && (
        <EmployeeEntryCard
          profile={profile}
          scope={{ assigned: scope.assigned, variants: scope.variants, scoped: scope.scoped }}
          stamp={stamp}
          config={config}
          entry={editing}
          existingEmpnos={existingEmpnos}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); refresh(); }}
        />
      )}

      {reviewRow && (
        <ReviewModal
          profile={profile}
          row={reviewRow}
          table={config.table}
          heading={`Review ${config.cardTitle}`}
          subtitle="Approve or reject this entry. The school that filed it sees the decision, and a settled entry is locked."
          details={entryReviewDetails(config, reviewRow)}
          footerNote="These lists are not linked to Employee Records, so the decision settles the entry only — nothing in the masterfile changes."
          onClose={() => setReviewId(null)}
          onReviewed={() => { setReviewId(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ── Exports: the coordinator's entry lists ──────────────────────────────────
// Same screen, different table and words. A new list is one config above, one
// migration and one export here — plus its nav entry and route.

export function NewlyHiredEmployees({ profile }: { profile: UserProfile }) {
  return <EmployeeEntryList profile={profile} config={NEWLY_HIRED_LIST} />;
}

export function SeparatedEmployees({ profile }: { profile: UserProfile }) {
  return <EmployeeEntryList profile={profile} config={SEPARATED_LIST} />;
}
