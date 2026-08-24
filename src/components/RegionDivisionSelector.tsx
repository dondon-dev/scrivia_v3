import { Globe, Building2, Lock } from 'lucide-react';
import { useOrg } from '@/lib/org';

/**
 * Region → Division selector for the app shell (sidebar top).
 *
 * - super_admin: switch to any region/division (or "All Divisions").
 * - everyone else: locked to their assigned region/division.
 * Selecting a division scopes the payroll interface to that division.
 */
export default function RegionDivisionSelector() {
  const {
    regions, divisions, loading, regionId, divisionId,
    selectedRegion, selectedDivision, canSwitch, setRegion, setDivision,
    regionCode, divisionCode, scopedCodes,
  } = useOrg();

  const visibleDivisions = regionId
    ? divisions.filter((d) => d.region_id === regionId)
    : divisions;

  if (loading) {
    return (
      <div className="px-3 py-2 border-b border-gray-300">
        <div className="h-9 rounded-lg bg-gray-400 animate-pulse" />
      </div>
    );
  }

  if (regions.length === 0) {
    return (
      <div className="px-3 py-2 border-b border-gray-300">
        <p className="text-[10px] text-gray-700 leading-relaxed">
          No regions configured. A Super Administrator can add them under Organization → Regions &amp; Divisions.
        </p>
      </div>
    );
  }

  const selectCls =
    'w-full pl-7 pr-2 py-2 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#6495ED]/20 focus:border-[#6495ED] appearance-none truncate transition-all';

  return (
    <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 space-y-1.5">
      <div className="relative">
        <Globe className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
        <select
          value={regionId ?? ''}
          onChange={(e) => setRegion(e.target.value || null)}
          disabled={!canSwitch}
          title="Region"
          className={`${selectCls} bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200`}
        >
          {canSwitch && <option value="">All Regions</option>}
          {regions.map((r) => (
            <option key={r.id} value={r.id} className="text-slate-800">
              {r.region_name || r.region_code}{r.region_code ? `  [${r.region_code}]` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="relative">
        <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-deped-300 pointer-events-none" />
        <select
          value={divisionId ?? ''}
          onChange={(e) => setDivision(e.target.value || null)}
          disabled={!canSwitch}
          title="Division"
          className={`${selectCls} bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200`}
        >
          {canSwitch && <option value="">All Divisions</option>}
          {!canSwitch && <option value="">{selectedDivision ? selectedDivision.division_name : 'No division assigned'}</option>}
          {visibleDivisions.map((d) => (
            <option key={d.id} value={d.id} className="text-slate-800">
              {d.division_name || d.division_code}{d.division_code ? `  [${d.division_code}]` : ''}
            </option>
          ))}
        </select>
        {!canSwitch && (
          <Lock className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none" />
        )}
      </div>

      {scopedCodes && scopedCodes.length > 0 && (
        <p className="px-1 text-[9px] font-mono text-gray-400 dark:text-gray-500 leading-tight">
          REGCODE {regionCode ?? '—'}{divisionCode ? ` · DIVCODE ${divisionCode}` : ` · ${scopedCodes.length} divisions`}
        </p>
      )}
    </div>
  );
}
