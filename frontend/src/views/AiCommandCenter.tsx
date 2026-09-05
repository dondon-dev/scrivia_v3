import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import LoadingIndicator from '@/components/LoadingIndicator';
import {
  Sparkles, ShieldAlert, AlertTriangle, Info,
  CheckCircle2, Eye, Ban, Activity, Brain, RotateCcw,
  UserCheck, Zap, Radar, ListTodo, type LucideIcon,
} from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';
import {
  runAiScan, FINDING_KINDS,
  type AiFinding, type AiFindingKind, type AiScanResult, type AiSeverity,
} from '@/lib/aiScanner';
import { HeroHeader, KpiCard, SectionHeader, EmptyState } from '@/components/Enterprise';
import { staggerContainer, slideInRight, sparkSeries } from '@/lib/motion';
import { usePermissions } from '@/lib/permissions';
import { useOrg, codeScope } from '@/lib/org';

const IGNORE_KEY = 'scrivia_ai_ignored';
const TASK_KEY = 'scrivia_ai_tasks';

interface AiCommandCenterProps {
  onNavigate: (navId: string) => void;
}

const SEVERITY_META: Record<AiSeverity, { label: string; icon: LucideIcon; bar: string; badge: string; chip: string }> = {
  critical: {
    label: 'Critical',
    icon: ShieldAlert,
    bar: 'bg-gradient-to-r from-rose-500 to-rose-600',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    chip: 'bg-rose-500',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    bar: 'bg-gradient-to-r from-amber-400 to-amber-500',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    chip: 'bg-amber-400',
  },
  info: {
    label: 'Info',
    icon: Info,
    bar: 'bg-gradient-to-r from-nexora-400 to-nexora-600',
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    chip: 'bg-nexora-400',
  },
};

function severityIcon(sev: AiSeverity): LucideIcon {
  return SEVERITY_META[sev].icon;
}

