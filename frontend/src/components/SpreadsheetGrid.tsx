// ── SpreadsheetGrid — embeddable Excel / Google-Sheets style grid ─────────────
// A self-contained spreadsheet view for payroll "files": Excel-style ribbon,
// formula bar, row-number gutter, column-letter headers, in-cell editing with
// Enter/Tab/Escape navigation, sheet tabs, and an explicit "Save All" that
// hands the dirty cells back to the caller for persistence.
//
// Presentational + stateful on its own; the caller supplies columns, rows,
// sheet tabs and the save/export/refresh/back handlers.

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Save, RefreshCw, FileDown, FileSpreadsheet, ArrowLeft, Trash2 } from 'lucide-react';
import ExcelRibbon, { type RibbonTab } from '@/components/ExcelRibbon';
import { currency } from '@/lib/reports';

export interface SpreadsheetColumn {
  /** Stable key into a row's `cells` map. */
  key: string;
  label: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  editable?: boolean;
  /** 'money' renders with ₱-style thousands separators; 'number' plain. */
  type?: 'text' | 'number' | 'money';
  /** Render bolder (identifies key/lookup columns). */
  bold?: boolean;
}

export interface SpreadsheetRow {
  /** Stable row id — the DB primary key used for save-back. */
  id: string;
  cells: Record<string, unknown>;
}

export interface SheetTab {
  key: string;
  label: string;
}

export interface SpreadsheetChange {
  rowKey: string;
  colKey: string;
  value: unknown;
}

