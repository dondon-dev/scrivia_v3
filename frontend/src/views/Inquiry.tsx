import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Users, BadgeCheck, Briefcase, Wallet,
  Receipt, HeartHandshake, Printer, Download, RotateCcw, ChevronDown,
  ChevronRight, Cake, FileSearch, CircleDollarSign,
} from 'lucide-react';
import LoadingIndicator from '@/components/LoadingIndicator';
import { supabase, fetchAll } from '@/lib/pb';
import { useOrg, codeScope } from '@/lib/org';
import { downloadFile, generateCsv } from '@/lib/reports';
import type { Employee, PayrollDeduction } from '@/types/payroll';

// ── FoxPro Inquiry (PAYQMEN) parity ─────────────────────────────────────────
// Port of G:\Project\scriviacloudV2\FOXPRO\PAYQMEN.PRG and its eight options:
//   PAYQIND  (Employee Info w/ PAYQIND1 get-another + PAYQIND4 print)
//   PAYQAGES (Tally by Age/Sex)   PAYQSTAT (Tally by Status)
//   PAYQPOS1/2 (Tally by Position) PAYQBAS (Tally by Salary)
//   PAYQTAX  (Tally by Taxcodes)  PAYNETQ (Takehome Pay)
//   PAYQRET  (Retirables: PAYQRET1 forced 65, PAYQRET2 optional 60-64,
//             PAYQRET4 retirement dates of all employees)
// All eight live under this one screen (/inquiry) as tabs, scoped to the
// current Region/Division like every other Employee Management view.

type InquiryTab = 'info' | 'agesex' | 'status' | 'position' | 'salary' | 'tax' | 'takehome' | 'retire';

const TABS: { key: InquiryTab; label: string; legacy: string; icon: typeof Search }[] = [
  { key: 'info', label: 'Employee Info', legacy: 'PAYQIND', icon: FileSearch },
  { key: 'agesex', label: 'Tally by Age/Sex', legacy: 'PAYQAGES', icon: Users },
  { key: 'status', label: 'Tally by Status', legacy: 'PAYQSTAT', icon: BadgeCheck },
  { key: 'position', label: 'Tally by Position', legacy: 'PAYQPOS1', icon: Briefcase },
  { key: 'salary', label: 'Tally by Salary', legacy: 'PAYQBAS', icon: Wallet },
  { key: 'tax', label: 'Tally by Taxcodes', legacy: 'PAYQTAX', icon: Receipt },
  { key: 'takehome', label: 'Takehome Pay', legacy: 'PAYNETQ', icon: CircleDollarSign },
  { key: 'retire', label: 'Retirables', legacy: 'PAYQRET', icon: HeartHandshake },
];

