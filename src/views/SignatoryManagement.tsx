import { useState, useEffect, useCallback } from 'react';
import { Save, Plus, Trash2, CheckCircle2, Circle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg, codeScope, matchesOrgScope } from '@/lib/org';
import { SIGNATORY_ROLES, type Signatory } from '@/types/initialPayroll';
import { useAuth } from '@/lib/auth';

export default function SignatoryManagement() {
  const { logAudit } = useAuth();
  const { scopedCodes } = useOrg();
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const loadSignatories = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('signatories').select('*').order('created_at');
    if (error) { setSaveMsg(`Error: ${error.message}`); }
    // Signatories carry REGCODE/DIVCODE (stamped on insert/update). Strict
    // scoping: a division only sees its own signatories — uncoded rows stay
    // visible to the super administrator's "All Divisions" view only, so no
    // division's signatories can leak into another division's view.
    const scoped = ((data ?? []) as Signatory[]).filter((s) => matchesOrgScope(s, { scopedDivisionIds: null, scopedCodes }));
    setSignatories(scoped);
    setLoading(false);
  }, [scopedCodes]);

  useEffect(() => { loadSignatories(); }, [loadSignatories]);

  function getSignatory(role: Signatory['role']): Signatory | undefined {
    return signatories.find((s) => s.role === role);
  }

  function updateField(role: Signatory['role'], field: keyof Signatory, value: string | boolean) {
    setSignatories((prev) => {
      const existing = prev.find((s) => s.role === role);
      if (existing) {
        return prev.map((s) => (s.role === role ? { ...s, [field]: value } : s));
      }
      const newSig: Signatory = {
        id: '',
        role,
        name: field === 'name' ? (value as string) : '',
        position: field === 'position' ? (value as string) : null,
        office: field === 'office' ? (value as string) : null,
        is_active: field === 'is_active' ? (value as boolean) : true,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      return [...prev, newSig];
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    // Auto-assign the acting division's REGCODE/DIVCODE on new signatories
    // (the DB trigger covers division admins; this covers the super
    // administrator working inside a selected division).
    const scope = codeScope(scopedCodes);
    const stamp = scope.regcode && scope.divcodes && scope.divcodes.length === 1
      ? { regcode: scope.regcode, divcode: scope.divcodes[0] }
      : {};
    let changes = 0;
    for (const s of signatories) {
      const payload = {
        role: s.role,
        name: s.name,
        position: s.position,
        office: s.office,
        is_active: s.is_active,
        updated_at: new Date().toISOString(),
      };
      if (s.id) {
        const { error } = await supabase.from('signatories').update(payload).eq('id', s.id);
        if (error) { setSaveMsg(`Error saving ${s.role}: ${error.message}`); setSaving(false); return; }
        changes++;
      } else {
        const { error } = await supabase.from('signatories').insert({ ...payload, ...stamp });
        if (error) { setSaveMsg(`Error adding ${s.role}: ${error.message}`); setSaving(false); return; }
        changes++;
      }
    }
    if (changes > 0) {
      await logAudit('signatory_change', 'signatories', undefined, { changes });
    }
    setSaveMsg(`Saved ${changes} signator${changes === 1 ? 'y' : 'ies'} successfully.`);
    setSaving(false);
    loadSignatories();
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Signatory Management</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              These signatories appear on payroll printouts, Excel exports, and PDF exports.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadSignatories}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-deped-600 hover:bg-deped-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save All'}
            </button>
          </div>
        </div>

        {saveMsg && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${
            saveMsg.startsWith('Error')
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {saveMsg}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading signatories...</div>
        ) : (
          <div className="space-y-4">
            {SIGNATORY_ROLES.map(({ key, label }) => {
              const s = getSignatory(key);
              return (
                <div key={key} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-200">{label}</h3>
                    <button
                      onClick={() => updateField(key, 'is_active', !(s?.is_active ?? true))}
                      className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
                    >
                      {s?.is_active ?? true ? (
                        <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Active</>
                      ) : (
                        <><Circle className="w-4 h-4 text-slate-400" /> Inactive</>
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Name</label>
                      <input
                        type="text"
                        value={s?.name ?? ''}
                        onChange={(e) => updateField(key, 'name', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 outline-none"
                        placeholder="Full name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Position</label>
                      <input
                        type="text"
                        value={s?.position ?? ''}
                        onChange={(e) => updateField(key, 'position', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 outline-none"
                        placeholder="Position title"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Office</label>
                      <input
                        type="text"
                        value={s?.office ?? ''}
                        onChange={(e) => updateField(key, 'office', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-deped-500/30 focus:border-deped-500 outline-none"
                        placeholder="Office / Department"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
