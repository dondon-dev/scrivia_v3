import { useEffect, useMemo, useState } from 'react';
import LoadingIndicator from '@/components/LoadingIndicator';
import { Search, School as SchoolIcon, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';
import { canWritePayrollData } from '@/lib/authz';
import { SHS_STACODES, assignedSchoolCodeOf } from '@/lib/assignedSchool';

interface RosterEmployee {
  id: string;
  empno: string;
  employee_number: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  empname: string;
  stacode: string;
  department: string;
  assigned_school_code: string | null;
}

interface RosterSchool {
  school_code: string;
  school_name: string;
  school_type: string;
  stacode: string;
  status: string;
}

const STATION_LABEL: Record<string, string> = {
  '700': 'SHS - TEACHING',
  '701': 'SHS - NON TEACHING',
};

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 transition-all';

function employeeDisplayName(e: Pick<RosterEmployee, 'last_name' | 'first_name' | 'middle_name' | 'empname'>): string {
  const last = (e.last_name || '').trim();
  const first = (e.first_name || '').trim();
  const middle = (e.middle_name || '').trim();
  if (last && first) return `${last}, ${first}${middle ? ` ${middle[0]}.` : ''}`;
  return (e.empname || '').trim() || `${last} ${first}`.trim() || '—';
}

export default function SHSAssignedSchoolsRoster() {
  const { profile } = useAuth();
  const { scopedDivisionIds, scopedCodes } = useOrg();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState<RosterEmployee[]>([]);
  const [schools, setSchools] = useState<RosterSchool[]>([]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState('');

  const canEdit = canWritePayrollData(profile?.role ?? 'read_only');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        let empQuery = supabase
          .from('employees')
          .select('id, empno, employee_number, last_name, first_name, middle_name, empname, stacode, department, assigned_school_code, division_id, regcode, divcode')
          .in('stacode', [...SHS_STACODES]);
        let schQuery = supabase
          .from('schools')
          .select('school_code, school_name, school_type, stacode, status');
        if (scopedCodes && scopedCodes.length > 0) {
          empQuery = empQuery.eq('regcode', scopedCodes[0].regcode).in('divcode', [...new Set(scopedCodes.map((c) => c.divcode))]);
        }
        if (scopedDivisionIds && scopedDivisionIds.length > 0) {
          schQuery = schQuery.in('division_id', scopedDivisionIds);
        }
        const [{ data: empData, error: empErr }, { data: schData, error: schErr }] = await Promise.all([
          empQuery,
          schQuery,
        ]);
        if (empErr) throw empErr;
        if (schErr) throw schErr;
        setEmployees((empData as RosterEmployee[]) ?? []);
        setSchools((schData as RosterSchool[]) ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load SHS roster.');
      } finally {
        setLoading(false);
      }
    })();
  }, [scopedDivisionIds, scopedCodes]);

  const schoolNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of schools) {
      if (s.school_code) m.set(s.school_code, s.school_name);
    }
    return m;
  }, [schools]);

  const schoolOptions = useMemo(() => {
    const set = new Map<string, RosterSchool>();
    for (const s of schools) {
      const prev = set.get(s.school_code);
      if (!prev) set.set(s.school_code, s);
    }
    return [...set.values()]
      .filter((s) => s.status === 'Active' || s.school_name)
      .sort((a, b) => (a.school_code < b.school_code ? -1 : a.school_code > b.school_code ? 1 : 0));
  }, [schools]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...employees].sort((a, b) => {
      if (a.stacode !== b.stacode) return a.stacode < b.stacode ? -1 : 1;
      const na = employeeDisplayName(a).toLowerCase();
      const nb = employeeDisplayName(b).toLowerCase();
      if (na !== nb) return na < nb ? -1 : 1;
      return String(a.empno).localeCompare(String(b.empno));
    });
    if (q) {
      rows = rows.filter((e) => {
        const name = employeeDisplayName(e).toLowerCase();
        const code = `${e.empno} ${e.employee_number} ${schoolNameByCode.get(assignedSchoolCodeOf(e) || '') ?? ''}`.toLowerCase();
        return name.includes(q) || code.includes(q);
      });
    }
    return rows;
  }, [employees, search, schoolNameByCode]);

  const assignedCount = useMemo(() => employees.filter((e) => assignedSchoolCodeOf(e)).length, [employees]);
  const unassignedCount = employees.length - assignedCount;

  async function handleChange(emp: RosterEmployee, next: string) {
    const prev = emp.assigned_school_code || '';
    setEmployees((rows) => rows.map((r) => (r.id === emp.id ? { ...r, assigned_school_code: next || null } : r)));
    setSavingIds((s) => new Set(s).add(emp.id));
    setSaveError('');
    const { error: err } = await supabase
      .from('employees')
      .update({ assigned_school_code: next || null })
      .eq('id', emp.id);
    setSavingIds((s) => {
      const n = new Set(s);
      n.delete(emp.id);
      return n;
    });
    if (err) {
      setEmployees((rows) => rows.map((r) => (r.id === emp.id ? { ...r, assigned_school_code: prev || null } : r)));
      setSaveError(`Failed to assign school for ${employeeDisplayName(emp)}.`);
      return;
    }
    setSavedIds((s) => {
      const n = new Set(s);
      n.delete(emp.id);
      n.add(emp.id);
      setTimeout(() => setSavedIds((cur) => {
        const c = new Set(cur);
        c.delete(emp.id);
        return c;
      }), 2000);
      return n;
    });
  }

  if (loading) {
    return (
      <div className="enterprise-card flex items-center justify-center py-16 text-slate-400">
        <LoadingIndicator size={32} />
        <span className="ml-3">Loading SHS roster...</span>
      </div>
    );
  }

  return (
    <div className="enterprise-card p-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-deped-600 to-deped-800 text-white flex items-center justify-center shrink-0">
            <SchoolIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">SHS Assigned Schools</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
              Choose the school each Senior High School employee reports to. The assigned school is used by the
              special / other payrolls (Comm Allowance and other modules); the regular monthly payroll keeps using
              the STACODE station (700 SHS - TEACHING / 701 SHS - NON TEACHING).
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="kpi-card !p-3">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular">{employees.length}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">SHS Employees</p>
          </div>
          <div className="kpi-card !p-3">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular">{assignedCount}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Assigned</p>
          </div>
          <div className="kpi-card !p-3">
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular">{unassignedCount}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Unassigned</p>
          </div>
        </div>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name or employee no."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls + ' pl-10'}
        />
      </div>

      {saveError && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 dark:bg-rose-900/20 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {saveError}
        </div>
      )}

      {error ? (
        <div className="py-10 text-center text-sm text-rose-600 dark:text-rose-400">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">
          No SHS employees{search ? ' matching your search' : ''} found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Station</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned School</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const current = assignedSchoolCodeOf(e);
                const saving = savingIds.has(e.id);
                return (
                  <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        {employeeDisplayName(e)}
                        {saving && <span className="text-[10px] text-slate-400 animate-pulse">saving…</span>}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">{(e.employee_number || e.empno || '—')}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="badge bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                        {e.stacode} · {STATION_LABEL[e.stacode] ?? 'SHS'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {canEdit ? (
                        <select
                          value={current}
                          onChange={(ev) => handleChange(e, ev.target.value)}
                          className={inputCls + ' min-w-[240px] max-w-sm'}
                        >
                          <option value="">Station ({e.stacode} · {STATION_LABEL[e.stacode] ?? 'SHS'})</option>
                          {schoolOptions.map((s) => (
                            <option key={s.school_code} value={s.school_code}>
                              {s.school_code} · {s.school_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-300">
                          {current ? `${current} · ${schoolNameByCode.get(current) ?? ''}` : `Station (${e.stacode})`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {savedIds.has(e.id) ? (
                        <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Saved
                        </span>
                      ) : (
                        <Users className="w-4 h-4 text-slate-300 inline" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}