// ── Field accessors (V3 keeps both legacy UPPERCASE-ish and new names) ──────
function empStr(e: Employee, ...keys: (keyof Employee)[]): string {
  for (const k of keys) {
    const v = e[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
function empNum(e: Employee, ...keys: (keyof Employee)[]): number {
  for (const k of keys) {
    const n = Number(e[k]);
    if (!Number.isNaN(n) && n !== 0) return n;
  }
  return 0;
}
const empnoOf = (e: Employee) => empStr(e, 'empno', 'employee_number');
const lnameOf = (e: Employee) => empStr(e, 'lname', 'last_name');
const fnameOf = (e: Employee) => empStr(e, 'fname', 'first_name');
const miOf = (e: Employee) => empStr(e, 'mi', 'middle_name');
const appelOf = (e: Employee) => empStr(e, 'appel');
const fullName = (e: Employee) =>
  `${lnameOf(e)}, ${fnameOf(e)}${miOf(e) ? ` ${miOf(e).charAt(0)}.` : ''}${appelOf(e) ? ` ${appelOf(e)}` : ''}`;
const basicOf = (e: Employee) => empNum(e, 'basic', 'basic_salary');

// FoxPro PAYQAGES: age = (date() - birthdate) / 365
function foxAge(birthdate: string | null | undefined, at = new Date()): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  return Math.floor((at.getTime() - b.getTime()) / (365 * 24 * 3600 * 1000));
}
function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(2)}%` : '—';
}
function money(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Print helper (PAYQIND4 / PAYQREL* / PAYNETPD paper output) ───────────────
function printHtml(title: string, bodyHtml: string) {
  const html = `<!doctype html><html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:24px}
    h1{font-size:16px;text-align:center;margin:0}h2{font-size:13px;text-align:center;margin:2px 0 12px;font-weight:normal}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #666;padding:3px 6px;text-align:left}
    th{background:#eee}.r{text-align:right}.c{text-align:center}
    .meta td{border:none;padding:1px 6px}
  </style></head><body>${bodyHtml}</body></html>`;
  try {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) throw new Error('popup blocked');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  } catch {
    downloadFile({ filename: `${title.replace(/\s+/g, '_')}.html`, content: new TextEncoder().encode(html), mimeType: 'text/html' });
  }
}
function csvDownload(filename: string, headers: string[], rows: (string | number)[][]) {
  downloadFile({ filename, content: generateCsv(headers, rows), mimeType: 'text/csv' });
}

// ── Shared distribution table (tallies) ─────────────────────────────────────
function DistTable({ rows, total, barColor = 'bg-blue-500' }: {
  rows: { label: string; count: number }[]; total: number; barColor?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500 border-b border-slate-200">
          <th className="text-left font-medium px-3 py-2">Bracket</th>
          <th className="text-right font-medium px-3 py-2">No. of Employees</th>
          <th className="text-right font-medium px-3 py-2">%</th>
          <th className="text-left font-medium px-3 py-2 w-1/3">Share</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={r.label} className="hover:bg-slate-50">
            <td className="px-3 py-2 font-medium text-slate-700">{r.label}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.count.toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{pct(r.count, total)}</td>
            <td className="px-3 py-2">
              <div className="h-2 rounded bg-slate-100 overflow-hidden">
                <div className={`h-full rounded ${barColor}`} style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </td>
          </tr>
        ))}
        <tr className="bg-slate-50 font-semibold">
          <td className="px-3 py-2">Total</td>
          <td className="px-3 py-2 text-right tabular-nums">{total.toLocaleString()}</td>
          <td className="px-3 py-2 text-right tabular-nums">100.00%</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}

// Legacy FoxPro employment-status codes (PAYQSTAT) + V3 word statuses.
const LEGACY_STATUS: Record<string, string> = {
  P: 'Permanent', S: 'Substitute', V: 'Provisional', T: 'Temporary', C: 'Casual',
};
function statusLabel(s: string): string {
  const t = (s || '').trim();
  if (LEGACY_STATUS[t.toUpperCase()]) return LEGACY_STATUS[t.toUpperCase()];
  if (!t) return '(No status)';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

interface School { id: string; school_code: string | null; stacode: string | null; school_name: string | null }
interface Position { position_code: string | null; position_title: string | null; position_name: string | null }

export default function Inquiry() {
  const { scopedCodes } = useOrg();
  const [tab, setTab] = useState<InquiryTab>('info');
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [deductions, setDeductions] = useState<PayrollDeduction[]>([]);
  const [dedNames, setDedNames] = useState<Map<string, string>>(new Map());
  const [divisionName, setDivisionName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const scope = codeScope(scopedCodes);
    let empQuery = supabase.from('employees').select('*').order('lname', { ascending: true });
    if (scope.regcode) empQuery = empQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
    const [emp, sch, pos, ded, codes, divs] = await Promise.all([
      fetchAll(() => empQuery),
      fetchAll(() => supabase.from('schools').select('id,school_code,stacode,school_name')),
      fetchAll(() => supabase.from('position_management').select('position_code,position_title,position_name')),
      fetchAll(() => supabase.from('payroll_deductions').select('*')),
      fetchAll(() => supabase.from('deduction_codes').select('dedcode,dedname')),
      scope.divcodes && scope.divcodes.length > 0
        ? fetchAll(() => supabase.from('divisions').select('division_code,division_name'))
        : Promise.resolve([]),
    ]);
    const emps = (emp as Employee[]) ?? [];
    setEmployees(emps);
    setSchools((sch as School[]) ?? []);
    setPositions((pos as Position[]) ?? []);
    setDeductions((ded as PayrollDeduction[]) ?? []);
    setDedNames(new Map(((codes as { dedcode: string; dedname: string }[]) ?? []).map((c) => [c.dedcode, c.dedname ?? c.dedcode])));
    const divList = (divs as { division_code: string; division_name: string }[]) ?? [];
    const firstDiv = emps.length > 0 ? empStr(emps[0], 'divcode') : '';
    setDivisionName(divList.find((d) => d.division_code === firstDiv)?.division_name ?? firstDiv);
    setLoading(false);
  }, [scopedCodes]);

  useEffect(() => { load(); }, [load]);

  const schoolNameOf = useCallback((stacode: string) => {
    const s = schools.find((x) => (x.stacode || x.school_code || '') === stacode);
    return s?.school_name ?? '';
  }, [schools]);

  const dedsByEmp = useMemo(() => {
    const m = new Map<string, PayrollDeduction[]>();
    for (const d of deductions) {
      const key = d.employee_id ?? '';
      if (!key) continue;
      const list = m.get(key) ?? [];
      list.push(d);
      m.set(key, list);
    }
    return m;
  }, [deductions]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><LoadingIndicator size={40} /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
          <FileSearch className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Inquiry</h1>
          <p className="text-sm text-slate-500">
            FoxPro Inquiry menu (PAYQMEN) — employee lookup, distribution tallies, takehome pay, retirables
            {divisionName ? ` · Division of ${divisionName}` : ''}
          </p>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap bg-slate-100 rounded-xl p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              title={`${t.label} (${t.legacy})`}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                active ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden md:inline">{t.label}</span>
              <span className={`font-mono text-[10px] px-1 rounded ${active ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-500'}`}>{t.legacy}</span>
            </button>
          );
        })}
      </div>

      {tab === 'info' && (
        <EmployeeInfo employees={employees} schoolNameOf={schoolNameOf} dedsByEmp={dedsByEmp} dedNames={dedNames} positions={positions} />
      )}
      {tab === 'agesex' && <AgeSexTally employees={employees} />}
      {tab === 'status' && <StatusTally employees={employees} divisionName={divisionName} />}
      {tab === 'position' && <PositionTally employees={employees} positions={positions} />}
      {tab === 'salary' && <SalaryTally employees={employees} divisionName={divisionName} />}
      {tab === 'tax' && <TaxTally employees={employees} divisionName={divisionName} />}
      {tab === 'takehome' && (
        <Takehome employees={employees} schools={schools} dedsByEmp={dedsByEmp} />
      )}
      {tab === 'retire' && (
        <Retirables employees={employees} schoolNameOf={schoolNameOf} positions={positions} />
      )}
    </div>
  );
}

