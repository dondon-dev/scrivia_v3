import { useState, useMemo } from 'react';
import { X, FileDown, CheckCircle, AlertTriangle, Download, ShieldCheck } from 'lucide-react';
import { formatError } from '@/lib/supabase';
import { generatePyentDbf, downloadFile, currency, type PyentExportResult } from '@/lib/reports';
import { computePyentSplit } from '@/lib/payroll';
import type { Employee, PayrollEntry } from '@/types/payroll';

interface PyentExportModalProps {
  entries: PayrollEntry[];
  employees: Employee[];
  periodName: string;
  periodId: string;
  logAudit: (action: string, targetType: string, targetId: string, metadata: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

export default function PyentExportModal({ entries, employees, periodName, periodId, logAudit, onClose }: PyentExportModalProps) {
  const [half, setHalf] = useState<1 | 2>(1);
  const [branchCd, setBranchCd] = useState('001');
  const [batchNo, setBatchNo] = useState('00001');
  const [result, setResult] = useState<PyentExportResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const previewSplits = useMemo(() => {
    return entries.map((pe) => {
      const e = empMap.get(pe.employee_id);
      const split = computePyentSplit(pe.net_pay);
      return {
        empno: e?.empno ?? e?.employee_number ?? '',
        name: e ? `${e.lname || e.last_name}, ${e.fname || e.first_name}` : 'Unknown',
        pyent: split.pyent,
        pyent1: split.pyent1,
        pyent2: split.pyent2,
        valid: split.valid,
        diff: split.difference,
      };
    });
  }, [entries, empMap]);

  const totalPyent = previewSplits.reduce((s, r) => s + r.pyent, 0);
  const totalPyent1 = previewSplits.reduce((s, r) => s + r.pyent1, 0);
  const totalPyent2 = previewSplits.reduce((s, r) => s + r.pyent2, 0);
  const splitValidation = Math.abs(totalPyent1 + totalPyent2 - totalPyent) <= 0.01;

  function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = generatePyentDbf(entries, employees, half, branchCd, batchNo);
      setResult(res);
      if (res.valid) {
        logAudit('pyent_dbf_generate', 'pay_period', periodId, {
          half, records: res.totalRecords, totalAmount: res.totalAmount, branchCd, batchNo,
        });
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setGenerating(false);
    }
  }

  function handleDownload() {
    if (!result?.dbf || !result.valid) return;
    const filename = `PYENT${half}.DBF`;
    downloadFile({ filename, content: result.dbf, mimeType: 'application/dbf' });
    logAudit('pyent_dbf_download', 'pay_period', periodId, {
      half, filename, records: result.totalRecords, totalAmount: result.totalAmount,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">PYENT DBF Export</h2>
            <p className="text-xs text-slate-500 mt-0.5">FoxPro-compatible banking upload file — {periodName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Payroll half selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Payroll Half</label>
            <div className="flex gap-3">
              <button
                onClick={() => setHalf(1)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${half === 1 ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                <div className="font-semibold">PYENT1.DBF</div>
                <div className="text-xs mt-0.5 opacity-80">1st Half (Days 1–15)</div>
              </button>
              <button
                onClick={() => setHalf(2)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${half === 2 ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                <div className="font-semibold">PYENT2.DBF</div>
                <div className="text-xs mt-0.5 opacity-80">2nd Half (Days 16–30/31)</div>
              </button>
            </div>
          </div>

          {/* Branch & Batch inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Branch Code (3 chars max)</label>
              <input
                value={branchCd}
                onChange={(e) => setBranchCd(e.target.value.slice(0, 3))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="001"
                maxLength={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Batch No (5 chars max)</label>
              <input
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value.slice(0, 5))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="00001"
                maxLength={5}
              />
            </div>
          </div>

          {/* PYENT split validation summary */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">PYENT Split Validation</h3>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-xs text-slate-500">Total PYENT</div>
                <div className="text-base font-bold text-slate-800 tabular-nums">{currency(totalPyent)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Total PYENT1</div>
                <div className="text-base font-bold text-emerald-600 tabular-nums">{currency(totalPyent1)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Total PYENT2</div>
                <div className="text-base font-bold text-blue-600 tabular-nums">{currency(totalPyent2)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Validation</div>
                {splitValidation ? (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
                    <CheckCircle className="w-4 h-4" /> PASS
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-rose-600">
                    <AlertTriangle className="w-4 h-4" /> FAIL
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Rule: PYENT1 = FLOOR(PYENT / 2), PYENT2 = PYENT − PYENT1. Tolerance ≤ ₱0.01.
            </div>
          </div>

          {/* Generate button */}
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating || !splitValidation}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FileDown className="w-4 h-4" />
              {generating ? 'Generating…' : `Generate PYENT${half}.DBF`}
            </button>
            {!splitValidation && (
              <span className="inline-flex items-center gap-1.5 text-sm text-rose-600">
                <AlertTriangle className="w-4 h-4" /> PYENT1 + PYENT2 ≠ PYENT. Payroll generation blocked.
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-700 border border-rose-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Export results */}
          {result && (
            <div className="space-y-4">
              {/* Validation status banner */}
              <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${result.valid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                {result.valid ? (
                  <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 text-sm">
                  {result.valid ? (
                    <>
                      <span className="font-semibold">Export validation passed.</span> All {result.totalRecords} records pass DBF structure validation. Record length = {result.recordLength} bytes.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">Export failed — validation errors detected.</span> {result.fieldValidations.length} field error(s), {result.pyentChecks.filter((c) => !c.valid).length} PYENT split error(s). File not generated.
                    </>
                  )}
                </div>
              </div>

              {/* Export summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Total Records</div>
                  <div className="text-xl font-bold text-slate-800 tabular-nums">{result.totalRecords}</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Total PYENT{half}</div>
                  <div className="text-xl font-bold text-emerald-600 tabular-nums">{currency(result.totalAmount)}</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Record Length</div>
                  <div className="text-xl font-bold text-slate-800 tabular-nums">{result.recordLength} <span className="text-xs font-normal text-slate-400">bytes</span></div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className={`text-xl font-bold ${result.valid ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {result.valid ? 'VALID' : 'FAILED'}
                  </div>
                </div>
              </div>

              {/* Field validation errors */}
              {result.fieldValidations.length > 0 && (
                <div className="bg-white rounded-xl border border-rose-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-rose-100 bg-rose-50">
                    <h3 className="text-sm font-semibold text-rose-700">Field Validation Errors ({result.fieldValidations.length})</h3>
                  </div>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">EMPNO</th>
                          <th className="text-left px-4 py-2 font-medium">Employee</th>
                          <th className="text-left px-4 py-2 font-medium">Field</th>
                          <th className="text-left px-4 py-2 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.fieldValidations.map((v, i) => (
                          <tr key={i} className="hover:bg-rose-50/50">
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{v.empno}</td>
                            <td className="px-4 py-2 text-slate-700 text-xs">{v.empname}</td>
                            <td className="px-4 py-2"><span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-xs font-mono font-semibold">{v.field}</span></td>
                            <td className="px-4 py-2 text-xs text-rose-600">{v.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* PYENT split validation errors */}
              {result.pyentChecks.some((c) => !c.valid) && (
                <div className="bg-white rounded-xl border border-rose-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-rose-100 bg-rose-50">
                    <h3 className="text-sm font-semibold text-rose-700">PYENT Split Errors</h3>
                  </div>
                  <div className="overflow-x-auto max-h-40">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">EMPNO</th>
                          <th className="text-left px-4 py-2 font-medium">Employee</th>
                          <th className="text-right px-4 py-2 font-medium">PYENT</th>
                          <th className="text-right px-4 py-2 font-medium">PYENT1</th>
                          <th className="text-right px-4 py-2 font-medium">PYENT2</th>
                          <th className="text-right px-4 py-2 font-medium">Diff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.pyentChecks.filter((c) => !c.valid).map((c, i) => (
                          <tr key={i} className="hover:bg-rose-50/50">
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{c.empno}</td>
                            <td className="px-4 py-2 text-slate-700 text-xs">{c.empname}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-slate-600">{currency(c.pyent)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-slate-600">{currency(c.pyent1)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-slate-600">{currency(c.pyent2)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-rose-600 font-medium">{c.difference.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Download button */}
              {result.valid && result.dbf && (
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors w-full justify-center"
                >
                  <Download className="w-4 h-4" /> Download PYENT{half}.DBF ({result.totalRecords} records, {currency(result.totalAmount)})
                </button>
              )}
            </div>
          )}

          {/* Record structure reference */}
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-700">DBF Record Structure (81 bytes)</summary>
            <div className="mt-2 grid grid-cols-6 gap-2">
              <div className="bg-slate-100 rounded p-2 text-center">
                <div className="font-mono font-semibold">ACCT_NO</div>
                <div>Char(10)</div>
              </div>
              <div className="bg-slate-100 rounded p-2 text-center">
                <div className="font-mono font-semibold">ACCT_NAME</div>
                <div>Char(40)</div>
              </div>
              <div className="bg-slate-100 rounded p-2 text-center">
                <div className="font-mono font-semibold">AMOUNT</div>
                <div>Char(15)</div>
              </div>
              <div className="bg-slate-100 rounded p-2 text-center">
                <div className="font-mono font-semibold">BRANCH_CD</div>
                <div>Char(3)</div>
              </div>
              <div className="bg-slate-100 rounded p-2 text-center">
                <div className="font-mono font-semibold">BATCH_NO</div>
                <div>Char(5)</div>
              </div>
              <div className="bg-slate-100 rounded p-2 text-center">
                <div className="font-mono font-semibold">FILLER</div>
                <div>Char(7)</div>
              </div>
            </div>
            <div className="mt-2 text-slate-400">
              AMOUNT is stored as integer centavos (amount × 100), zero-padded to 15 digits.
              Example: ₱20,572.29 → 000000002057229
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
