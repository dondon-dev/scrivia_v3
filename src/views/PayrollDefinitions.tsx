import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LoadingIndicator from '@/components/LoadingIndicator';
import {
  Settings, Plus, Pencil, Trash2, X, Save,
  ChevronDown, ChevronRight, Calculator, BookOpen,
  AlertTriangle, CheckCircle2, Info, GripVertical,
  ToggleLeft, ToggleRight, Hash, Type, Calendar,
  DollarSign, Percent, Zap, Eye, EyeOff, Copy,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import { supabase, fetchAll } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import type {
  PayrollDefinition,
  PayrollFormula,
  PayrollFieldCategory,
  PayrollFieldType,
} from '@/types/payroll';

// ── Constants ──────────────────────────────────────────────────────────────

const FIELD_CATEGORY_LABELS: Record<PayrollFieldCategory, string> = {
  earnings: 'Earnings',
  mandatory_deductions: 'Mandatory Deductions',
  voluntary_deductions: 'Voluntary Deductions',
  government_share: 'Government Share',
  tax: 'Tax',
  net_pay: 'Net Pay',
  metadata: 'Metadata',
  adjustments: 'Adjustments',
};

const FIELD_TYPE_ICONS: Record<PayrollFieldType, typeof DollarSign> = {
  currency: DollarSign,
  number: Hash,
  text: Type,
  date: Calendar,
  percentage: Percent,
  computed: Zap,
};

const FIELD_TYPE_COLORS: Record<PayrollFieldType, string> = {
  currency: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  number: 'bg-blue-50 text-blue-700 border-blue-200',
  text: 'bg-slate-100 text-slate-600 border-slate-200',
  date: 'bg-violet-50 text-violet-700 border-violet-200',
  percentage: 'bg-amber-50 text-amber-700 border-amber-200',
  computed: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const CATEGORY_COLORS: Record<PayrollFieldCategory, string> = {
  earnings: 'bg-emerald-100 text-emerald-800',
  mandatory_deductions: 'bg-rose-100 text-rose-800',
  voluntary_deductions: 'bg-amber-100 text-amber-800',
  government_share: 'bg-blue-100 text-blue-800',
  tax: 'bg-red-100 text-red-800',
  net_pay: 'bg-teal-100 text-teal-800',
  metadata: 'bg-slate-200 text-slate-700',
  adjustments: 'bg-violet-100 text-violet-800',
};

// ── Default definitions seeded on first load ───────────────────────────────

const DEFAULT_DEFINITIONS: Omit<PayrollDefinition, 'id' | 'created_at' | 'updated_at' | 'created_by'>[] = [
  { field_code: 'gross_pay', field_label: 'Gross Pay', field_type: 'currency', field_category: 'earnings', description: 'Basic salary prorated to days present', default_value: 0, is_required: true, is_computed: true, is_visible: true, sort_order: 1, status: 'Active' },
  { field_code: 'pera', field_label: 'PERA', field_type: 'currency', field_category: 'earnings', description: 'Personal Economic Relief Allowance (₱2,000/month or prorated)', default_value: 2000, is_required: false, is_computed: true, is_visible: true, sort_order: 2, status: 'Active' },
  { field_code: 'hazard_pay', field_label: 'Hazard Pay', field_type: 'currency', field_category: 'earnings', description: 'Hazard pay for eligible positions', default_value: 0, is_required: false, is_computed: false, is_visible: true, sort_order: 3, status: 'Active' },
  { field_code: 'salary_differential', field_label: 'Salary Differential', field_type: 'currency', field_category: 'earnings', description: 'Salary differential for promoted/reclassified employees', default_value: 0, is_required: false, is_computed: false, is_visible: true, sort_order: 4, status: 'Active' },
  { field_code: 'other_compensation', field_label: 'Other Compensation', field_type: 'currency', field_category: 'earnings', description: 'Other compensation amounts', default_value: 0, is_required: false, is_computed: false, is_visible: true, sort_order: 5, status: 'Active' },
  { field_code: 'other_earnings', field_label: 'Other Earnings', field_type: 'currency', field_category: 'earnings', description: 'Miscellaneous earnings', default_value: 0, is_required: false, is_computed: false, is_visible: true, sort_order: 6, status: 'Active' },

  { field_code: 'ded_gsis', field_label: 'GSIS (Employee Share)', field_type: 'currency', field_category: 'mandatory_deductions', description: 'GSIS premium = gross_pay × 9%', default_value: 0, is_required: true, is_computed: true, is_visible: true, sort_order: 10, status: 'Active' },
  { field_code: 'ded_philhealth', field_label: 'PhilHealth (Employee Share)', field_type: 'currency', field_category: 'mandatory_deductions', description: 'PhilHealth = monthly_salary × premium_rate ÷ 2', default_value: 0, is_required: true, is_computed: true, is_visible: true, sort_order: 11, status: 'Active' },
  { field_code: 'ded_pagibig', field_label: 'Pag-IBIG', field_type: 'currency', field_category: 'mandatory_deductions', description: 'Pag-IBIG contribution (fixed ₱200 or computed)', default_value: 200, is_required: true, is_computed: true, is_visible: true, sort_order: 12, status: 'Active' },
  { field_code: 'ded_tax', field_label: 'Withholding Tax (BIR)', field_type: 'currency', field_category: 'tax', description: 'Monthly BIR TRAIN Law withholding tax', default_value: 0, is_required: true, is_computed: true, is_visible: true, sort_order: 13, status: 'Active' },
  { field_code: 'ded_gsis_policy', field_label: 'GSIS Policy Loan', field_type: 'currency', field_category: 'voluntary_deductions', description: 'GSIS policy loan amortization', default_value: 0, is_required: false, is_computed: false, is_visible: true, sort_order: 20, status: 'Active' },
  { field_code: 'ded_gsis_emergency', field_label: 'GSIS Emergency Loan', field_type: 'currency', field_category: 'voluntary_deductions', description: 'GSIS emergency loan amortization', default_value: 0, is_required: false, is_computed: false, is_visible: true, sort_order: 21, status: 'Active' },
  { field_code: 'ded_pagibig_mpl', field_label: 'Pag-IBIG MPL', field_type: 'currency', field_category: 'voluntary_deductions', description: 'Pag-IBIG Multi-Purpose Loan', default_value: 0, is_required: false, is_computed: false, is_visible: true, sort_order: 22, status: 'Active' },
  { field_code: 'ded_pagibig_calamity', field_label: 'Pag-IBIG Calamity Loan', field_type: 'currency', field_category: 'voluntary_deductions', description: 'Pag-IBIG calamity loan amortization', default_value: 0, is_required: false, is_computed: false, is_visible: true, sort_order: 23, status: 'Active' },
  { field_code: 'total_deductions', field_label: 'Total Deductions', field_type: 'currency', field_category: 'mandatory_deductions', description: 'Sum of all deductions', default_value: 0, is_required: true, is_computed: true, is_visible: true, sort_order: 30, status: 'Active' },

  { field_code: 'govt_gsis', field_label: 'GSIS (Government Share)', field_type: 'currency', field_category: 'government_share', description: 'GSIS government share contribution', default_value: 0, is_required: false, is_computed: true, is_visible: true, sort_order: 40, status: 'Active' },
  { field_code: 'govt_philhealth', field_label: 'PhilHealth (Government Share)', field_type: 'currency', field_category: 'government_share', description: 'PhilHealth government share', default_value: 0, is_required: false, is_computed: true, is_visible: true, sort_order: 41, status: 'Active' },
  { field_code: 'govt_pagibig', field_label: 'Pag-IBIG (Government Share)', field_type: 'currency', field_category: 'government_share', description: 'Pag-IBIG employer contribution', default_value: 0, is_required: false, is_computed: true, is_visible: true, sort_order: 42, status: 'Active' },

  { field_code: 'net_pay', field_label: 'Net Pay', field_type: 'currency', field_category: 'net_pay', description: 'Amount due after all deductions', default_value: 0, is_required: true, is_computed: true, is_visible: true, sort_order: 50, status: 'Active' },
];

const DEFAULT_FORMULAS: Omit<PayrollFormula, 'id' | 'created_at' | 'updated_at' | 'created_by'>[] = [
  { formula_name: 'GSIS Employee Share', output_field_code: 'ded_gsis', expression: 'ROUND(gross_pay * 0.09, 2)', description: '9% of gross salary', computation_order: 1, version: 1, is_active: true },
  { formula_name: 'PhilHealth Employee Share', output_field_code: 'ded_philhealth', expression: 'ROUND(monthly_salary * philhealth_rate / 2, 2)', description: 'Half of premium rate × monthly salary', computation_order: 2, version: 1, is_active: true },
  { formula_name: 'Pag-IBIG Contribution', output_field_code: 'ded_pagibig', expression: 'IF(gross_pay > 0, 200, 0)', description: 'Fixed ₱200 when days present > 2', computation_order: 3, version: 1, is_active: true },
  { formula_name: 'Total Deductions', output_field_code: 'total_deductions', expression: 'ded_gsis + ded_philhealth + ded_pagibig + ded_tax + other_deductions', description: 'Sum of mandatory + voluntary + tax deductions', computation_order: 4, version: 1, is_active: true },
  { formula_name: 'Net Pay', output_field_code: 'net_pay', expression: 'gross_pay + pera - total_deductions', description: 'Gross pay + PERA minus total deductions', computation_order: 5, version: 1, is_active: true },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function fieldCodeExists(defs: PayrollDefinition[], code: string, excludeId?: string): boolean {
  return defs.some((d) => d.field_code === code && d.id !== excludeId);
}

function sortDefinitions(defs: PayrollDefinition[]): PayrollDefinition[] {
  return [...defs].sort((a, b) => {
    const catOrder = Object.keys(FIELD_CATEGORY_LABELS).indexOf(a.field_category) -
                     Object.keys(FIELD_CATEGORY_LABELS).indexOf(b.field_category);
    if (catOrder !== 0) return catOrder;
    return a.sort_order - b.sort_order;
  });
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PayrollDefinitions() {
  const { logAudit } = useAuth();
  const [definitions, setDefinitions] = useState<PayrollDefinition[]>([]);
  const [formulas, setFormulas] = useState<PayrollFormula[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Definition modal
  const [defModalOpen, setDefModalOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<PayrollDefinition | null>(null);
  const [defForm, setDefForm] = useState({
    field_code: '', field_label: '', field_type: 'currency' as PayrollFieldType,
    field_category: 'earnings' as PayrollFieldCategory, description: '',
    default_value: '', is_required: false, is_computed: false, is_visible: true,
    sort_order: 0, status: 'Active' as 'Active' | 'Inactive',
  });

  // Formula modal
  const [formulaModalOpen, setFormulaModalOpen] = useState(false);
  const [editingFormula, setEditingFormula] = useState<PayrollFormula | null>(null);
  const [formulaForm, setFormulaForm] = useState({
    formula_name: '', output_field_code: '', expression: '',
    description: '', computation_order: 0, is_active: true,
  });

  // Expanded category rows
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(Object.keys(FIELD_CATEGORY_LABELS)));

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'definition' | 'formula'; item: PayrollDefinition | PayrollFormula } | null>(null);

  const flash = useCallback((msg: string, isError = false) => {
    if (isError) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(null); setSuccess(null); }, 4000);
  }, []);

  // ── Load data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [defs, fmls] = await Promise.all([
        fetchAll<PayrollDefinition>(() =>
          supabase.from('payroll_definitions').select('*').order('sort_order', { ascending: true })
        ),
        fetchAll<PayrollFormula>(() =>
          supabase.from('payroll_formulas').select('*').order('computation_order', { ascending: true })
        ),
      ]);

      // If no definitions exist, seed defaults
      if (defs.length === 0) {
        const { data: seeded } = await supabase
          .from('payroll_definitions')
          .insert(DEFAULT_DEFINITIONS.map((d) => ({
            ...d,
            created_by: 'system',
          })))
          .select();
        if (seeded) defs.push(...seeded);
      }

      if (fmls.length === 0) {
        const { data: seeded } = await supabase
          .from('payroll_formulas')
          .insert(DEFAULT_FORMULAS.map((f) => ({
            ...f,
            created_by: 'system',
          })))
          .select();
        if (seeded) fmls.push(...seeded);
      }

      setDefinitions(sortDefinitions(defs));
      setFormulas(fmls);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to load data', true);
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Definition CRUD ────────────────────────────────────────────────────

  function openCreateDef() {
    setEditingDef(null);
    setDefForm({
      field_code: '', field_label: '', field_type: 'currency',
      field_category: 'earnings', description: '', default_value: '',
      is_required: false, is_computed: false, is_visible: true,
      sort_order: definitions.length * 10, status: 'Active',
    });
    setDefModalOpen(true);
  }

  function openEditDef(def: PayrollDefinition) {
    setEditingDef(def);
    setDefForm({
      field_code: def.field_code, field_label: def.field_label,
      field_type: def.field_type, field_category: def.field_category,
      description: def.description ?? '', default_value: def.default_value?.toString() ?? '',
      is_required: def.is_required, is_computed: def.is_computed,
      is_visible: def.is_visible, sort_order: def.sort_order, status: def.status,
    });
    setDefModalOpen(true);
  }

  async function saveDef() {
    if (!defForm.field_code.trim() || !defForm.field_label.trim()) {
      flash('Field code and label are required', true);
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(defForm.field_code.trim())) {
      flash('Field code must start with a lowercase letter and contain only a-z, 0-9, underscores', true);
      return;
    }
    if (fieldCodeExists(definitions, defForm.field_code.trim(), editingDef?.id)) {
      flash('Field code already exists', true);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        field_code: defForm.field_code.trim(),
        field_label: defForm.field_label.trim(),
        field_type: defForm.field_type,
        field_category: defForm.field_category,
        description: defForm.description.trim() || null,
        default_value: defForm.default_value ? Number(defForm.default_value) : null,
        is_required: defForm.is_required,
        is_computed: defForm.is_computed,
        is_visible: defForm.is_visible,
        sort_order: defForm.sort_order,
        status: defForm.status,
      };

      if (editingDef) {
        const { error: upErr } = await supabase
          .from('payroll_definitions')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingDef.id);
        if (upErr) throw upErr;
        await logAudit('payroll_def_update', 'payroll_definitions', editingDef.id, payload);
        flash('Definition updated');
      } else {
        const { error: insErr } = await supabase
          .from('payroll_definitions')
          .insert({ ...payload, created_by: 'system' });
        if (insErr) throw insErr;
        await logAudit('payroll_def_create', 'payroll_definitions', undefined, payload);
        flash('Definition created');
      }
      setDefModalOpen(false);
      await loadData();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Save failed', true);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDef(def: PayrollDefinition) {
    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from('payroll_definitions')
        .delete()
        .eq('id', def.id);
      if (delErr) throw delErr;
      // Also remove related formulas
      await supabase.from('payroll_formulas').delete().eq('output_field_code', def.field_code);
      await logAudit('payroll_def_delete', 'payroll_definitions', def.id, { field_code: def.field_code });
      flash('Definition deleted');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Delete failed', true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleDefStatus(def: PayrollDefinition) {
    const newStatus = def.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await supabase
        .from('payroll_definitions')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', def.id);
      await logAudit('payroll_def_toggle', 'payroll_definitions', def.id, { status: newStatus });
      await loadData();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Toggle failed', true);
    }
  }

  // ── Formula CRUD ───────────────────────────────────────────────────────

  function openCreateFormula() {
    setEditingFormula(null);
    setFormulaForm({
      formula_name: '', output_field_code: '',
      expression: '', description: '',
      computation_order: formulas.length * 10, is_active: true,
    });
    setFormulaModalOpen(true);
  }

  function openEditFormula(fml: PayrollFormula) {
    setEditingFormula(fml);
    setFormulaForm({
      formula_name: fml.formula_name,
      output_field_code: fml.output_field_code,
      expression: fml.expression,
      description: fml.description ?? '',
      computation_order: fml.computation_order,
      is_active: fml.is_active,
    });
    setFormulaModalOpen(true);
  }

  async function saveFormula() {
    if (!formulaForm.formula_name.trim() || !formulaForm.output_field_code || !formulaForm.expression.trim()) {
      flash('Name, output field, and expression are required', true);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        formula_name: formulaForm.formula_name.trim(),
        output_field_code: formulaForm.output_field_code,
        expression: formulaForm.expression.trim(),
        description: formulaForm.description.trim() || null,
        computation_order: formulaForm.computation_order,
        is_active: formulaForm.is_active,
        version: (editingFormula?.version ?? 0) + 1,
      };

      if (editingFormula) {
        const { error: upErr } = await supabase
          .from('payroll_formulas')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingFormula.id);
        if (upErr) throw upErr;
        await logAudit('payroll_formula_update', 'payroll_formulas', editingFormula.id, payload);
        flash('Formula updated');
      } else {
        const { error: insErr } = await supabase
          .from('payroll_formulas')
          .insert({ ...payload, created_by: 'system' });
        if (insErr) throw insErr;
        await logAudit('payroll_formula_create', 'payroll_formulas', undefined, payload);
        flash('Formula created');
      }
      setFormulaModalOpen(false);
      await loadData();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Save failed', true);
    } finally {
      setSaving(false);
    }
  }

  async function deleteFormula(fml: PayrollFormula) {
    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from('payroll_formulas')
        .delete()
        .eq('id', fml.id);
      if (delErr) throw delErr;
      await logAudit('payroll_formula_delete', 'payroll_formulas', fml.id, { formula_name: fml.formula_name });
      flash('Formula deleted');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Delete failed', true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleFormulaActive(fml: PayrollFormula) {
    try {
      await supabase
        .from('payroll_formulas')
        .update({ is_active: !fml.is_active, updated_at: new Date().toISOString() })
        .eq('id', fml.id);
      await loadData();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Toggle failed', true);
    }
  }

  // ── Group definitions by category ──────────────────────────────────────

  const grouped = Object.entries(FIELD_CATEGORY_LABELS).map(([cat, label]) => ({
    category: cat as PayrollFieldCategory,
    label,
    definitions: definitions.filter((d) => d.field_category === cat),
  }));

  const activeDefCount = definitions.filter((d) => d.status === 'Active').length;
  const activeFmlCount = formulas.filter((f) => f.is_active).length;
  const computedCount = definitions.filter((d) => d.is_computed).length;

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <LoadingIndicator />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Settings className="w-6 h-6 text-deped-600" />
            Payroll Definitions & Formulas
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure payroll fields, categories, and computation formulas.
            <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
              Super Admin Only
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateFormula}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
          >
            <Calculator className="w-4 h-4" />
            Add Formula
          </button>
          <button
            onClick={openCreateDef}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-deped-600 text-white text-sm font-semibold hover:bg-deped-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Definition
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Fields', value: definitions.length, color: 'text-slate-700' },
          { label: 'Active Fields', value: activeDefCount, color: 'text-emerald-700' },
          { label: 'Computed Fields', value: computedCount, color: 'text-cyan-700' },
          { label: 'Active Formulas', value: activeFmlCount, color: 'text-blue-700' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Flash messages */}
      <AnimatePresence>
        {(error || success) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
              error
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            {error ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {error || success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Definitions by Category ────────────────────────────────────── */}
      <div className="space-y-3">
        {grouped.map(({ category, label, definitions: catDefs }) => (
          <div key={category} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Category header */}
            <button
              onClick={() => {
                const next = new Set(expandedCategories);
                if (next.has(category)) next.delete(category); else next.add(category);
                setExpandedCategories(next);
              }}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {expandedCategories.has(category) ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLORS[category]}`}>
                  {label}
                </span>
                <span className="text-xs text-slate-400">{catDefs.length} field{catDefs.length !== 1 ? 's' : ''}</span>
              </div>
            </button>

            {/* Definition rows */}
            <AnimatePresence>
              {expandedCategories.has(category) && catDefs.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {/* Table header */}
                    <div className="hidden md:grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_0.8fr_1.2fr] gap-2 px-5 py-2 bg-slate-50 dark:bg-slate-800/40 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                      <span>Field</span>
                      <span>Code</span>
                      <span>Type</span>
                      <span>Default</span>
                      <span>Computed</span>
                      <span>Status</span>
                      <span className="text-right">Actions</span>
                    </div>

                    {catDefs.map((def) => {
                      const TypeIcon = FIELD_TYPE_ICONS[def.field_type];
                      const fml = formulas.find((f) => f.output_field_code === def.field_code);
                      return (
                        <div
                          key={def.id}
                          className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_0.8fr_1.2fr] gap-2 px-5 py-3 items-center border-b border-slate-50 dark:border-slate-800/50 last:border-b-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                        >
                          {/* Field label + visibility */}
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-3.5 h-3.5 text-slate-300 hidden md:block" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{def.field_label}</span>
                                {def.is_visible ? (
                                  <Eye className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                                )}
                              </div>
                              {def.description && (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[200px]">{def.description}</p>
                              )}
                            </div>
                          </div>

                          {/* Code */}
                          <span className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{def.field_code}</span>

                          {/* Type */}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${FIELD_TYPE_COLORS[def.field_type]}`}>
                            <TypeIcon className="w-3 h-3" />
                            {def.field_type}
                          </span>

                          {/* Default */}
                          <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                            {def.default_value != null ? Number(def.default_value).toLocaleString() : '—'}
                          </span>

                          {/* Computed */}
                          <span className={`text-xs font-medium ${def.is_computed ? 'text-cyan-600' : 'text-slate-400'}`}>
                            {def.is_computed ? (
                              <span className="inline-flex items-center gap-1"><Zap className="w-3 h-3" /> Formula</span>
                            ) : 'Manual'}
                          </span>

                          {/* Status toggle */}
                          <button
                            onClick={() => toggleDefStatus(def)}
                            className="flex items-center"
                            title={`Click to ${def.status === 'Active' ? 'deactivate' : 'activate'}`}
                          >
                            {def.status === 'Active' ? (
                              <ToggleRight className="w-6 h-6 text-emerald-500" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-slate-300" />
                            )}
                          </button>

                          {/* Actions */}
                          <div className="flex items-center gap-1 justify-end">
                            {def.is_computed && fml && (
                              <button
                                onClick={() => openEditFormula(fml)}
                                className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                title="Edit formula"
                              >
                                <Calculator className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => openEditDef(def)}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Edit definition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ type: 'definition', item: def })}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                              title="Delete definition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* ── Formulas List ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Computation Formulas</h3>
            <span className="text-xs text-slate-400">({formulas.length})</span>
          </div>
          <button
            onClick={openCreateFormula}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Formula
          </button>
        </div>

        {formulas.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            No formulas configured. Add formulas to define how computed fields are calculated.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {formulas.sort((a, b) => a.computation_order - b.computation_order).map((fml) => {
              const targetDef = definitions.find((d) => d.field_code === fml.output_field_code);
              return (
                <div key={fml.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                    {fml.computation_order}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fml.formula_name}</span>
                      {!fml.is_active && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[11px] text-slate-400">Output:</span>
                      <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
                        {fml.output_field_code}
                      </span>
                      {targetDef && (
                        <span className="text-[11px] text-slate-400">→ {targetDef.field_label}</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:block bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5 max-w-xs truncate">
                    <code className="text-[11px] font-mono text-slate-600 dark:text-slate-400">{fml.expression}</code>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleFormulaActive(fml)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title={fml.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {fml.is_active ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5 text-slate-300" />}
                    </button>
                    <button
                      onClick={() => openEditFormula(fml)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ type: 'formula', item: fml })}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>Field codes</strong> are used in formula expressions (e.g., <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">gross_pay * 0.09</code>).
          Formulas are evaluated in <strong>computation_order</strong> — lower numbers run first so dependencies resolve correctly.
          Computed fields cannot be manually edited during payroll processing.
        </span>
      </div>

      {/* ═══ Definition Modal ════════════════════════════════════════════ */}
      <AnimatePresence>
        {defModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setDefModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {editingDef ? 'Edit Definition' : 'New Definition'}
                </h3>
                <button onClick={() => setDefModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Field Code *</label>
                    <input
                      value={defForm.field_code}
                      onChange={(e) => setDefForm({ ...defForm, field_code: e.target.value })}
                      disabled={!!editingDef}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="e.g. gross_pay"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Field Label *</label>
                    <input
                      value={defForm.field_label}
                      onChange={(e) => setDefForm({ ...defForm, field_label: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Gross Pay"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Type</label>
                    <select
                      value={defForm.field_type}
                      onChange={(e) => setDefForm({ ...defForm, field_type: e.target.value as PayrollFieldType })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      {(Object.keys(FIELD_TYPE_ICONS) as PayrollFieldType[]).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Category</label>
                    <select
                      value={defForm.field_category}
                      onChange={(e) => setDefForm({ ...defForm, field_category: e.target.value as PayrollFieldCategory })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      {(Object.entries(FIELD_CATEGORY_LABELS) as [PayrollFieldCategory, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Description</label>
                  <textarea
                    value={defForm.description}
                    onChange={(e) => setDefForm({ ...defForm, description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Help text for this field"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Default Value</label>
                    <input
                      type="number"
                      value={defForm.default_value}
                      onChange={(e) => setDefForm({ ...defForm, default_value: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Sort Order</label>
                    <input
                      type="number"
                      value={defForm.sort_order}
                      onChange={(e) => setDefForm({ ...defForm, sort_order: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {([
                    { key: 'is_required' as const, label: 'Required' },
                    { key: 'is_computed' as const, label: 'Computed (formula-driven)' },
                    { key: 'is_visible' as const, label: 'Visible on register' },
                  ] as const).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={defForm[key]}
                        onChange={(e) => setDefForm({ ...defForm, [key]: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
                <button onClick={() => setDefModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={saveDef}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-deped-600 text-white text-sm font-semibold hover:bg-deped-700 transition-colors disabled:opacity-50"
                >
                  {saving ? <LoadingIndicator size={40} /> : <Save className="w-4 h-4" />}
                  {editingDef ? 'Update' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Formula Modal ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {formulaModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setFormulaModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {editingFormula ? 'Edit Formula' : 'New Formula'}
                </h3>
                <button onClick={() => setFormulaModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Formula Name *</label>
                  <input
                    value={formulaForm.formula_name}
                    onChange={(e) => setFormulaForm({ ...formulaForm, formula_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. GSIS Employee Share"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Output Field *</label>
                    <select
                      value={formulaForm.output_field_code}
                      onChange={(e) => setFormulaForm({ ...formulaForm, output_field_code: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select field…</option>
                      {definitions.map((d) => (
                        <option key={d.field_code} value={d.field_code}>{d.field_label} ({d.field_code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Order</label>
                    <input
                      type="number"
                      value={formulaForm.computation_order}
                      onChange={(e) => setFormulaForm({ ...formulaForm, computation_order: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Expression *
                  </label>
                  <textarea
                    value={formulaForm.expression}
                    onChange={(e) => setFormulaForm({ ...formulaForm, expression: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="e.g. gross_pay * 0.09"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Use field codes as variables. Supported: <code>+ - * / ( )</code>, <code>ROUND()</code>, <code>IF(condition, then, else)</code>, constants.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Description</label>
                  <input
                    value={formulaForm.description}
                    onChange={(e) => setFormulaForm({ ...formulaForm, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="Brief description"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formulaForm.is_active}
                    onChange={(e) => setFormulaForm({ ...formulaForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Active
                </label>
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
                <button onClick={() => setFormulaModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={saveFormula}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? <LoadingIndicator size={40} /> : <Save className="w-4 h-4" />}
                  {editingFormula ? 'Update' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Delete Confirmation ═════════════════════════════════════════ */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 text-center">
                Delete {deleteTarget.type === 'definition' ? 'Definition' : 'Formula'}?
              </h3>
              <p className="text-sm text-slate-500 text-center mt-2">
                {deleteTarget.type === 'definition'
                  ? `This will delete "${(deleteTarget.item as PayrollDefinition).field_label}" and any linked formulas.`
                  : `This will delete the formula "${(deleteTarget.item as PayrollFormula).formula_name}".`
                }
                This action cannot be undone.
              </p>
              <div className="flex justify-center gap-3 mt-6">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (deleteTarget.type === 'definition') deleteDef(deleteTarget.item as PayrollDefinition);
                    else deleteFormula(deleteTarget.item as PayrollFormula);
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50"
                >
                  {saving ? <LoadingIndicator size={40} /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
