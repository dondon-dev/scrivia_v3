import { useState, useMemo, useCallback } from 'react';
import {
  X, FileDown, Download, CheckCircle, AlertTriangle,
  School, Building2, Archive, ShieldCheck, FileSpreadsheet, Table2,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  generateMasterfileDbf, generateDedfileDbf, generatePyentDbf,
  generatePayrollsDbf, computeTakeHome, downloadFile,
  type PayrollsDbfRecord,
} from '@/lib/reports';
import { fetchAll, formatError } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useOrg, codeScope } from '@/lib/org';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import type { Employee, PayrollEntry, PayPeriod, PayrollDeduction } from '@/types/payroll';

type Category = 'elementary' | 'highschool';

interface ClassifiedFile {
  name: string;
  content: Uint8Array;
  recordCount: number;
}

const STACODE_RANGES: Record<Category, { min: number; max: number; label: string; suffix: string }> = {
  elementary: { min: 1, max: 499, label: 'Elementary Schools', suffix: 'ELEMENTARY' },
  highschool: { min: 500, max: 701, label: 'High School (Jr + Sr High)', suffix: 'HIGHSCHOOL' },
};

function stacodeToNum(stacode: string | undefined | null): number | null {
  if (!stacode || !stacode.trim()) return null;
  const code = stacode.trim();
  if (!/^\d+$/.test(code)) return null;
  const n = parseInt(code, 10);
  return isNaN(n) ? null : n;
}

function inRange(stacode: string | undefined | null, cat: Category): boolean {
  const n = stacodeToNum(stacode);
  if (n === null) return false;
  const r = STACODE_RANGES[cat];
  return n >= r.min && n <= r.max;
}

function padStr(v: string, len: number): string {
  return String(v ?? '').slice(0, len);
}
function padNum(v: number, max: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(Number(v) || 0, max);
}

function entryToPayrollsRecord(entry: PayrollEntry, emp: Employee | undefined, period: PayPeriod | undefined): PayrollsDbfRecord {
  const basic = Number(emp?.basic ?? emp?.basic_salary ?? 0);
  const trans = Number(emp?.trans ?? 0);
  const ontop = Number(emp?.ontop ?? 0);
  const longVal = Number(emp?.long ?? 0);
  const rata = Number(emp?.rata ?? 0);
  const pera = Number(emp?.pera ?? 0);
  const aca = Number(emp?.aca ?? 0);
  const dedlnr = Number(entry.dedlnr ?? 0);
  const dedmed = Number(entry.dedmed ?? 0);
  const dedpag = Number(entry.dedpag ?? 0);
  const dedtax = Number(entry.dedtax ?? 0);
  const otherded = Number(entry.actual_loan_deductions ?? entry.other_deductions ?? 0);

  const takehome = computeTakeHome({
    BASIC: basic, TRANS: trans, ONTOP: ontop, LONG: longVal, RATA: rata, PERA: pera, ACA: aca,
    DEDLNR: dedlnr, DEDMED: dedmed, DEDPAG: dedpag, DEDTAX: dedtax, OTHERDED: otherded,
  });

  const endDate = period?.end_date ? new Date(period.end_date) : new Date();
  const payDate = period?.pay_date ? new Date(period.pay_date) : new Date();
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

  return {
    PAYCODE: 1,
    REGCODE: padStr(emp?.regcode ?? '', 3),
    DIVCODE: padStr(emp?.divcode ?? '', 3),
    STACODE: padStr(emp?.stacode ?? '', 3),
    EMPNO: padStr(emp?.empno ?? emp?.employee_number ?? '', 7),
    FNAME: padStr(emp?.fname ?? emp?.first_name ?? '', 15),
    MI: padStr(emp?.mi ?? '', 2),
    LNAME: padStr(emp?.lname ?? emp?.last_name ?? '', 15),
    APPEL: padStr(emp?.appel ?? '', 3),
    BASIC: padNum(basic, 999999.99),
    TRANS: padNum(trans, 999999.99),
    DEDLNR: padNum(dedlnr, 999999.99),
    DEDMED: padNum(dedmed, 9999.99),
    DEDPAG: padNum(dedpag, 9999.99),
    DEDTAX: padNum(dedtax, 999999.99),
    OTHERDED: padNum(otherded, 999999.99),
    OFFICE: padStr(emp?.divcode ?? '', 6),
    ENDING: padStr(fmt(endDate), 8),
    ISSUE: padStr(fmt(payDate), 8),
    CHKNO: 0,
    ONTOP: padNum(ontop, 99999.99),
    LONG: padNum(longVal, 99999.99),
    RATA: padNum(rata, 99999.99),
    PERA: padNum(pera, 99999.99),
    ACA: padNum(aca, 999999.99),
    TAKEHOME: padNum(takehome, 999999.99),
    POSCODE: padStr(emp?.poscode ?? '', 4),
    GRADE: padStr(String(emp?.grade ?? ''), 2),
    STEP: padStr(String(emp?.step ?? ''), 1),
    GOVTLNR: padNum(Number(entry.govtlnr ?? 0), 999999.99),
    GOVTECC: padNum(Number(entry.govtecc ?? 0), 999999.99),
    GOVTPAG: padNum(Number(entry.govtpag ?? 0), 999999.99),
    GOVTMED: padNum(Number(entry.govtmed ?? 0), 999999.99),
    TAXCODE: padStr(emp?.taxcode ?? '', 2),
    PAYMODE: padStr(emp?.paymode ?? '', 1),
    BANK: padStr(emp?.banker ?? emp?.bank_name ?? '', 3),
  };
}