export default function AiCommandCenter({ onNavigate }: AiCommandCenterProps) {
  const { hasPermission } = usePermissions();
  const canAssign = hasPermission('user_management');
  const [result, setResult] = useState<AiScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [revealedSteps, setRevealedSteps] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<AiSeverity | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<AiFindingKind | 'all'>('all');
  const [ignored, setIgnored] = useState<string[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);
  const [tasks, setTasks] = useState<string[]>([]);
  const timers = useRef<number[]>([]);

  // Load ignored + task sets
  useEffect(() => {
    try {
      const raw = localStorage.getItem(IGNORE_KEY);
      if (raw) setIgnored(JSON.parse(raw));
      const taskRaw = localStorage.getItem(TASK_KEY);
      if (taskRaw) setTasks(JSON.parse(taskRaw));
    } catch { /* ignore */ }
  }, []);

  const persistIgnored = useCallback((next: string[]) => {
    setIgnored(next);
    try { localStorage.setItem(IGNORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      try { localStorage.setItem(TASK_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const { scopedCodes } = useOrg();

  const scan = useCallback(async () => {
    setScanning(true);
    setResult(null);
    setRevealedSteps(0);
    const res = await runAiScan(codeScope(scopedCodes));
    setResult(res);
    // Progressive reveal of the feed so cards slide in one by one.
    res.steps.forEach((_, i) => {
      const t = window.setTimeout(() => setRevealedSteps((n) => n + 1), 350 + i * 380);
      timers.current.push(t);
    });
    setScanning(false);
  }, [scopedCodes]);

  useEffect(() => {
    void scan();
    return () => timers.current.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleFindings = useMemo(() => {
    if (!result) return [];
    return result.findings.filter((f) => {
      if (ignored.includes(f.id) && !showIgnored) return false;
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (kindFilter !== 'all' && f.kind !== kindFilter) return false;
      return true;
    });
  }, [result, ignored, showIgnored, severityFilter, kindFilter]);

  const kindCounts = useMemo(() => {
    const m = new Map<AiFindingKind, number>();
    if (result) {
      for (const f of result.findings) m.set(f.kind, (m.get(f.kind) ?? 0) + 1);
    }
    return m;
  }, [result]);

  const ignoredCount = ignored.length;
  const taskCount = tasks.length;
  const stats = result?.stats;

  return (
    <div className="space-y-6">
      {/* Hero — Payroll Copilot */}
      <HeroHeader
        greeting="Payroll Copilot"
        title={
          stats
            ? `The engine has scanned the payroll dataset and flagged ${stats.total.toLocaleString()} exception${stats.total === 1 ? '' : 's'}. ${stats.critical > 0 ? `${stats.critical.toLocaleString()} require${stats.critical === 1 ? 's' : ''} immediate attention.` : 'No critical issues found — the dataset looks healthy.'}`
            : 'Scanning the payroll dataset for exceptions, duplicates, and data-quality issues…'
        }
        date={result ? `Last scan ${new Date(result.scannedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}` : undefined}
        liveLabel={scanning ? 'SCANNING' : stats && stats.critical > 0 ? `${stats.critical} CRITICAL` : 'ALL SYSTEMS NOMINAL'}
        liveTone={scanning || (stats && stats.critical > 0) ? 'amber' : 'green'}
        chips={[
          { icon: Brain, label: stats ? `${stats.total.toLocaleString()} findings` : 'Initializing…' },
          { icon: ListTodo, label: taskCount > 0 ? `${taskCount} task${taskCount === 1 ? '' : 's'} created` : 'No tasks yet' },
          { icon: UserCheck, label: ignoredCount > 0 ? `${ignoredCount} dismissed` : 'No dismissals' },
        ]}
        actions={[
          { label: scanning ? 'Scanning…' : 'Run AI Scan', icon: scanning ? ScriviaLogo : Sparkles, primary: true, onClick: () => void scan() },
        ]}
      />

      {/* Payroll Copilot — quick access card */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="nexora-card p-4 flex items-center gap-4 border-l-4 border-nexora-500"
      >
        <div className="w-10 h-10 rounded-xl bg-nexora-100 dark:bg-nexora-900/40 flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5 text-nexora-600 dark:text-nexora-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white">Payroll Copilot</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Ask anything about payroll, deductions, and employee data</p>
        </div>
        <button
          onClick={() => onNavigate('ai_omnidev')}
          className="px-4 py-2 rounded-lg bg-nexora-600 text-white text-xs font-semibold hover:bg-nexora-700 transition-colors shrink-0"
        >
          Ask Copilot
        </button>
      </motion.div>

      {/* KPI row — rendered only once the scan lands so count-up hooks stay stable */}
      {result ? (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        >
          <KpiCard label="Total Findings" value={result.stats.total.toLocaleString()} raw={result.stats.total} icon={Radar} accent="blue" sublabel="Across all rules" spark={sparkSeries('ai-total')} />
          <KpiCard label="Critical" value={result.stats.critical.toLocaleString()} raw={result.stats.critical} icon={ShieldAlert} accent="rose" sublabel="Must resolve" spark={sparkSeries('ai-critical')} />
          <KpiCard label="Warnings" value={result.stats.warning.toLocaleString()} raw={result.stats.warning} icon={AlertTriangle} accent="amber" sublabel="Review recommended" spark={sparkSeries('ai-warning')} />
          <KpiCard label="Informational" value={result.stats.info.toLocaleString()} raw={result.stats.info} icon={Info} accent="slate" sublabel="Context & more items" spark={sparkSeries('ai-info')} />
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="kpi-card animate-pulse h-28" />
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'critical', 'warning', 'info'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                severityFilter === s
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {s === 'all' ? 'All' : SEVERITY_META[s].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FINDING_KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => setKindFilter(kindFilter === k.kind ? 'all' : k.kind)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                kindFilter === k.kind
                  ? 'bg-nexora-600 text-white border-nexora-600'
                  : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-nexora-300'
              }`}
            >
              {k.label} {kindCounts.get(k.kind) ? `(${kindCounts.get(k.kind)})` : ''}
            </button>
          ))}
        </div>
        {ignoredCount > 0 && (
          <button
            onClick={() => setShowIgnored((v) => !v)}
            className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showIgnored
                ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-amber-300'
            }`}
          >
            <Ban className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            {showIgnored ? 'Hide ignored' : `Show ${ignoredCount} ignored`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Findings */}
        <div className="xl:col-span-2 space-y-4">
          {!result && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="nexora-card p-5 animate-pulse h-36" />
              ))}
            </div>
          )}

          {result && visibleFindings.length === 0 && (
            <div className="nexora-card">
              <EmptyState
                icon={CheckCircle2}
                title={result.stats.total === 0 ? 'Dataset looks clean' : 'No findings match your filters'}
                message={
                  result.stats.total === 0
                    ? 'The AI engine scanned the payroll dataset and found no exceptions. Run a new scan after importing data.'
                    : 'Adjust the severity or rule filters to see more findings.'
                }
              />
            </div>
          )}

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
            {visibleFindings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                onNavigate={onNavigate}
                onDismiss={() => persistIgnored([...ignored, f.id])}
                ignored={ignored.includes(f.id)}
                onRestore={() => persistIgnored(ignored.filter((i) => i !== f.id))}
                canAssign={canAssign}
                onAssign={() => onNavigate('admin_users')}
                taskCreated={tasks.includes(f.id)}
                onToggleTask={() => toggleTask(f.id)}
              />
            ))}
          </motion.div>
        </div>

        {/* AI Activity Feed */}
        <div className="xl:sticky xl:top-24 space-y-4">
          <div className="nexora-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-nexora-600 dark:text-nexora-300" />
                <h3 className="section-heading text-sm">AI Activity Feed</h3>
              </div>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ripple-ping absolute inline-flex h-full w-full rounded-full ${scanning ? 'bg-amber-400' : 'bg-aurora-500'}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${scanning ? 'bg-amber-400' : 'bg-aurora-500'}`} />
              </span>
            </div>

            <div className="space-y-2.5 min-h-[180px]">
              {result?.steps.slice(0, Math.max(revealedSteps, 1)).map((step, i) => (
                <motion.div
                  key={i}
                  variants={slideInRight}
                  initial="hidden"
                  animate="show"
                  transition={{ delay: 0 }}
                  className="flex items-start gap-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-3 py-2.5"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${step.ok ? 'bg-aurora-100 dark:bg-aurora-900/40 text-aurora-700 dark:text-aurora-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{step.label}</p>
                    {step.note && <p className="text-[11px] text-slate-400 dark:text-slate-500">{step.note}</p>}
                  </div>
                </motion.div>
              ))}

              {!result && (
                <div className="flex items-center gap-2.5 text-xs text-slate-400 dark:text-slate-500 px-1 py-2">
                  <LoadingIndicator size={32} />
                  Engine warming up…
                </div>
              )}

              {result && revealedSteps >= result.steps.length && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-gradient-to-r from-aurora-500/10 to-nexora-500/10 border border-aurora-200/60 dark:border-aurora-800/40 px-3 py-2.5 flex items-center gap-2.5"
                >
                  <Sparkles className="w-4 h-4 text-aurora-600 dark:text-aurora-300 shrink-0" />
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Scan complete — {result.stats.total.toLocaleString()} finding{result.stats.total === 1 ? '' : 's'} surfaced.
                  </p>
                </motion.div>
              )}
            </div>
          </div>

          {/* What the engine checks */}
          <div className="nexora-card p-5">
            <SectionHeader title="Engine rules" icon={Brain} />
            <div className="space-y-2">
              {FINDING_KINDS.map((k) => (
                <div key={k.kind} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">{k.label}</span>
                  <span className="tabular font-semibold text-slate-700 dark:text-slate-200">
                    {kindCounts.get(k.kind) ?? 0}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4 leading-relaxed">
              Findings are computed from live, RLS-scoped reads — the engine can only
              inspect data your role is allowed to see. Confidence reflects signal
              strength, not machine certainty.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Finding card ─────────────────────────────────────────────────────────────

function FindingCard({
  finding: f, onNavigate, onDismiss, ignored, onRestore, canAssign, onAssign, taskCreated, onToggleTask,
}: {
  finding: AiFinding;
  onNavigate: (navId: string) => void;
  onDismiss: () => void;
  ignored: boolean;
  onRestore: () => void;
  canAssign: boolean;
  onAssign: () => void;
  taskCreated: boolean;
  onToggleTask: () => void;
}) {
  const sev = SEVERITY_META[f.severity];
  const SevIcon = severityIcon(f.severity);
  const confColor = f.confidence >= 90 ? 'text-emerald-600 dark:text-emerald-400' : f.confidence >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400';
  const confBar = f.confidence >= 90 ? 'bg-emerald-500' : f.confidence >= 80 ? 'bg-amber-400' : 'bg-nexora-400';

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.97 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: 'easeOut' } },
      }}
      whileHover={{ y: -2 }}
      className={`nexora-card overflow-hidden ${ignored ? 'opacity-60' : ''}`}
    >
      <div className="flex">
        {/* severity bar */}
        <div className={`w-1.5 shrink-0 ${sev.bar}`} />
        <div className="flex-1 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            {/* employee avatar or rule icon */}
            {f.employee ? (
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-deped-400 to-deped-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                {f.employee.name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/).slice(-2).map((p) => p[0] ?? '').join('').toUpperCase() || '?'}
              </div>
            ) : (
              <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center shrink-0">
                <SevIcon className="w-5 h-5" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sev.badge}`}>
                  <SevIcon className="w-3 h-3" />
                  {sev.label}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-semibold uppercase tracking-wide">
                  {f.kindLabel}
                </span>
                {ignored && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                    <Ban className="w-3 h-3" /> Ignored
                  </span>
                )}
                {taskCreated && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-aurora-50 dark:bg-aurora-900/30 text-aurora-700 dark:text-aurora-300 text-[10px] font-semibold">
                    <ListTodo className="w-3 h-3" /> Task created
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-2 leading-snug">{f.title}</h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{f.detail}</p>

              {f.employee && (
                <div className="flex items-center gap-2 mt-2.5 flex-wrap text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{f.employee.name}</span>
                  <span className="text-slate-400 dark:text-slate-500 font-mono">{f.employee.empno}</span>
                  {f.employee.stacode && (
                    <span className="px-1.5 py-0.5 rounded bg-deped-50 dark:bg-deped-900/40 text-deped-700 dark:text-deped-300 font-mono text-[10px]">
                      STACODE {f.employee.stacode}
                    </span>
                  )}
                </div>
              )}

              {/* AI confidence */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${confBar}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${f.confidence}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
                  />
                </div>
                <span className={`text-[11px] font-bold tabular shrink-0 ${confColor}`}>
                  <Zap className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                  {f.confidence}% confidence
                </span>
              </div>

              {/* Suggested action + buttons */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  <Sparkles className="w-3 h-3 text-aurora-500" />
                  Suggested: {f.suggestion}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  {ignored ? (
                    <button
                      onClick={onRestore}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={onDismiss}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Dismiss this finding"
                      >
                        <Ban className="w-3.5 h-3.5" /> Ignore
                      </button>
                      {canAssign && (
                        <button
                          onClick={onAssign}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          title="Assign to a user"
                        >
                          <UserCheck className="w-3.5 h-3.5" /> Assign
                        </button>
                      )}
                      <button
                        onClick={onToggleTask}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          taskCreated
                            ? 'bg-aurora-50 dark:bg-aurora-900/30 text-aurora-700 dark:text-aurora-300 border-aurora-200 dark:border-aurora-800'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        title={taskCreated ? 'Remove task' : 'Create a task for this finding'}
                      >
                        <ListTodo className="w-3.5 h-3.5" /> {taskCreated ? 'Task created' : 'Create Task'}
                      </button>
                      <button
                        onClick={() => onNavigate('audit_trail')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        title="Open the audit trail"
                      >
                        <Eye className="w-3.5 h-3.5" /> Audit
                      </button>
                      <button
                        onClick={() => onNavigate(f.refView)}
                        className="nexora-btn !px-3 !py-1.5 !rounded-lg !text-xs"
                      >
                        Resolve
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
