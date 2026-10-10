import { useState, useEffect, useMemo } from 'react';
import { Building2, ChevronDown, School, GraduationCap, Layers, Check } from 'lucide-react';
import { supabase, fetchAll } from '@/lib/pb';
import { CATEGORIES, type PayrollCategory } from '@/lib/categories';
import type { PayrollGroup } from '@/types/payroll';

export type GroupFilterValue =
  | { kind: 'all' }
  | { kind: 'category'; category: PayrollCategory }
  | { kind: 'group'; groupId: string; stacodeMin: number | null; stacodeMax: number | null };

export interface GroupFilterResult {
  value: GroupFilterValue;
  stacodeMin: number | null;
  stacodeMax: number | null;
  category: PayrollCategory | null;
  groupId: string | null;
  label: string;
}

export const ALL_GROUPS: GroupFilterResult = {
  value: { kind: 'all' },
  stacodeMin: null,
  stacodeMax: null,
  category: null,
  groupId: null,
  label: 'All Payroll Groups',
};

interface GroupFilterProps {
  value: GroupFilterValue;
  onChange: (value: GroupFilterValue) => void;
  className?: string;
  compact?: boolean;
}

export function useGroupFilterOptions() {
  const [groups, setGroups] = useState<PayrollGroup[]>([]);

  useEffect(() => {
    (async () => {
      const grp = await fetchAll<PayrollGroup>(() =>
        supabase.from('payroll_groups').select('*').eq('status', 'Active').order('group_code'),
      );
      setGroups(grp);
    })();
  }, []);

  return groups;
}

export function resolveGroupFilter(value: GroupFilterValue, groups: PayrollGroup[]): GroupFilterResult {
  if (value.kind === 'all') return ALL_GROUPS;
  if (value.kind === 'category') {
    const def = CATEGORIES[value.category];
    return {
      value,
      stacodeMin: def.min,
      stacodeMax: def.max,
      category: value.category,
      groupId: null,
      label: def.label,
    };
  }
  const grp = groups.find((g) => g.id === value.groupId);
  return {
    value,
    stacodeMin: grp?.stacode_min ?? null,
    stacodeMax: grp?.stacode_max ?? null,
    category: null,
    groupId: value.groupId,
    label: grp?.group_name ?? 'Unknown Group',
  };
}

export default function GroupFilter({ value, onChange, className = '', compact = false }: GroupFilterProps) {
  const [open, setOpen] = useState(false);

  // The menu offers the two payroll categories only. The `payroll_groups`
  // collection is not listed here: in practice its rows mirror the categories
  // (Elementary 001–499 / High School 500–701), which duplicated every entry
  // under a second "Specific Groups" heading. Group-scoped filters (`kind:
  // 'group'`) are still resolved by resolveGroupFilter for callers that set one.
  const current = useMemo(() => resolveGroupFilter(value, []), [value]);

  const CurrentIcon = current.value.kind === 'category'
    ? (current.category === 'elementary' ? School : GraduationCap)
    : current.value.kind === 'group'
      ? Building2
      : Layers;

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors whitespace-nowrap`}
      >
        <CurrentIcon className="w-4 h-4 text-deped-600 dark:text-deped-400 shrink-0" />
        <span className="truncate max-w-[160px]">{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden animate-fade-in max-h-80 overflow-y-auto">
            <button
              onClick={() => { onChange({ kind: 'all' }); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${value.kind === 'all' ? 'bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              All Payroll Groups
              {value.kind === 'all' && <Check className="w-4 h-4 ml-auto text-deped-600 dark:text-deped-400" />}
            </button>

            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700">
              Categories
            </div>
            <button
              onClick={() => { onChange({ kind: 'category', category: 'elementary' }); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${value.kind === 'category' && value.category === 'elementary' ? 'bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              <School className="w-4 h-4 shrink-0" />
              Elementary Payroll
              {value.kind === 'category' && value.category === 'elementary' && <Check className="w-4 h-4 ml-auto text-deped-600 dark:text-deped-400" />}
            </button>
            <button
              onClick={() => { onChange({ kind: 'category', category: 'highschool' }); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${value.kind === 'category' && value.category === 'highschool' ? 'bg-deped-50 dark:bg-deped-900/30 text-deped-700 dark:text-deped-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              <GraduationCap className="w-4 h-4 shrink-0" />
              High School Payroll
              {value.kind === 'category' && value.category === 'highschool' && <Check className="w-4 h-4 ml-auto text-deped-600 dark:text-deped-400" />}
            </button>

          </div>
        </>
      )}
    </div>
  );
}
