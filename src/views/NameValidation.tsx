import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Download, FileSpreadsheet, FileText, FileDown, X, Eye,
  CheckCircle2, AlertTriangle, UserMinus, UserX, HelpCircle, RefreshCw,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { supabase, fetchAll } from '@/lib/supabase';
import { useOrg, codeScope } from '@/lib/org';
import { usePagination, Pagination } from '@/components/Pagination';
import { loadPlantillaPositions, type PlantillaPosition } from '@/lib/plantilla';
import type { Employee } from '@/types/payroll';
import {
  compareRecords, summarize, parseName, normalizeName,
  type ComparisonResult, type ValidationStatus, type SummaryStats,
  type PlantillaRecord, type MasterfileRecord,
  STATUS_LABELS, STATUS_COLORS,
} from '@/lib/nameValidation';

type FilterKey = 'ALL' | ValidationStatus;
type SortCol = 'status' | 'plantillaName' | 'masterfileName' | 'plantillaPosition' | 'employeeId';
type SortDir = 'asc' | 'desc';

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All Records' },
  { key: 'MATCHED', label: 'Matched' },
  { key: 'NAME_MISMATCH', label: 'Name Mismatch' },
  { key: 'MISSING_IN_MASTERFILE', label: 'Missing in Masterfile' },
  { key: 'MISSING_IN_PLANTILLA', label: 'Missing in Plantilla' },
  { key: 'POSSIBLE_VARIATION', label: 'Possible Variations' },
];