interface ExportModalProps {
  periodId: string;
  periodName: string;
  onClose: () => void;
}

interface ExportStatus {
  loading: boolean;
  error: string | null;
  results: Record<Category, { files: ClassifiedFile[]; empCount: number } | null>;
}

export default function ClassifiedExportModal({ periodId, periodName, onClose }: ExportModalProps) {
  const { logAudit } = useAuth();
  const [status, setStatus] = useState<ExportStatus>({ loading: false, error: null, results: { elementary: null, highschool: null } });
  const [branchCd, setBranchCd] = useState('001');
  const [batchNo, setBatchNo] = useState('00001');

  const { scopedCodes } = useOrg();

  const loadData = useCallback(async () => {
    const scope = codeScope(scopedCodes);
    let empQuery = supabaseClient.from('employees').select('*');
    if (scope.regcode) {
      empQuery = empQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
    }
    const employees = await fetchAll(() => empQuery);
    const empnos = [...new Set((employees as Employee[]).map((e) => e.empno ?? e.employee_number ?? '').filter(Boolean))];
    let dedQuery = supabaseClient.from('payroll_deductions').select('*');
    if (scope.regcode) {
      dedQuery = empnos.length > 0 ? dedQuery.in('empno', empnos) : dedQuery.eq('empno', '__none__');
    }
    const [entries, deductions] = await Promise.all([
      fetchAll(() => supabaseClient.from('payroll_entries').select('*').eq('pay_period_id', periodId)),
      fetchAll(() => dedQuery),
    ]);
    return { entries: entries as PayrollEntry[], employees: employees as Employee[], deductions: deductions as PayrollDeduction[] };
  }, [periodId, scopedCodes]);

  const buildFiles = useCallback(async (cat: Category): Promise<{ files: ClassifiedFile[]; empCount: number } | null> => {
    const { entries, employees, deductions } = await loadData();
    const period = { period_name: periodName } as PayPeriod;
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const scopedEntries = entries.filter((pe) => {
      const e = empMap.get(pe.employee_id);
      return inRange(e?.stacode, cat);
    });
    const scopedEmployees = employees.filter((e) => inRange(e.stacode, cat));
    const scopedEmpIds = new Set(scopedEmployees.map((e) => e.id));
    const scopedDeductions = deductions.filter((d) => scopedEmpIds.has(d.employee_id ?? ''));

    if (scopedEntries.length === 0) return null;

    const suffix = STACODE_RANGES[cat].suffix;
    const files: ClassifiedFile[] = [];

    // MASTERFILE
    files.push({
      name: `MASTERFILE_${suffix}.DBF`,
      content: generateMasterfileDbf(scopedEmployees),
      recordCount: scopedEmployees.length,
    });

    // DEDFILE
    files.push({
      name: `DEDFILE_${suffix}.DBF`,
      content: generateDedfileDbf(scopedDeductions, scopedEmployees),
      recordCount: scopedDeductions.length,
    });

    // PAYROLL (PAYROLLS.DBF — 36-field FoxPro)
    const payrollRecords = scopedEntries.map((pe) => entryToPayrollsRecord(pe, empMap.get(pe.employee_id), period));
    files.push({
      name: `PAYROLL_${suffix}.DBF`,
      content: generatePayrollsDbf(payrollRecords),
      recordCount: payrollRecords.length,
    });

    // PYENT (full)
    const pyentResult = generatePyentDbf(scopedEntries, scopedEmployees, 1, branchCd, batchNo);
    if (pyentResult.valid && pyentResult.dbf) {
      files.push({ name: `PYENT_${suffix}.DBF`, content: pyentResult.dbf, recordCount: pyentResult.totalRecords });
    }
    // PYENT1
    const pyent1Result = generatePyentDbf(scopedEntries, scopedEmployees, 1, branchCd, batchNo);
    if (pyent1Result.valid && pyent1Result.dbf) {
      files.push({ name: `PYENT1_${suffix}.DBF`, content: pyent1Result.dbf, recordCount: pyent1Result.totalRecords });
    }
    // PYENT2
    const pyent2Result = generatePyentDbf(scopedEntries, scopedEmployees, 2, branchCd, batchNo);
    if (pyent2Result.valid && pyent2Result.dbf) {
      files.push({ name: `PYENT2_${suffix}.DBF`, content: pyent2Result.dbf, recordCount: pyent2Result.totalRecords });
    }

    return { files, empCount: scopedEntries.length };
  }, [loadData, periodName, branchCd, batchNo]);

  async function exportOne(cat: Category, fileType: 'master' | 'dedfile' | 'payroll' | 'pyent' | 'pyent1' | 'pyent2') {
    setStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await buildFiles(cat);
      if (!result) {
        setStatus((s) => ({ ...s, loading: false, error: `No employees found in ${STACODE_RANGES[cat].label} STACODE range.` }));
        return;
      }
      const suffix = STACODE_RANGES[cat].suffix;
      const fileMap: Record<string, { file: ClassifiedFile; fname: string }> = {
        master: { file: result.files[0], fname: `MASTERFILE_${suffix}.DBF` },
        dedfile: { file: result.files[1], fname: `DEDFILE_${suffix}.DBF` },
        payroll: { file: result.files[2], fname: `PAYROLL_${suffix}.DBF` },
        pyent: { file: result.files[3], fname: `PYENT_${suffix}.DBF` },
        pyent1: { file: result.files[4], fname: `PYENT1_${suffix}.DBF` },
        pyent2: { file: result.files[5], fname: `PYENT2_${suffix}.DBF` },
      };
      const entry = fileMap[fileType];
      if (!entry || !entry.file) {
        setStatus((s) => ({ ...s, loading: false, error: `${entry.fname} could not be generated (validation may have failed).` }));
        return;
      }
      downloadFile({ filename: entry.fname, content: entry.file.content, mimeType: 'application/dbf' });
      await logAudit('classified_dbf_export', 'pay_period', periodId, { category: cat, fileType, filename: entry.fname, records: entry.file.recordCount });
      setStatus((s) => ({ ...s, loading: false }));
    } catch (err) {
      setStatus((s) => ({ ...s, loading: false, error: formatError(err) }));
    }
  }

  async function exportAllZip(cat: Category) {
    setStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await buildFiles(cat);
      if (!result) {
        setStatus((s) => ({ ...s, loading: false, error: `No employees found in ${STACODE_RANGES[cat].label} STACODE range.` }));
        return;
      }
      const zipName = cat === 'elementary' ? 'Elementary_Payroll.zip' : 'HighSchool_Payroll.zip';
      const zip = new JSZip();
      for (const f of result.files) {
        zip.file(f.name, f.content);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = zipName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await logAudit('classified_zip_export', 'pay_period', periodId, { category: cat, zipName, fileCount: result.files.length, employees: result.empCount });
      setStatus((s) => ({ ...s, loading: false, results: { ...s.results, [cat]: result } }));
    } catch (err) {
      setStatus((s) => ({ ...s, loading: false, error: formatError(err) }));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Classified DBF Export</h2>
            <p className="text-xs text-slate-500 mt-0.5">STACODE-based export for {periodName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Branch & Batch inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Branch Code</label>
              <input value={branchCd} onChange={(e) => setBranchCd(e.target.value.slice(0, 3))} maxLength={3} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Batch No</label>
              <input value={batchNo} onChange={(e) => setBatchNo(e.target.value.slice(0, 5))} maxLength={5} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="00001" />
            </div>
          </div>

          {status.error && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-700 border border-rose-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{status.error}</span>
            </div>
          )}

          {/* Elementary section */}
          <CategorySection
            cat="elementary"
            icon={<School className="w-5 h-5" />}
            onExport={exportOne}
            onExportAll={exportAllZip}
            loading={status.loading}
            result={status.results.elementary}
          />

          {/* High School section */}
          <CategorySection
            cat="highschool"
            icon={<Building2 className="w-5 h-5" />}
            onExport={exportOne}
            onExportAll={exportAllZip}
            loading={status.loading}
            result={status.results.highschool}
          />

          {/* Classification rules */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-slate-600" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">STACODE Classification Rules</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-1.5 mb-1"><School className="w-3.5 h-3.5 text-blue-600" /><span className="font-semibold text-slate-700">Elementary Schools</span></div>
                <p className="text-slate-500">STACODE 001–499</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-1.5 mb-1"><Building2 className="w-3.5 h-3.5 text-emerald-600" /><span className="font-semibold text-slate-700">High School (Jr + Sr)</span></div>
                <p className="text-slate-500">STACODE 500–701</p>
              </div>
            </div>
          </div>

          {/* PAYROLLS.DBF structure note */}
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-700">PAYROLL.DBF FoxPro Structure (36 fields, 226-byte record)</summary>
            <div className="mt-2 text-slate-400">
              All exported PAYROLL.DBF files retain exact Visual FoxPro structure: field order, names, types, lengths, decimal precision, and record formatting. Files are directly usable in existing DepEd FoxPro payroll systems without modification.
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

// ── Supabase client (avoid circular import issues) ──
import { supabase as supabaseClient } from '@/lib/supabase';

interface CategorySectionProps {
  cat: Category;
  icon: React.ReactNode;
  onExport: (cat: Category, fileType: 'master' | 'dedfile' | 'payroll' | 'pyent' | 'pyent1' | 'pyent2') => void;
  onExportAll: (cat: Category) => void;
  loading: boolean;
  result: { files: ClassifiedFile[]; empCount: number } | null;
}

function CategorySection({ cat, icon, onExport, onExportAll, loading, result }: CategorySectionProps) {
  const r = STACODE_RANGES[cat];
  const suffix = r.suffix;
  const accent = cat === 'elementary' ? 'blue' : 'emerald';
  const accentCls: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50/50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-700',
  };
  const btnCls = 'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-200';

  const fileTypes: { key: 'master' | 'dedfile' | 'payroll' | 'pyent' | 'pyent1' | 'pyent2'; label: string; icon: React.ReactNode }[] = [
    { key: 'master', label: `MASTERFILE_${suffix}.DBF`, icon: <Table2 className="w-4 h-4 text-slate-400" /> },
    { key: 'dedfile', label: `DEDFILE_${suffix}.DBF`, icon: <Table2 className="w-4 h-4 text-slate-400" /> },
    { key: 'payroll', label: `PAYROLL_${suffix}.DBF`, icon: <FileSpreadsheet className="w-4 h-4 text-amber-500" /> },
    { key: 'pyent', label: `PYENT_${suffix}.DBF`, icon: <Table2 className="w-4 h-4 text-slate-400" /> },
    { key: 'pyent1', label: `PYENT1_${suffix}.DBF`, icon: <Table2 className="w-4 h-4 text-slate-400" /> },
    { key: 'pyent2', label: `PYENT2_${suffix}.DBF`, icon: <Table2 className="w-4 h-4 text-slate-400" /> },
  ];

  return (
    <div className={`rounded-xl border p-4 ${accentCls[accent]}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h3 className="text-sm font-bold text-slate-800">{r.label}</h3>
            <p className="text-xs text-slate-500">STACODE {String(r.min).padStart(3, '0')}–{String(r.max).padStart(3, '0')}</p>
          </div>
        </div>
        {result && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <CheckCircle className="w-3.5 h-3.5" /> {result.empCount} employees
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {fileTypes.map((ft) => (
          <button key={ft.key} onClick={() => onExport(cat, ft.key)} disabled={loading} className={btnCls}>
            <span className="flex items-center gap-2 truncate">{ft.icon}<span className="truncate font-mono text-xs">{ft.label}</span></span>
            <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>
        ))}
      </div>

      <button onClick={() => onExportAll(cat)} disabled={loading} className={`mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${accent === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
        {loading ? <ScriviaLogo className="w-4 h-4 animate-pulse" /> : <Archive className="w-4 h-4" />}
        Export All {r.label} DBF Files (ZIP)
      </button>
    </div>
  );
}
