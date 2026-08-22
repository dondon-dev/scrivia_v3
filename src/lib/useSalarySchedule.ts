import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, fetchAll } from '@/lib/supabase';

export interface SalaryScheduleEntry {
  id: string;
  tranche: string;
  circular_no: string;
  effective_date: string;
  grade: number;
  step: number;
  monthly_salary: number;
}

/**
 * Loads the salary_schedule table once and exposes a fast
 * grade/step -> monthly_salary lookup plus a per-grade step array.
 * Used across Employees, PositionManagement, EmployeePayrollCard, and ESS.
 */
export function useSalarySchedule() {
  const [entries, setEntries] = useState<SalaryScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ tranche: string; circular_no: string; effective_date: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchAll<SalaryScheduleEntry>(() =>
      supabase.from('salary_schedule')
        .select('*')
        .order('grade', { ascending: true })
        .order('step', { ascending: true })
    );
    setEntries(rows);
    if (rows.length > 0) {
      const first = rows[0];
      setMeta({ tranche: first.tranche, circular_no: first.circular_no, effective_date: first.effective_date });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Map keyed by `${grade}-${step}` -> monthly_salary */
  const salaryMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      m.set(`${e.grade}-${e.step}`, Number(e.monthly_salary));
    }
    return m;
  }, [entries]);

  /** Map keyed by grade -> array of 8 step salaries (index 0 = step 1) */
  const gradeStepMap = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const e of entries) {
      if (!m.has(e.grade)) m.set(e.grade, new Array(8).fill(0));
      const arr = m.get(e.grade)!;
      if (e.step >= 1 && e.step <= 8) arr[e.step - 1] = Number(e.monthly_salary);
    }
    return m;
  }, [entries]);

  /** Look up monthly salary for a grade/step pair. */
  function lookup(grade: number, step: number): number | undefined {
    if (grade <= 0 || step <= 0) return undefined;
    return salaryMap.get(`${grade}-${step}`);
  }

  /** Get the array of 8 step salaries for a grade (empty array if not found). */
  function stepsForGrade(grade: number): number[] {
    return gradeStepMap.get(grade) ?? new Array(8).fill(0);
  }

  return { entries, salaryMap, gradeStepMap, meta, loading, lookup, stepsForGrade, reload: load };
}
