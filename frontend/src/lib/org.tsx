/**
 * Organization Provider — adapted for PocketBase.
 * Same public API as the Supabase version.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { pb } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/authz';
import { mergeFeatures, type Division, type Region } from '@/types/org';

const ORG_KEY = 'payrollpro_org';

interface OrgContextValue {
  regions: Region[];
  divisions: Division[];
  loading: boolean;
  regionId: string | null;
  divisionId: string | null;
  selectedRegion: Region | null;
  selectedDivision: Division | null;
  canSwitch: boolean;
  scoped: boolean;
  scopedDivisionIds: string[] | null;
  regionCode: string | null;
  divisionCode: string | null;
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
    try {
      const [rResult, dResult] = await Promise.all([
        pb.collection('regions').getFullList({ sort: 'sort_order' }),
        pb.collection('divisions').getFullList({ sort: 'division_name' }),
      ]);
      setRegions(rResult as unknown as Region[]);
      setDivisions(dResult as unknown as Division[]);
    } catch {
      setRegions([]);
      setDivisions([]);
    }
  }, []);

  const refresh = useCallback(async () => { await loadDirectory(); }, [loadDirectory]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await loadDirectory();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [loadDirectory, profile?.id]);

  // Initial selection
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
        const parsed = JSON.parse(saved);
        setRegionId(parsed.regionId ?? null);
        setDivisionId(parsed.divisionId ?? null);
      }
    } catch { /* ignore */ }
  }, [profile?.id, isSuperAdmin]);

  const setRegion = useCallback((id: string | null) => {
    setRegionId(id);
    setDivisionId(null);
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

  const selectedRegion = useMemo(() => regions.find((r) => r.id === regionId) ?? null, [regions, regionId]);
  const selectedDivision = useMemo(() => divisions.find((d) => d.id === divisionId) ?? null, [divisions, divisionId]);

  const scopedDivisionIds = useMemo<string[] | null>(() => {
    if (divisionId) return [divisionId];
    if (regionId) {
      const ids = divisions.filter((d) => d.region_id === regionId).map((d) => d.id);
      return ids.length > 0 ? ids : null;
    }
    return null;
  }, [divisionId, regionId, divisions]);

  const scopedCodes = useMemo(() => {
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
      return divisions
        .filter((d) => d.region_id === regionId && d.division_code)
        .map((d) => ({ regcode: reg.region_code!, divcode: d.division_code }));
    }
    return null;
  }, [divisions, regions, regionId, divisionId]);

  const value = useMemo<OrgContextValue>(() => ({
    regions, divisions, loading, regionId, divisionId,
    selectedRegion, selectedDivision,
    canSwitch: isSuperAdmin, scoped: divisionId != null,
    scopedDivisionIds,
    regionCode: selectedRegion?.region_code ?? null,
    divisionCode: selectedDivision?.division_code ?? null,
    scopedCodes,
    setRegion, setDivision, refresh,
  }), [regions, divisions, loading, regionId, divisionId, selectedRegion, selectedDivision, isSuperAdmin, scopedDivisionIds, scopedCodes, setRegion, setDivision, refresh]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}

/** Build a REGCODE/DIVCODE filter from the scoped codes array. */
export function codeScope(
  scopedCodes: { regcode: string; divcode: string }[] | null,
): { regcode: string | null; divcodes: string[] | null } {
  if (!scopedCodes || scopedCodes.length === 0) {
    return { regcode: null, divcodes: null };
  }
  const regcode = scopedCodes[0]?.regcode ?? null;
  const divcodes = [...new Set(scopedCodes.map((c) => c.divcode))];
  return { regcode, divcodes };
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