// ── 1. Employee Info (PAYQIND + PAYQIND1 + PAYQIND4) ─────────────────────────
function EmployeeInfo({ employees, schoolNameOf, dedsByEmp, dedNames, positions }: {
  employees: Employee[]; schoolNameOf: (stacode: string) => string;
  dedsByEmp: Map<string, PayrollDeduction[]>; dedNames: Map<string, string>;
  positions: Position[];
}) {
  const [empno, setEmpno] = useState('');
  const [fn, setFn] = useState('');
  const [mi, setMi] = useState('');
  const [ln, setLn] = useState('');
  const [appel, setAppel] = useState('');
  const [found, setFound] = useState<Employee | null>(null);
  const [missed, setMissed] = useState(false);
  const [sub, setSub] = useState<'master' | 'deductions'>('master');

  const search = useCallback(() => {
    const no = empno.trim().toUpperCase();
    setMissed(false);
    setFound(null);
    if (no) {
      // MFINDX2: seek by employee number first (PAYQIND1).
      const hit = employees.find((e) => empnoOf(e).toUpperCase() === no);
      if (hit) { setFound(hit); setSub('master'); return; }
    }
    // MFINDX1: Lname+Appel+Fname.
    const key = (ln.trim() + appel.trim() + fn.trim()).toUpperCase();
    if (key) {
      const hit = employees.find(
        (e) => (lnameOf(e) + appelOf(e) + fnameOf(e)).toUpperCase() === key,
      );
      if (hit) {
        setFound(hit);
        setEmpno(empnoOf(hit));
        setSub('master');
        return;
      }
    }
    setMissed(true);
  }, [employees, empno, fn, mi, ln, appel]);

  const reset = () => {
    setEmpno(''); setFn(''); setMi(''); setLn(''); setAppel('');
    setFound(null); setMissed(false); setSub('master');
  };

  // Deduction records sorted FoxPro order: P,EFFYY,EFFMM,YY,MM,DD,HR,MIN,SEC,DEDCODE,POLICYNO (PAYQIND4).
  const empDeds = useMemo(() => {
    if (!found) return [];
    const list = [...(dedsByEmp.get(found.id) ?? [])];
    const s = (d: PayrollDeduction, k: keyof PayrollDeduction) => String(d[k] ?? '');
    list.sort((a, b) =>
      (s(a, 'status').localeCompare(s(b, 'status')) ||
        Number(a.effyy || 0) - Number(b.effyy || 0) ||
        Number(a.effmm || 0) - Number(b.effmm || 0) ||
        a.dedcode.localeCompare(b.dedcode) ||
        a.policyno.localeCompare(b.policyno)),
    );
    return list;
  }, [found, dedsByEmp]);

  const gross = found ? basicOf(found) + empNum(found, 'trans') + empNum(found, 'pera') + empNum(found, 'aca') : 0;
  const mandTotal = found
    ? empNum(found, 'dedlnr') + empNum(found, 'dedmed') + empNum(found, 'dedpag') + empNum(found, 'dedtax')
    : 0;
  const otherTotal = empDeds.reduce((s, d) => s + Number(d.dedamt || 0), 0);
  const totalDed = mandTotal + otherTotal;

  const printAbstract = () => {
    if (!found) return;
    const posTitle = positions.find((p) => p.position_code === empStr(found, 'poscode', 'position'))?.position_title ?? '';
    const dedRows = empDeds.map((d) => `<tr><td>${d.dedcode}</td><td>${dedNames.get(d.dedcode) ?? ''}${d.policyno ? `-${d.policyno}` : ''}</td><td class="c">${d.effmm || '--'}/${d.effyy || '----'}</td><td class="c">${d.termm || '--'}/${d.teryy || '----'}</td><td class="r">${money(Number(d.dedamt || 0))}</td></tr>`).join('');
    printHtml(`Abstract_of_Deductions_${empnoOf(found)}`, `
      <h1>DEPARTMENT OF EDUCATION</h1><h2>ABSTRACT OF DEDUCTIONS</h2>
      <table class="meta">
        <tr><td><b>Name:</b> ${fullName(found)}</td><td><b>Reg:</b> ${empStr(found, 'regcode')}</td></tr>
        <tr><td><b>Employee No.:</b> ${empnoOf(found)}</td><td><b>Div:</b> ${empStr(found, 'divcode')}</td></tr>
        <tr><td><b>Position:</b> ${posTitle}</td><td><b>Sta:</b> ${empStr(found, 'stacode')} ${schoolNameOf(empStr(found, 'stacode'))}</td></tr>
        <tr><td><b>Basic Salary:</b> ${money(basicOf(found) + empNum(found, 'trans'))}</td><td><b>PERA + Addl:</b> ${money(empNum(found, 'pera') + empNum(found, 'aca'))}</td></tr>
        <tr><td><b>Gross Compensation:</b> ${money(gross)}</td><td><b>Tax Code:</b> ${empStr(found, 'taxcode')}</td></tr>
      </table>
      <table><thead><tr><th>Code</th><th>Description</th><th>Effectivity</th><th>Termination</th><th>Amount</th></tr></thead><tbody>
        <tr><td>0003</td><td>GSIS Life &amp; Ret</td><td class="c">--/----</td><td class="c">--/----</td><td class="r">${money(empNum(found, 'dedlnr'))}</td></tr>
        <tr><td>0111</td><td>PHIC Medicare</td><td class="c">--/----</td><td class="c">--/----</td><td class="r">${money(empNum(found, 'dedmed'))}</td></tr>
        <tr><td>0222</td><td>PAGIBIG</td><td class="c">--/----</td><td class="c">--/----</td><td class="r">${money(empNum(found, 'dedpag'))}</td></tr>
        <tr><td>0036</td><td>Withholding Tax</td><td class="c">--/----</td><td class="c">--/----</td><td class="r">${money(empNum(found, 'dedtax'))}</td></tr>
        ${dedRows}
        <tr><td colspan="4"><b>Total Deductions</b></td><td class="r"><b>${money(totalDed)}</b></td></tr>
        <tr><td colspan="4"><b>Net Pay</b></td><td class="r"><b>${money(gross - totalDed)}</b></td></tr>
      </tbody></table>`);
  };

  const inputCls = 'px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 mb-1">Enter Employee Number or Name <span className="font-mono text-[10px] text-slate-400 ml-1">PAYQIND1</span></p>
        <p className="text-xs text-slate-400 mb-3">Number is tried first (MFINDX2); otherwise Last + Appellation + First (MFINDX1).</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <input value={empno} onChange={(e) => setEmpno(e.target.value)} placeholder="Employee #" className={inputCls} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <input value={fn} onChange={(e) => setFn(e.target.value)} placeholder="First name" className={inputCls} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <input value={mi} onChange={(e) => setMi(e.target.value)} placeholder="Middle name" className={inputCls} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <input value={ln} onChange={(e) => setLn(e.target.value)} placeholder="Last name" className={inputCls} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <input value={appel} onChange={(e) => setAppel(e.target.value)} placeholder="Appel." className={inputCls} onKeyDown={(e) => e.key === 'Enter' && search()} />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={search} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900">
            <Search className="w-4 h-4" /> Search
          </button>
          {found && (
            <button onClick={reset} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <RotateCcw className="w-4 h-4" /> Get another
            </button>
          )}
        </div>
        {missed && !found && (
          <p className="mt-3 text-sm font-medium text-rose-600">NO RECORD FOUND</p>
        )}
      </div>

      {found && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setSub('master')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${sub === 'master' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Master record</button>
              <button onClick={() => setSub('deductions')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${sub === 'deductions' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Deduction records ({empDeds.length})</button>
            </div>
            <div className="flex gap-2">
              <button onClick={printAbstract} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-900">
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
              <button
                onClick={() => csvDownload(`Abstract_${empnoOf(found)}.csv`,
                  ['Code', 'Description', 'Effectivity', 'Termination', 'Amount'],
                  empDeds.map((d) => [d.dedcode, `${dedNames.get(d.dedcode) ?? ''}${d.policyno ? `-${d.policyno}` : ''}`, `${d.effmm || ''}/${d.effyy || ''}`, `${d.termm || ''}/${d.teryy || ''}`, Number(d.dedamt || 0)]))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {sub === 'master' ? (
            <MasterCard e={found} schoolNameOf={schoolNameOf} positions={positions} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <th className="text-left font-medium px-3 py-2">Code</th>
                    <th className="text-left font-medium px-3 py-2">Description</th>
                    <th className="text-center font-medium px-3 py-2">Effectivity</th>
                    <th className="text-center font-medium px-3 py-2">Termination</th>
                    <th className="text-right font-medium px-3 py-2">Amount</th>
                    <th className="text-left font-medium px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {empDeds.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No deduction records for this employee.</td></tr>
                  )}
                  {empDeds.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-mono font-medium">{d.dedcode}</td>
                      <td className="px-3 py-1.5">{dedNames.get(d.dedcode) ?? ''}{d.policyno ? ` — ${d.policyno}` : ''}</td>
                      <td className="px-3 py-1.5 text-center tabular-nums">{d.effmm || '--'}/{d.effyy || '----'}</td>
                      <td className="px-3 py-1.5 text-center tabular-nums">{d.termm || '--'}/{d.teryy || '----'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(Number(d.dedamt || 0))}</td>
                      <td className="px-3 py-1.5">{d.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MasterCard({ e, schoolNameOf, positions }: {
  e: Employee; schoolNameOf: (stacode: string) => string; positions: Position[];
}) {
  const stacode = empStr(e, 'stacode');
  const posTitle = positions.find((p) => p.position_code === empStr(e, 'poscode', 'position'))?.position_title ?? '';
  const rows: [string, string][] = [
    ['Employee No.', empnoOf(e)],
    ['Name', fullName(e)],
    ['Region / Division / Station', `${empStr(e, 'regcode')} / ${empStr(e, 'divcode')} / ${stacode} ${schoolNameOf(stacode)}`],
    ['Position', `${empStr(e, 'poscode', 'position')}${posTitle ? ` — ${posTitle}` : ''}`],
    ['Grade / Step', `${empStr(e, 'grade')} / ${empStr(e, 'step')}`],
    ['Basic Salary', money(basicOf(e) + empNum(e, 'trans'))],
    ['PERA + ACA', money(empNum(e, 'pera') + empNum(e, 'aca'))],
    ['Gross (Basic+Trans+PERA+ACA)', money(basicOf(e) + empNum(e, 'trans') + empNum(e, 'pera') + empNum(e, 'aca'))],
    ['GSIS / PHIC / PAGIBIG', `${money(empNum(e, 'dedlnr'))} / ${money(empNum(e, 'dedmed'))} / ${money(empNum(e, 'dedpag'))}`],
    ['Withholding Tax', money(empNum(e, 'dedtax'))],
    ['Net Pay (masterfile)', money(empNum(e, 'netpay'))],
    ['Tax Code', empStr(e, 'taxcode')],
    ['Sex / Civil Status', `${empStr(e, 'sex')} / ${empStr(e, 'civilstat')}`],
    ['Birthdate', empStr(e, 'birthdate')],
    ['Employment Status', statusLabel(empStr(e, 'status'))],
    ['TIN / GSIS / HDMF / PHIC', [empStr(e, 'tin'), empStr(e, 'gsis_id', 'gsis_pn'), empStr(e, 'hdmf_id'), empStr(e, 'phic_id')].filter(Boolean).join(' / ')],
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100">
      {rows.map(([k, v]) => (
        <div key={k} className="bg-white px-4 py-2.5 flex justify-between gap-3">
          <span className="text-xs text-slate-400">{k}</span>
          <span className="text-sm font-medium text-slate-700 text-right">{v || '—'}</span>
        </div>
      ))}
    </div>
  );
}

// ── 2. Tally by Age/Sex (PAYQAGES) ──────────────────────────────────────────
function AgeSexTally({ employees }: { employees: Employee[] }) {
  const now = useMemo(() => new Date(), []);
  const groups = useMemo(() => {
    const brackets = [
      { label: '60 - Above', test: (a: number | null) => a !== null && a > 59 },
      { label: '50 - 59', test: (a: number | null) => a !== null && a > 49 && a < 60 },
      { label: '40 - 49', test: (a: number | null) => a !== null && a > 39 && a < 50 },
      { label: '30 - 39', test: (a: number | null) => a !== null && a > 29 && a < 40 },
      { label: '20 - 29', test: (a: number | null) => a !== null && a > 19 && a < 30 },
      // FoxPro falls through to ctr6 for age < 20, including blank birthdates
      // (row label in the program is 'No Birthdate').
      { label: '19 & below / No birthdate', test: (a: number | null) => a === null || a < 20 },
    ];
    const ages = employees.map((e) => foxAge(empStr(e, 'birthdate'), now));
    const ageRows = brackets.map((b) => ({ label: b.label, count: ages.filter((a) => b.test(a)).length }));
    const males = employees.filter((e) => empStr(e, 'sex').toUpperCase() === 'M').length;
    const singles = employees.filter((e) => empStr(e, 'civilstat').toUpperCase() === 'S').length;
    const married = employees.filter((e) => empStr(e, 'civilstat').toUpperCase() === 'M').length;
    return { ageRows, males, females: employees.length - males, singles, married, others: employees.length - singles - married };
  }, [employees, now]);

  const download = () => csvDownload('Tally_Age_Sex.csv', ['Group', 'Count', '%'],
    [
      ...groups.ageRows.map((r) => [r.label, r.count, pct(r.count, employees.length)] as (string | number)[]),
      ['Male', groups.males, pct(groups.males, employees.length)],
      ['Female', groups.females, pct(groups.females, employees.length)],
      ['Single', groups.singles, pct(groups.singles, employees.length)],
      ['Married', groups.married, pct(groups.married, employees.length)],
      ['Others', groups.others, pct(groups.others, employees.length)],
    ]);

  return (
    <TallyShell title="Distribution of Employees by Age / Sex / Civil Status" onCsv={download}>
      <SectionTitle icon={Cake} text="Age Bracket" />
      <DistTable rows={groups.ageRows} total={employees.length} />
      <SectionTitle icon={Users} text="Sex" />
      <DistTable
        rows={[{ label: 'Male', count: groups.males }, { label: 'Female', count: groups.females }]}
        total={employees.length} barColor="bg-emerald-500"
      />
      <SectionTitle icon={Users} text="Civil Status" />
      <DistTable
        rows={[
          { label: 'Single', count: groups.singles },
          { label: 'Married', count: groups.married },
          { label: 'Others', count: groups.others },
        ]}
        total={employees.length} barColor="bg-amber-500"
      />
    </TallyShell>
  );
}

// ── 3. Tally by Status (PAYQSTAT) ───────────────────────────────────────────
function StatusTally({ employees, divisionName }: { employees: Employee[]; divisionName: string }) {
  const rows = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of employees) {
      const label = statusLabel(empStr(e, 'status'));
      m.set(label, (m.get(label) ?? 0) + 1);
    }
    // FoxPro order first, then any other statuses present in the data.
    const order = ['Permanent', 'Substitute', 'Provisional', 'Temporary', 'Casual'];
    return [
      ...order.filter((o) => m.has(o)).map((o) => ({ label: o, count: m.get(o)! })),
      ...[...m.entries()].filter(([k]) => !order.includes(k)).map(([label, count]) => ({ label, count })),
    ];
  }, [employees]);

  return (
    <TallyShell
      title={`Distribution by Status${divisionName ? ` — Division of ${divisionName}` : ''}`}
      onCsv={() => csvDownload('Tally_Status.csv', ['Status', 'Count', '%'], rows.map((r) => [r.label, r.count, pct(r.count, employees.length)]))}
    >
      <DistTable rows={rows} total={employees.length} barColor="bg-violet-500" />
    </TallyShell>
  );
}

// ── 4. Tally by Position (PAYQPOS1 summarize + PAYQPOS2 list) ───────────────
function PositionTally({ employees, positions }: { employees: Employee[]; positions: Position[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const titleOf = useCallback((code: string) => {
    const p = positions.find((x) => x.position_code === code);
    return p ? (p.position_title || p.position_name || '') : '';
  }, [positions]);

  const rows = useMemo(() => {
    const m = new Map<string, Employee[]>();
    for (const e of employees) {
      const code = empStr(e, 'poscode', 'position') || '(No position)';
      const list = m.get(code) ?? [];
      list.push(e);
      m.set(code, list);
    }
    return [...m.entries()]
      .map(([code, list]) => ({ code, title: titleOf(code), count: list.length, list }))
      .sort((a, b) => b.count - a.count);
  }, [employees, titleOf]);

  return (
    <TallyShell
      title="Distribution by Position"
      onCsv={() => csvDownload('Tally_Position.csv', ['Poscode', 'Title', 'Count', '%'],
        rows.map((r) => [r.code, r.title, r.count, pct(r.count, employees.length)]))}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="w-8" />
              <th className="text-left font-medium px-3 py-2">Poscode</th>
              <th className="text-left font-medium px-3 py-2">Position Title</th>
              <th className="text-right font-medium px-3 py-2">Employees</th>
              <th className="text-right font-medium px-3 py-2">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <>
                <tr key={r.code} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(open === r.code ? null : r.code)}>
                  <td className="px-2 py-2 text-slate-400">
                    {open === r.code ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </td>
                  <td className="px-3 py-2 font-mono font-medium">{r.code}</td>
                  <td className="px-3 py-2 text-slate-600">{r.title || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.count.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{pct(r.count, employees.length)}</td>
                </tr>
                {open === r.code && (
                  <tr key={`${r.code}-list`}>
                    <td />
                    <td colSpan={4} className="px-3 py-2 bg-slate-50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 text-xs">
                        {r.list.map((e) => (
                          <div key={e.id} className="px-2 py-1 bg-white rounded border border-slate-200 truncate">
                            <span className="font-mono text-slate-500">{empnoOf(e)}</span> {fullName(e)}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td /><td colSpan={2} className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{employees.length.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">100.00%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </TallyShell>
  );
}

// ── 5. Tally by Salary (PAYQBAS basic brackets) ─────────────────────────────
function SalaryTally({ employees, divisionName }: { employees: Employee[]; divisionName: string }) {
  const rows = useMemo(() => {
    const defs = [
      { label: '14,000 - up', test: (b: number) => b > 13999 },
      { label: '12,000 - 13,999', test: (b: number) => b > 11999 },
      { label: '10,000 - 11,999', test: (b: number) => b > 9999 },
      { label: '8,000 - 9,999', test: (b: number) => b > 7999 },
      { label: '6,000 - 7,999', test: (b: number) => b > 5999 },
      { label: 'Below 6,000', test: (b: number) => b < 6000 },
    ];
    return defs.map((d) => ({ label: d.label, count: employees.filter((e) => d.test(basicOf(e))).length }));
  }, [employees]);

  return (
    <TallyShell
      title={`Distribution by Basic Salary${divisionName ? ` — Division of ${divisionName}` : ''}`}
      onCsv={() => csvDownload('Tally_Salary.csv', ['Salary', 'Count', '%'], rows.map((r) => [r.label, r.count, pct(r.count, employees.length)]))}
    >
      <DistTable rows={rows} total={employees.length} barColor="bg-teal-500" />
    </TallyShell>
  );
}

// ── 6. Tally by Taxcodes (PAYQTAX: fixed 01-11 + 00 rows) ───────────────────
const TAX_ORDER = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '00'];
function TaxTally({ employees, divisionName }: { employees: Employee[]; divisionName: string }) {
  const rows = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of employees) {
      const code = empStr(e, 'taxcode').toUpperCase().padStart(2, '0') || '(None)';
      m.set(code, (m.get(code) ?? 0) + 1);
    }
    const fixed = TAX_ORDER.map((code) => ({ label: code, count: m.get(code) ?? 0 }));
    const extra = [...m.entries()]
      .filter(([k]) => !TAX_ORDER.includes(k))
      .map(([label, count]) => ({ label, count }));
    return [...fixed, ...extra];
  }, [employees]);

  return (
    <TallyShell
      title={`Distribution by Tax Code${divisionName ? ` — Division of ${divisionName}` : ''}`}
      note="V3 keeps no TAXTABLE description masterfile, so rows show the code itself (FoxPro read TAXDESC from TAXTABLE)."
      onCsv={() => csvDownload('Tally_Taxcodes.csv', ['Taxcode', 'Count', '%'], rows.map((r) => [r.label, r.count, pct(r.count, employees.length)]))}
    >
      <DistTable rows={rows} total={employees.length} barColor="bg-rose-500" />
    </TallyShell>
  );
}

// ── 7. Takehome Pay (PAYNETQ: station scope → compute → view/print/CSV) ─────
function Takehome({ employees, schools, dedsByEmp }: {
  employees: Employee[]; schools: School[]; dedsByEmp: Map<string, PayrollDeduction[]>;
}) {
  const [station, setStation] = useState('ALL');
  const scopedSchools = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of schools) {
      const code = s.stacode || s.school_code || '';
      if (code && !seen.has(code)) seen.set(code, s.school_name ?? '');
    }
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [schools]);

  const rows = useMemo(() => {
    const list = station === 'ALL' ? employees : employees.filter((e) => empStr(e, 'stacode') === station);
    return list.map((e) => {
      const gross = basicOf(e) + empNum(e, 'trans') + empNum(e, 'pera') + empNum(e, 'aca');
      const mand = empNum(e, 'dedlnr') + empNum(e, 'dedmed') + empNum(e, 'dedpag') + empNum(e, 'dedtax');
      const other = (dedsByEmp.get(e.id) ?? [])
        .filter((d) => d.status === 'Active')
        .reduce((s, d) => s + Number(d.dedamt || 0), 0);
      return { e, gross, totalDed: mand + other, net: gross - mand - other };
    }).sort((a, b) => empnoOf(a.e).localeCompare(empnoOf(b.e)));
  }, [employees, station, dedsByEmp]);

  const totals = useMemo(() => ({
    gross: rows.reduce((s, r) => s + r.gross, 0),
    ded: rows.reduce((s, r) => s + r.totalDed, 0),
    net: rows.reduce((s, r) => s + r.net, 0),
  }), [rows]);

  const stationLabel = station === 'ALL' ? 'All stations' : `${station} — ${scopedSchools.find((s) => s[0] === station)?.[1] ?? ''}`;

  const printAll = () => printHtml(`Takehome_${station}`, `
    <h1>DEPARTMENT OF EDUCATION</h1><h2>Takehome Pay — ${stationLabel}</h2>
    <table><thead><tr><th>Emp No.</th><th>Name</th><th>Station</th><th>Gross</th><th>Deductions</th><th>Net Pay</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${empnoOf(r.e)}</td><td>${fullName(r.e)}</td><td class="c">${empStr(r.e, 'stacode')}</td><td class="r">${money(r.gross)}</td><td class="r">${money(r.totalDed)}</td><td class="r">${money(r.net)}</td></tr>`).join('')}
    <tr><td colspan="3"><b>Total (${rows.length})</b></td><td class="r"><b>${money(totals.gross)}</b></td><td class="r"><b>${money(totals.ded)}</b></td><td class="r"><b>${money(totals.net)}</b></td></tr>
    </tbody></table>`);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-wrap">
        <label className="text-xs text-slate-500">Station:</label>
        <select value={station} onChange={(e) => setStation(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">
          <option value="ALL">ALL — all stations</option>
          {scopedSchools.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
        </select>
        <span className="ml-auto flex gap-2">
          <button onClick={printAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-900">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={() => csvDownload(`Takehome_${station}.csv`,
              ['EmpNo', 'Name', 'Station', 'Gross', 'Deductions', 'Net'],
              rows.map((r) => [empnoOf(r.e), fullName(r.e), empStr(r.e, 'stacode'), r.gross, r.totalDed, r.net]))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </span>
      </div>
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0">
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <th className="text-left font-medium px-3 py-2">Emp No.</th>
              <th className="text-left font-medium px-3 py-2">Name</th>
              <th className="text-center font-medium px-3 py-2">Sta</th>
              <th className="text-right font-medium px-3 py-2">Gross</th>
              <th className="text-right font-medium px-3 py-2">Deductions</th>
              <th className="text-right font-medium px-3 py-2">Net Pay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <tr key={r.e.id} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 font-mono">{empnoOf(r.e)}</td>
                <td className="px-3 py-1.5">{fullName(r.e)}</td>
                <td className="px-3 py-1.5 text-center">{empStr(r.e, 'stacode')}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.gross)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.totalDed)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{money(r.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
              <td colSpan={3} className="px-3 py-2">Total ({rows.length})</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(totals.gross)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(totals.ded)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(totals.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── 8. Retirables (PAYQRET: RET1 forced 65, RET2 optional 60-64, RET4 dates) ─
type RetMode = 'forced' | 'optional' | 'dates';
type RetSort = 'date' | 'name' | 'position';

interface RetRow {
  e: Employee; age: number; retYear: number; retDate: string; dateKey: string;
}

function Retirables({ employees, schoolNameOf, positions }: {
  employees: Employee[]; schoolNameOf: (stacode: string) => string; positions: Position[];
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<RetMode>('forced');
  const [sort, setSort] = useState<RetSort>('date');

  const rows = useMemo(() => {
    const out: RetRow[] = [];
    for (const e of employees) {
      const bstr = empStr(e, 'birthdate');
      if (!bstr) continue;
      const b = new Date(bstr);
      if (Number.isNaN(b.getTime())) continue;
      const age = year - b.getFullYear(); // FoxPro: age = ret_yr - birth year
      if (mode === 'forced' && age !== 65) continue;
      if (mode === 'optional' && !(age > 59 && age < 65)) continue;
      const mm = String(b.getMonth() + 1).padStart(2, '0');
      const dd = String(b.getDate()).padStart(2, '0');
      const retYear = b.getFullYear() + 65;
      // FoxPro RET4: retdate = MM/DD/birthyear, datex = retdate + 1 day.
      const retDate = mode === 'dates' ? `${mm}/${dd}/${retYear}` : `${mm}/${dd}/${year}`;
      const key = mode === 'dates' ? `${retYear}${mm}${dd}` : `${year}${mm}${dd}`;
      out.push({ e, age, retYear, retDate, dateKey: key });
    }
    const byName = (a: RetRow, b: RetRow) => fullName(a.e).localeCompare(fullName(b.e));
    const byPos = (a: RetRow, b: RetRow) =>
      empStr(a.e, 'poscode', 'position').localeCompare(empStr(b.e, 'poscode', 'position')) || byName(a, b);
    out.sort(sort === 'date' ? (a, b) => a.dateKey.localeCompare(b.dateKey) || byName(a, b) : sort === 'name' ? byName : byPos);
    return out;
  }, [employees, year, mode, sort]);

  const modeLabel = mode === 'forced' ? `Forced Retirement (Age 65 in ${year})` : mode === 'optional' ? `Optional Retirement (Age 60-64 in ${year})` : 'Retirement Dates of Employees (65th birthday)';

  const printAll = () => {
    const titleOf = (code: string) => positions.find((p) => p.position_code === code)?.position_title ?? '';
    printHtml(`Retirables_${mode}_${year}`, `
      <h1>DEPARTMENT OF EDUCATION</h1><h2>${modeLabel} — ${rows.length} employee(s)</h2>
      <table><thead><tr><th>Emp No.</th><th>Name</th><th>Birthdate</th><th>Age</th><th>Station</th><th>Position</th><th>Retirement Date</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${empnoOf(r.e)}</td><td>${fullName(r.e)}</td><td class="c">${empStr(r.e, 'birthdate')}</td><td class="c">${r.age}</td><td>${empStr(r.e, 'stacode')} ${schoolNameOf(empStr(r.e, 'stacode'))}</td><td>${titleOf(empStr(r.e, 'poscode', 'position'))}</td><td class="c">${r.retDate}</td></tr>`).join('')}
      </tbody></table>`);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {([['forced', 'Forced Ret (65)'], ['optional', 'Optional (60-64)'], ['dates', 'Ret Dates']] as [RetMode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${mode === m ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        {mode !== 'dates' && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            Year:
            <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())} className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
          </label>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          Sort:
          <select value={sort} onChange={(e) => setSort(e.target.value as RetSort)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm">
            <option value="date">by Date</option>
            <option value="name">by Name</option>
            <option value="position">by Position</option>
          </select>
        </label>
        <span className="ml-auto flex gap-2">
          <button onClick={printAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-900">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={() => csvDownload(`Retirables_${mode}_${year}.csv`,
              ['EmpNo', 'Name', 'Birthdate', 'Age', 'Station', 'RetirementDate'],
              rows.map((r) => [empnoOf(r.e), fullName(r.e), empStr(r.e, 'birthdate'), r.age, empStr(r.e, 'stacode'), r.retDate]))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </span>
      </div>
      <div className="px-5 py-2 text-xs text-slate-500 border-b border-slate-100">{modeLabel} — {rows.length} employee(s)</div>
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0">
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <th className="text-left font-medium px-3 py-2">Emp No.</th>
              <th className="text-left font-medium px-3 py-2">Name</th>
              <th className="text-center font-medium px-3 py-2">Birthdate</th>
              <th className="text-center font-medium px-3 py-2">Age</th>
              <th className="text-left font-medium px-3 py-2">Station</th>
              <th className="text-center font-medium px-3 py-2">Retirement Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No employees match this retirement window.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.e.id} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 font-mono">{empnoOf(r.e)}</td>
                <td className="px-3 py-1.5">{fullName(r.e)}</td>
                <td className="px-3 py-1.5 text-center tabular-nums">{empStr(r.e, 'birthdate')}</td>
                <td className="px-3 py-1.5 text-center tabular-nums font-semibold">{r.age}</td>
                <td className="px-3 py-1.5">{empStr(r.e, 'stacode')} {schoolNameOf(empStr(r.e, 'stacode'))}</td>
                <td className="px-3 py-1.5 text-center tabular-nums">{r.retDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Small shared shells ─────────────────────────────────────────────────────
function TallyShell({ title, note, onCsv, children }: {
  title: string; note?: string; onCsv: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div>
          <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
          {note && <p className="text-[11px] text-slate-400 mt-0.5">{note}</p>}
        </div>
        <button onClick={onCsv} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>
      <div className="p-4 space-y-6">{children}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, text }: { icon: typeof Search; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-slate-500" />
      <h3 className="text-sm font-semibold text-slate-700">{text}</h3>
    </div>
  );
}