export interface SpreadsheetGridProps {
  columns: SpreadsheetColumn[];
  rows: SpreadsheetRow[];
  sheetTabs?: SheetTab[];
  activeSheet?: string;
  onSheetChange?: (key: string) => void;
  fileName?: string;
  onSave?: (changes: SpreadsheetChange[]) => Promise<void> | void;
  onRefresh?: () => void;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  onBack?: () => void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function colLetter(i: number): string {
  let n = i;
  let s = '';
  while (n >= 0) {
    s = LETTERS[n % 26] + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

const DEFAULT_WIDTHS: Record<string, number> = { text: 150, number: 110, money: 120 };

export default function SpreadsheetGrid({
  columns,
  rows,
  sheetTabs = [],
  activeSheet,
  onSheetChange,
  fileName,
  onSave,
  onRefresh,
  onExportCsv,
  onExportExcel,
  onBack,
}: SpreadsheetGridProps) {
  const [activeTab, setActiveTab] = useState('home');
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; text: string } | null>(null);
  // Dirty cells keyed `${sheet}::${rowId}::${colKey}` → committed value.
  const [dirty, setDirty] = useState<Map<string, unknown>>(new Map());
  const [savedFlash, setSavedFlash] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const dirtyCount = useMemo(() => {
    let n = 0;
    const p = activeSheet ?? 'sheet';
    dirty.forEach((_, k) => { if (k.startsWith(`${p}::`)) n += 1; });
    return n;
  }, [dirty, activeSheet]);

  const displayed = (row: SpreadsheetRow, col: SpreadsheetColumn): string => {
    const dk = `${activeSheet ?? 'sheet'}::${row.id}::${col.key}`;
    const v = dirty.has(dk) ? dirty.get(dk) : row.cells[col.key];
    if (v === null || v === undefined || v === '') return '';
    if (col.type === 'money') return currency(Number(v) || 0);
    if (col.type === 'number') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
    return String(v);
  };

  const parseValue = (raw: string, col: SpreadsheetColumn): { ok: boolean; value: unknown } => {
    if (col.type === 'number' || col.type === 'money') {
      const n = Number(String(raw).replace(/[₱,]/g, '').trim());
      if (raw.trim() !== '' && !Number.isFinite(n)) return { ok: false, value: raw };
      return { ok: true, value: raw.trim() === '' ? null : n };
    }
    return { ok: true, value: raw };
  };

  const putDirty = (row: SpreadsheetRow, col: SpreadsheetColumn, value: unknown) => {
    const key = `${activeSheet ?? 'sheet'}::${row.id}::${col.key}`;
    setDirty((prev) => {
      const next = new Map(prev);
      if (value === null || value === '' || value === undefined) next.set(key, '');
      else next.set(key, value);
      return next;
    });
  };

  const commitEdit = (move?: { dr: number; dc: number }) => {
    if (!editing) return;
    const { r, c, text } = editing;
    const col = columns[c];
    const row = rows[r];
    setEditing(null);
    if (row && col && col.editable) {
      const { ok, value } = parseValue(text, col);
      if (ok) putDirty(row, col, value ?? '');
    }
    if (move) setSel({ r: Math.min(Math.max(0, r + move.dr), rows.length - 1), c: Math.min(Math.max(0, c + move.dc), columns.length - 1) });
  };

  const startEditing = (r: number, c: number, preset = '') => {
    const col = columns[c];
    if (!col || !col.editable) return;
    const row = rows[r];
    const dk = `${activeSheet ?? 'sheet'}::${row.id}::${col.key}`;
    const base = dirty.has(dk) ? String(dirty.get(dk) ?? '') : String(row.cells[col.key] ?? '');
    const init = preset !== undefined && preset !== null && preset !== '' ? preset : base;
    setSel({ r, c });
    setEditing({ r, c, text: init });
  };

  const clearSelectedCell = () => {
    if (!sel) return;
    const col = columns[sel.c];
    const row = rows[sel.r];
    if (!row || !col || !col.editable) return;
    putDirty(row, col, '');
  };

  const saveAll = async () => {
    if (dirtyCount === 0) return;
    const p = `${activeSheet ?? 'sheet'}::`;
    const changes: SpreadsheetChange[] = [];
    const byRow = new Map<string, { colKey: string; value: unknown }[]>();
    dirty.forEach((value, key) => {
      if (!key.startsWith(p)) return;
      const [sheetKey, rowId, colKey] = key.split('::');
      void sheetKey;
      changes.push({ rowKey: rowId, colKey, value });
      const arr = byRow.get(rowId) ?? [];
      arr.push({ colKey, value });
      byRow.set(rowId, arr);
    });
    void byRow;
    try {
      await onSave?.(changes);
      setDirty((prev) => {
        const next = new Map(prev);
        dirty.forEach((_, key) => { if (key.startsWith(p)) next.delete(key); });
        return next;
      });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch {
      // Persistence errors are surfaced by the caller's UI; keep dirty cells so
      // the user can retry.
    }
  };

  const moveSel = (r: number, c: number) => {
    const rr = Math.min(Math.max(0, r), Math.max(0, rows.length - 1));
    const cc = Math.min(Math.max(0, c), Math.max(0, columns.length - 1));
    setSel({ r: rr, c: cc });
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    if (!sel) return;
    const col = columns[sel.c];
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        moveSel(sel.r + 1, sel.c);
        return;
      case 'Tab':
        e.preventDefault();
        moveSel(sel.r, sel.c + 1);
        return;
      case 'ArrowDown':
        e.preventDefault();
        moveSel(sel.r + 1, sel.c);
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveSel(sel.r - 1, sel.c);
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveSel(sel.r, sel.c + 1);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        moveSel(sel.r, sel.c - 1);
        return;
      case 'Backspace':
      case 'Delete':
        if (col?.editable) { e.preventDefault(); clearSelectedCell(); }
        return;
      default:
        if (e.key.length === 1 && col?.editable) {
          e.preventDefault();
          startEditing(sel.r, sel.c, e.key);
        }
    }
  };

  const ribbonTabs: RibbonTab[] = [
    {
      key: 'file',
      label: 'File',
      file: true,
      menuItems: [
        { key: 'refresh', label: 'Refresh', hint: 'Reload rows from the database', icon: RefreshCw, onClick: () => { onRefresh?.(); } },
        { key: 'csv', label: 'Export CSV', hint: 'Save the current sheet as .csv', icon: FileDown, onClick: () => { onExportCsv?.(); }, separatorAfter: true },
        { key: 'excel', label: 'Export Excel', hint: 'Save the current sheet as .xls', icon: FileSpreadsheet, onClick: () => { onExportExcel?.(); } },
        { key: 'back', label: 'Back to Payroll Files', hint: 'Return to the file list', icon: ArrowLeft, onClick: () => { onBack?.(); } },
      ],
    },
    {
      key: 'home',
      label: 'Home',
      groups: [
        {
          key: 'clipboard',
          label: 'Clipboard',
          items: [
            {
              key: 'save',
              label: 'Save All',
              icon: Save,
              onClick: () => void saveAll(),
              disabled: dirtyCount === 0,
              active: dirtyCount > 0,
              title: dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount > 1 ? 's' : ''}` : 'No pending changes',
              badge: dirtyCount > 0 ? String(dirtyCount) : null,
            },
          ],
        },
        {
          key: 'editing',
          label: 'Editing',
          items: [
            {
              key: 'clear',
              label: 'Clear Cell',
              icon: Trash2,
              onClick: clearSelectedCell,
              disabled: !(sel && columns[sel.c]?.editable),
              title: 'Clear the selected cell',
            },
          ],
        },
      ],
    },
    {
      key: 'data',
      label: 'Data',
      groups: [
        {
          key: 'tools',
          label: 'Data Tools',
          items: [
            {
              key: 'refresh',
              label: 'Refresh',
              icon: RefreshCw,
              onClick: () => { onRefresh?.(); },
              title: 'Reload rows',
            },
          ],
        },
      ],
    },
  ];

  const selValueForFx = sel
    ? (() => {
        const col = columns[sel.c];
        const row = rows[sel.r];
        if (!col || !row) return '';
        const dk = `${activeSheet ?? 'sheet'}::${row.id}::${col.key}`;
        return dirty.has(dk) ? String(dirty.get(dk) ?? '') : String(row.cells[col.key] ?? '');
      })()
    : '';

  return (
    <div className="flex flex-col min-h-0 h-full rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
      {/* Excel-style ribbon */}
      <ExcelRibbon
        tabs={ribbonTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        brand="Payroll Sheets"
        fileName={fileName}
      />

      {/* Formula bar */}
      <div className="flex items-center gap-1.5 border-t border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1">
        <span className="shrink-0 w-16 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 text-center tabular-nums">
          {sel ? `${colLetter(sel.c)}${sel.r + 1}` : ''}
        </span>
        <span className="shrink-0 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 text-[11px] font-bold italic text-deped-600 dark:text-deped-400">
          fx
        </span>
        {sel && columns[sel.c]?.editable ? (
          <input
            value={editing ? editing.text : selValueForFx}
            onChange={(e) => {
              const t = e.target.value;
              if (editing) {
                setEditing({ ...editing, text: t });
              } else {
                startEditing(sel.r, sel.c === undefined ? 0 : sel.c, t);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commitEdit({ dr: 1, dc: 0 }); }
              else if (e.key === 'Tab') { e.preventDefault(); commitEdit({ dr: 0, dc: 1 }); }
              else if (e.key === 'Escape') { setEditing(null); }
            }}
            className="min-w-0 flex-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-0.5 text-[12px] text-slate-800 dark:text-slate-100 outline-none focus:border-deped-500 tabular-nums"
            placeholder="Cell value"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate px-2 py-0.5 text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">
            {sel ? selValueForFx : ''}
          </span>
        )}
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onClick={() => gridRef.current?.focus()}
        className="relative flex-1 min-h-0 overflow-auto outline-none bg-white dark:bg-slate-900"
      >
        <table className="border-collapse table-fixed">
          <thead>
            <tr>
              {/* Corner cell — sits at both sticky edges */}
              <th className="sticky top-0 left-0 z-30 h-7 min-w-10 w-10 border-b border-r border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1 text-center text-[10px] font-bold text-slate-400">
                #
              </th>
              {columns.map((col, c) => (
                <th
                  key={col.key}
                  style={{ width: col.width ?? DEFAULT_WIDTHS[col.type ?? 'text'], minWidth: col.width ?? DEFAULT_WIDTHS[col.type ?? 'text'] }}
                  className="sticky top-0 z-20 h-7 border-b border-r border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 text-left text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 select-none"
                >
                  <span className="mr-1 text-[8.5px] font-bold text-slate-400">{colLetter(c)}</span>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="border-r border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 py-2 text-center text-[11px] text-slate-400" colSpan={columns.length + 1}>
                  No rows
                </td>
              </tr>
            )}
            {rows.map((row, r) => (
              <tr key={row.id} className={sel?.r === r ? 'bg-deped-50/60 dark:bg-deped-900/20' : ''}>
                <td className="sticky left-0 z-10 h-6 min-w-10 w-10 border-b border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-1 text-center text-[10px] font-medium text-slate-400 tabular-nums select-none">
                  {r + 1}
                </td>
                {columns.map((col, c) => {
                  const selected = sel?.r === r && sel?.c === c;
                  const isEditing = editing?.r === r && editing?.c === c;
                  const dk = `${activeSheet ?? 'sheet'}::${row.id}::${col.key}`;
                  const isDirty = dirty.has(dk);
                  const align = col.align ?? (col.type === 'number' || col.type === 'money' ? 'right' : 'left');
                  return (
                    <td
                      key={col.key}
                      style={{ width: col.width ?? DEFAULT_WIDTHS[col.type ?? 'text'], minWidth: col.width ?? DEFAULT_WIDTHS[col.type ?? 'text'] }}
                      onClick={(e) => { e.stopPropagation(); setSel({ r, c }); }}
                      onDoubleClick={(e) => { e.stopPropagation(); if (col.editable) startEditing(r, c); }}
                      className={`relative h-6 border-b border-r border-slate-200 dark:border-slate-700 px-1.5 text-[11.5px] tabular-nums ${
                        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                      } ${col.bold ? 'font-semibold' : ''} ${isEditing ? 'ring-2 ring-inset ring-deped-500' : selected ? 'ring-2 ring-inset ring-blue-400 dark:ring-blue-500' : ''} ${
                        isDirty ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200' : col.editable ? 'cursor-cell' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editing.text}
                          onChange={(e) => {
                            setEditing({ r, c, text: e.target.value });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitEdit({ dr: 1, dc: 0 }); }
                            else if (e.key === 'Tab') { e.preventDefault(); commitEdit({ dr: 0, dc: 1 }); }
                            else if (e.key === 'Escape') { setEditing(null); }
                          }}
                          className="absolute inset-0 z-20 w-full border-0 bg-white dark:bg-slate-900 px-1.5 text-[11.5px] text-slate-900 dark:text-white outline-none tabular-nums"
                        />
                      ) : (
                        <span className="block truncate">{displayed(row, col)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sheet tabs */}
      {sheetTabs.length > 1 && (
        <div className="flex items-center overflow-x-auto border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 px-1 gap-px">
          {sheetTabs.map((s) => {
            const isActive = s.key === activeSheet;
            return (
              <button
                key={s.key}
                onClick={() => { setSel(null); setEditing(null); onSheetChange?.(s.key); }}
                className={`inline-flex shrink-0 items-center gap-1 border-r border-t border-l px-3 py-1 mx-px rounded-t-md text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-deped-700 dark:text-deped-300 border-slate-300 dark:border-slate-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1 text-[10.5px] text-slate-500 dark:text-slate-400">
        <span>{savedFlash ? 'All changes saved.' : dirtyCount > 0 ? `${dirtyCount} pending change${dirtyCount > 1 ? 's' : ''} — click Save All` : 'Ready'}</span>
        <span className="ml-auto">{rows.length.toLocaleString()}</span>
        <span>{sel ? `${colLetter(sel.c)}${sel.r + 1}` : ''}</span>
      </div>
    </div>
  );
}

export { colLetter };