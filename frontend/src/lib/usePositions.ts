import { useState, useEffect, useCallback } from 'react';
import { supabase, fetchAll } from '@/lib/pb';

export interface PositionMgmt {
  id: string;
  position_code: string;
  old_position_code: string;
  position_title: string;
  position_name: string;
  salary_grade: number;
  step1: number; step2: number; step3: number; step4: number;
  step5: number; step6: number; step7: number; step8: number;
  personnel_category: 'Teaching' | 'Teaching Related' | 'Non-Teaching' | 'School Administration';
  position_category_code: string;
  remarks: string;
  status: 'Active' | 'Inactive';
}

/**
 * Loads all active positions from position_management and provides
 * a lookup map keyed by uppercase position_code.
 */
export function usePositions() {
  const [positions, setPositions] = useState<PositionMgmt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAll<PositionMgmt>(
        () => supabase.from('position_management').select('*').eq('status', 'Active').order('position_code')
      );
      setPositions(rows);
    } catch {
      // position_management may not exist yet (migration not applied) —
      // degrade to an empty lookup instead of crashing the view.
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const positionMap = new Map<string, PositionMgmt>();
  for (const p of positions) {
    positionMap.set(p.position_code.toUpperCase(), p);
  }

  /** Look up a position by its code; returns undefined if not found. */
  function lookup(code: string | null | undefined): PositionMgmt | undefined {
    if (!code) return undefined;
    return positionMap.get(code.toUpperCase().trim());
  }

  return { positions, positionMap, loading, lookup, reload: load };
}