export default function NameValidation() {
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [sortCol, setSortCol] = useState<SortCol>('plantillaName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [detail, setDetail] = useState<ComparisonResult | null>(null);
  const [stats, setStats] = useState<SummaryStats>({
    totalPlantilla: 0, totalMasterfile: 0, matched: 0,
    nameMismatch: 0, missingInMasterfile: 0, missingInPlantilla: 0, possibleVariations: 0,
  });

  const { scopedCodes } = useOrg();

  const runComparison = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const scope = codeScope(scopedCodes);
      let empQuery = supabase.from('employees').select('*');
      if (scope.regcode) {
        empQuery = empQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
      }
      const [plantillaData, employeeData] = await Promise.all([
        loadPlantillaPositions(),
        fetchAll<Employee>(() => empQuery),
      ]);

      const plantillaRecords: PlantillaRecord[] = plantillaData
        .filter(p => p.position_status === 'Filled' && p.employee_name)
        .map(p => {
          const parsed = parseName(p.employee_name);
          return {
            id: p.id,
            employee_name: p.employee_name,
            first_name: parsed.first,
            middle_name: parsed.middle,
            last_name: parsed.last,
            item_number: p.item_number,
            position_title: p.position_title,
            salary_grade: p.salary_grade,
          };
        });

      const masterfileRecords: MasterfileRecord[] = employeeData.map(e => ({
        id: e.id,
        first_name: e.first_name ?? e.fname ?? '',
        middle_name: e.middle_name ?? e.mi ?? '',
        last_name: e.last_name ?? e.lname ?? '',
        employee_id: e.employee_number ?? e.empno ?? '',
        station: e.stacode ?? '',
        position: e.position ?? e.poscode ?? '',
      }));

      const cmp = compareRecords(plantillaRecords, masterfileRecords);
      setResults(cmp);
      setStats(summarize(cmp));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load records for comparison.');
    } finally {
      setLoading(false);
    }
  }, [scopedCodes]);

  useEffect(() => { runComparison(); }, [runComparison]);

  const filtered = useMemo(() => {
    let r = results;
    if (filter !== 'ALL') r = r.filter(x => x.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter(x =>
        x.plantillaName.toLowerCase().includes(q) ||
        x.masterfileName.toLowerCase().includes(q) ||
        x.plantillaPosition.toLowerCase().includes(q) ||
        x.employeeId.toLowerCase().includes(q),
      );
    }
    const sorted = [...r].sort((a, b) => {
      const av = String(a[sortCol] ?? '');
      const bv = String(b[sortCol] ?? '');
      if (sortDir === 'asc') return av.localeCompare(bv, undefined, { numeric: true });
      return bv.localeCompare(av, undefined, { numeric: true });
    });
    return sorted;
  }, [results, filter, search, sortCol, sortDir]);

  const paginated = usePagination(filtered, 25, `${filter}-${search}`);

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  // ── Exports ──────────────────────────────────────────────────────────────
  function exportCsv(detailed: boolean) {
    let csv: string;
    if (detailed) {
      const headers = ['Status', 'Plantilla Name', 'Masterfile Name', 'Plantilla Position', 'Employee ID', 'Remarks'];
      const rows = filtered.map(r => [STATUS_LABELS[r.status], r.plantillaName, r.masterfileName, r.plantillaPosition, r.employeeId, r.remarks]);
      csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    } else {
      const headers = ['Metric', 'Count'];
      const rows: [string, number][] = [
        ['Total Plantilla Employees', stats.totalPlantilla],
        ['Total Masterfile Employees', stats.totalMasterfile],
        ['Total Matches', stats.matched],
        ['Total Name Mismatches', stats.nameMismatch],
        ['Missing in Masterfile', stats.missingInMasterfile],
        ['Missing in Plantilla', stats.missingInPlantilla],
        ['Possible Variations', stats.possibleVariations],
      ];
      csv = [headers, ...rows.map(r => r.map(String))].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    }
    downloadBlob(csv, `name_validation_${detailed ? 'detailed' : 'summary'}_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  }

  function exportPdf() {
    // Lightweight: open a print-friendly window
    const win = window.open('', '_blank');
    if (!win) return;
    const rowsHtml = filtered.map(r => `<tr>
      <td style="padding:6px;border:1px solid #ccc">${STATUS_LABELS[r.status]}</td>
      <td style="padding:6px;border:1px solid #ccc">${escapeHtml(r.plantillaName)}</td>
      <td style="padding:6px;border:1px solid #ccc">${escapeHtml(r.masterfileName)}</td>
      <td style="padding:6px;border:1px solid #ccc">${escapeHtml(r.plantillaPosition)}</td>
      <td style="padding:6px;border:1px solid #ccc">${escapeHtml(r.employeeId)}</td>
      <td style="padding:6px;border:1px solid #ccc">${escapeHtml(r.remarks)}</td>
    </tr>`).join('');
    win.document.write(`<html><head><title>Name Validation Report</title>
      <style>body{font-family:sans-serif;padding:20px}h1{font-size:18px}table{border-collapse:collapse;width:100%;font-size:12px}th{background:#f1f5f9}</style>
      </head><body>
      <h1>Employee Name Validation Report</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
      <p>Plantilla: ${stats.totalPlantilla} | Masterfile: ${stats.totalMasterfile} | Matches: ${stats.matched} | Mismatches: ${stats.nameMismatch} | Missing MF: ${stats.missingInMasterfile} | Missing PL: ${stats.missingInPlantilla} | Variations: ${stats.possibleVariations}</p>
      <table><thead><tr><th>Status</th><th>Plantilla Name</th><th>Masterfile Name</th><th>Position</th><th>Employee ID</th><th>Remarks</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <script>window.print()</script></body></html>`);
    win.document.close();
  }

  const kpiCards: { label: string; value: number; icon: typeof CheckCircle2; color: string }[] = [
    { label: 'Plantilla Employees', value: stats.totalPlantilla, icon: CheckCircle2, color: 'text-slate-600 bg-slate-50 dark:bg-slate-800' },
    { label: 'Masterfile Employees', value: stats.totalMasterfile, icon: FileText, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Matches', value: stats.matched, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Name Mismatches', value: stats.nameMismatch, icon: AlertTriangle, color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/30' },
    { label: 'Missing in Masterfile', value: stats.missingInMasterfile, icon: UserMinus, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Missing in Plantilla', value: stats.missingInPlantilla, icon: UserX, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Possible Variations', value: stats.possibleVariations, icon: HelpCircle, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Employee Name Validation</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Compare Plantilla records against the Masterfile to identify name mismatches, missing records, and variations.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={runComparison}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {loading ? <ScriviaLogo className="w-4 h-4 animate-pulse" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
          <button onClick={() => exportCsv(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> CSV
          </button>
          <button onClick={exportPdf} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <FileDown className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => exportCsv(false)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Download className="w-4 h-4" /> Summary
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {kpiCards.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${k.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{k.value.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{k.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, position, or employee ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === opt.key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <SortHeader col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortHeader col="plantillaName" label="Plantilla Name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortHeader col="masterfileName" label="Masterfile Name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortHeader col="plantillaPosition" label="Plantilla Position" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortHeader col="employeeId" label="Employee ID" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Remarks</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-400">Comparing records...</td></tr>
              ) : paginated.pagedItems.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-400">No records found for the selected filter.</td></tr>
              ) : (
                paginated.pagedItems.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-medium ${STATUS_COLORS[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate" title={r.plantillaName}>{r.plantillaName}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate" title={r.masterfileName}>{r.masterfileName}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[180px] truncate" title={r.plantillaPosition}>{r.plantillaPosition}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">{r.employeeId}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs max-w-[200px] truncate" title={r.remarks}>{r.remarks}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setDetail(r)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination pagination={paginated} label="records" />
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Comparison Details</h3>
                <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-medium ${STATUS_COLORS[detail.status]}`}>
                  {STATUS_LABELS[detail.status]}
                </span>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Plantilla record */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Plantilla Record</p>
                  <DetailRow label="First Name" value={detail.plantilla ? parseName(detail.plantilla.employee_name).first : '-'} />
                  <DetailRow label="Middle Name" value={detail.plantilla ? parseName(detail.plantilla.employee_name).middle : '-'} />
                  <DetailRow label="Last Name" value={detail.plantilla ? parseName(detail.plantilla.employee_name).last : '-'} />
                  <DetailRow label="Position" value={detail.plantilla?.position_title ?? '-'} />
                  <DetailRow label="Item Number" value={detail.plantilla?.item_number ?? '-'} />
                  <DetailRow label="Salary Grade" value={detail.plantilla?.salary_grade != null ? String(detail.plantilla.salary_grade) : '-'} />
                </div>

                {/* Masterfile record */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Masterfile Record</p>
                  <DetailRow label="First Name" value={detail.masterfile?.first_name ?? '-'} />
                  <DetailRow label="Middle Name" value={detail.masterfile?.middle_name ?? '-'} />
                  <DetailRow label="Last Name" value={detail.masterfile?.last_name ?? '-'} />
                  <DetailRow label="Employee ID" value={detail.masterfile?.employee_id ?? '-'} />
                  <DetailRow label="Station" value={detail.masterfile?.station ?? '-'} />
                  <DetailRow label="Position" value={detail.masterfile?.position ?? '-'} />
                </div>
              </div>

              {/* Suggested correction */}
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">Suggested Correction</p>
                {detail.suggestedCorrection ? (
                  <p className="text-sm text-slate-800 dark:text-slate-100 font-medium">{detail.suggestedCorrection}</p>
                ) : detail.status === 'MISSING_IN_MASTERFILE' ? (
                  <p className="text-sm text-slate-700 dark:text-slate-300">Add this employee to the Masterfile using the Plantilla name: <span className="font-medium">{detail.plantillaName}</span></p>
                ) : detail.status === 'MISSING_IN_PLANTILLA' ? (
                  <p className="text-sm text-slate-700 dark:text-slate-300">Verify plantilla assignment for: <span className="font-medium">{detail.masterfileName}</span></p>
                ) : (
                  <p className="text-sm text-slate-700 dark:text-slate-300">No correction needed — names match.</p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Remarks: {detail.remarks}</p>
              </div>
            </div>

            <div className="flex items-center justify-end px-5 py-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setDetail(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortHeader({ col, label, sortCol, sortDir, onSort }: {
  col: SortCol; label: string; sortCol: SortCol; sortDir: SortDir; onSort: (c: SortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 whitespace-nowrap"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-emerald-500">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm text-slate-800 dark:text-slate-100 font-medium text-right max-w-[60%] truncate" title={value}>{value}</span>
    </div>
  );
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
