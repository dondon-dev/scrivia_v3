import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/authz';
import { mergeFeatures, type Division, type Region } from '@/types/org';

/**
 * Region / Division context.
 *
 * - Loads the regions + divisions directory once per session.
 * - The selected context (regionId/divisionId) drives division-scoped data:
 *     * super_admin — free to switch to any region/division (persisted), or
 *       select "All Divisions" (divisionId = null).
 *     * everyone else — locked to their assigned region/division.
 * - `scoped` is true whenever a specific division is selected.
 */

const ORG_KEY = 'payrollpro_org';

interface OrgContextValue {
  regions: Region[];
  divisions: Division[];
  loading: boolean;
  regionId: string | null;
  divisionId: string | null;
  selectedRegion: Region | null;
  selectedDivision: Division | null;
  /** True when the signed-in user may switch regions/divisions (super_admin). */
  canSwitch: boolean;
  /** True when a specific division is selected (data should be scoped). */
  scoped: boolean;
  /**
   * Division ids the selected org context resolves to — the selected
   * division, or every division under the selected region. `null` means
   * "All Divisions" (no scoping). Pass this to query filters / RPCs.
   */
  scopedDivisionIds: string[] | null;
  /** REGCODE of the selected region (or null when unscoped). */
  regionCode: string | null;
  /** DIVCODE of the selected division (or null when unscoped / region-level). */
  divisionCode: string | null;
  /**
   * (REGCODE, DIVCODE) pairs the selected org context resolves to — the
   * selected division, or every division under the selected region. These
   * codes are the unique reference for scoping one division's payroll: the
   * masterfile/deduction rows carry REGCODE + DIVCODE columns, so queries
   * match on them. `null` means "All Divisions" (no scoping).
   */
  scopedCodes: { regcode: string; divcode: string }[] | null;
  setRegion: (id: string | null) => void;
  setDivision: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [regions, setRegions] = useState<Region[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string | null>(null);

  const isSuperAdmin = isSuperAdminRole(profile?.role);

  const loadDirectory = useCallback(async () => {
    const [r, d] = await Promise.all([
      supabase.from('regions').select('*').order('sort_order', { ascending: true }),
      supabase.from('divisions').select('*').order('division_name', { ascending: true }),
    ]);
    setRegions((r.data ?? []) as Region[]);
    setDivisions((d.data ?? []) as Division[]);
  }, []);

  const refresh = useCallback(async () => {
    await loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await loadDirectory();
      if (!active) return;
      setLoading(false);
    })();
    return () => { active = false; };
    // Reload when the authenticated user changes (login/logout/profile switch)
    // so the directory is always fetched with a valid session.
  }, [loadDirectory, profile?.id]);

  // Initial selection: own division first, then persisted super_admin choice.
  useEffect(() => {
    if (!profile) return;
    if (!isSuperAdmin) {
      setRegionId(profile.region_id ?? null);
      setDivisionId(profile.division_id ?? null);
      return;
    }
    try {
      const saved = localStorage.getItem(ORG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { regionId?: string | null; divisionId?: string | null };
        setRegionId(parsed.regionId ?? null);
        setDivisionId(parsed.divisionId ?? null);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isSuperAdmin]);

  const setRegion = useCallback((id: string | null) => {
    setRegionId(id);
    setDivisionId(null); // switching region clears the division
    if (isSuperAdmin) {
      localStorage.setItem(ORG_KEY, JSON.stringify({ regionId: id, divisionId: null }));
    }
  }, [isSuperAdmin]);

  const setDivision = useCallback((id: string | null) => {
    setDivisionId(id);
    if (isSuperAdmin) {
      const region = divisions.find((d) => d.id === id);
      localStorage.setItem(ORG_KEY, JSON.stringify({ regionId: region?.region_id ?? regionId, divisionId: id }));
    }
  }, [isSuperAdmin, divisions, regionId]);

  const selectedRegion = useMemo(
    () => regions.find((r) => r.id === regionId) ?? null,
    [regions, regionId],
  );
  const selectedDivision = useMemo(
    () => divisions.find((d) => d.id === divisionId) ?? null,
    [divisions, divisionId],
  );

  // Resolve the selected org context to the set of division ids that data
  // queries should be scoped to: the selected division, or every division
  // under the selected region. null = All Divisions / no scoping.
  const scopedDivisionIds = useMemo<string[] | null>(() => {
    if (divisionId) return [divisionId];
    if (regionId) {
      const ids = divisions.filter((d) => d.region_id === regionId).map((d) => d.id);
      return ids.length > 0 ? ids : null;
    }
    return null;
  }, [divisionId, regionId, divisions]);

  const regionCode = selectedRegion?.region_code ?? null;
  const divisionCode = selectedDivision?.division_code ?? null;

  // Resolve the selected org context to (REGCODE, DIVCODE) pairs — the unique
  // reference used by masterfile/deduction rows. REGCODE + DIVCODE are what
  // actually group a division's payroll, so this is the primary scope key.
  const scopedCodes = useMemo<{ regcode: string; divcode: string }[] | null>(() => {
    if (divisionId) {
      const div = divisions.find((d) => d.id === divisionId);
      const reg = div ? regions.find((r) => r.id === div.region_id) : null;
      if (div?.division_code && reg?.region_code) {
        return [{ regcode: reg.region_code, divcode: div.division_code }];
      }
      return null;
    }
    if (regionId) {
      const reg = regions.find((r) => r.id === regionId);
      if (!reg?.region_code) return null;
      const codes = divisions
        .filter((d) => d.region_id === regionId && d.division_code)
        .map((d) => ({ regcode: reg.region_code as string, divcode: d.division_code as string }));
      return codes.length > 0 ? codes : null;
    }
    return null;
  }, [divisions, regions, regionId, divisionId]);

  const value = useMemo<OrgContextValue>(() => ({
    regions,
    divisions,
    loading,
    regionId,
    divisionId,
    selectedRegion,
    selectedDivision,
    canSwitch: isSuperAdmin,
    scoped: divisionId != null,
    scopedDivisionIds,
    regionCode,
    divisionCode,
    scopedCodes,
    setRegion,
    setDivision,
    refresh,
  }), [regions, divisions, loading, regionId, divisionId, selectedRegion, selectedDivision, isSuperAdmin, scopedDivisionIds, regionCode, divisionCode, scopedCodes, setRegion, setDivision, refresh]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}

/** Merged features of the currently selected division (or null when unscoped). */
export function useDivisionFeatures(): Record<string, boolean> | null {
  const { selectedDivision, scoped } = useOrg();
  return scoped && selectedDivision ? mergeFeatures(selectedDivision.features) : null;
}

/**
 * True when a row (employee/school/user) belongs to the selected org scope.
 * Matches by division_id first, then falls back to the REGCODE + DIVCODE
 * codes carried by legacy masterfile rows (which may have no division_id).
 * Returns true when the org is unscoped ("All Divisions").
 */
export function matchesOrgScope(
  row: { division_id?: string | null; regcode?: string | null; divcode?: string | null },
  ctx: { scopedDivisionIds: string[] | null; scopedCodes: { regcode: string; divcode: string }[] | null },
): boolean {
  const { scopedDivisionIds, scopedCodes } = ctx;
  if (!scopedCodes || scopedCodes.length === 0) return true;
  if (row.division_id && scopedDivisionIds?.includes(row.division_id)) return true;
  const reg = scopedCodes[0].regcode;
  const divCodes = new Set(scopedCodes.map((c) => c.divcode));
  return !!row.regcode && row.regcode === reg && !!row.divcode && divCodes.has(row.divcode);
}

/**
 * Resolve scopedCodes to a single REGCODE + list of DIVCODEs for query filters.
 * Returns nulls when unscoped ("All Divisions") so callers can skip filtering.
 * REGCODE + DIVCODE together are the unique reference for one division's payroll.
 */
export function codeScope(
  scopedCodes: { regcode: string; divcode: string }[] | null,
): { regcode: string | null; divcodes: string[] | null } {
  if (!scopedCodes || scopedCodes.length === 0) return { regcode: null, divcodes: null };
  return {
    regcode: scopedCodes[0].regcode,
    divcodes: [...new Set(scopedCodes.map((c) => c.divcode))],
  };
}

/**
 * True when a row belongs to the selected org scope OR is a legacy/global row
 * that carries no division codes (regcode/divcode both null/empty). Use for
 * tables that only recently gained division codes, so pre-existing shared rows
 * (e.g. national signatories, system-wide audit entries) stay visible while
 * division-coded rows are strictly scoped.
 */
export function matchesScopeOrGlobal(
  row: { regcode?: string | null; divcode?: string | null },
  scopedCodes: { regcode: string; divcode: string }[] | null,
): boolean {
  if (!scopedCodes || scopedCodes.length === 0) return true;
  if (!row.regcode || !row.divcode) return true; // legacy / global row
  return scopedCodes.some((c) => c.regcode === row.regcode && c.divcode === row.divcode);
}
