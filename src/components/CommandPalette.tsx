import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Command, Search, CornerDownLeft, User, Clock, type LucideIcon } from 'lucide-react';
import { NAV_SECTIONS, type NavItem } from '@/lib/navConfig';
import type { PayrollCategory } from '@/lib/categories';
import { usePermissions } from '@/lib/permissions';
import { useOrg, codeScope } from '@/lib/org';
import { supabase } from '@/lib/supabase';
import { scaleIn } from '@/lib/motion';
import type { UserProfile } from '@/types/auth';

interface CommandPaletteProps {
  profile: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (navId: string, category: PayrollCategory | null) => void;
}

interface FlatEntry {
  item: NavItem;
  section: string;
}

interface EmployeeHit {
  id: string;
  label: string;
  meta: string;
}

const RECENTS_KEY = 'scrivia_palette_recents';

export default function CommandPalette({ profile, open, onOpenChange, onNavigate }: CommandPaletteProps) {
  const { hasPermission } = usePermissions();
  const { scopedCodes } = useOrg();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const [empHits, setEmpHits] = useState<EmployeeHit[]>([]);
  const [searchingEmp, setSearchingEmp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Fresh scope for the debounced employee search (timeout closure).
  const scopeCodesRef = useRef(scopedCodes);
  scopeCodesRef.current = scopedCodes;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) setRecents(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Global ⌘K / Ctrl+K listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onOpenChange]);

  // Focus the input + reset state when opened.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Live employee search (debounced ~200ms), RLS-scoped, permission-gated.
  const canEmployees = hasPermission('employees');
  useEffect(() => {
    if (!open || !canEmployees) return;
    const q = query.trim();
    if (q.length < 2) { setEmpHits([]); setSearchingEmp(false); return; }
    setSearchingEmp(true);
    const t = setTimeout(async () => {
      try {
        const term = q.replace(/'/g, "''");
        const scope = codeScope(scopeCodesRef.current);
        let empQuery = supabase
          .from('employees')
          .select('id,empno,employee_number,fname,lname,stacode,poscode')
          .or(`fname.ilike.%${term}%,lname.ilike.%${term}%,empno.ilike.%${term}%,employee_number.ilike.%${term}%`)
          .eq('status', 'Active')
          .order('lname', { ascending: true })
          .limit(6);
        if (scope.regcode) {
          empQuery = empQuery.eq('regcode', scope.regcode).in('divcode', scope.divcodes ?? []);
        }
        const { data, error } = await empQuery;
        if (error) { setEmpHits([]); return; }
        setEmpHits((data ?? []).map((r) => ({
          id: r.id,
          label: [r.lname, r.fname].filter(Boolean).join(', ') || (r.empno || 'Employee'),
          meta: [r.empno || r.employee_number, r.stacode, r.poscode].filter(Boolean).join(' · '),
        })));
      } finally {
        setSearchingEmp(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, open, canEmployees]);

  // Flatten permission-filtered nav into a searchable list.
  const flatNav = useMemo<FlatEntry[]>(() => {
    const out: FlatEntry[] = [];
    for (const section of NAV_SECTIONS) {
      if (section.items) {
        for (const item of section.items) {
          if (hasPermission(item.permission)) out.push({ item, section: section.label });
        }
      }
      if (section.subGroups) {
        for (const sg of section.subGroups) {
          for (const item of sg.items) {
            if (hasPermission(item.permission)) out.push({ item, section: `${section.label} › ${sg.label}` });
          }
        }
      }
    }
    return out;
  }, [hasPermission]);

  const q = query.trim().toLowerCase();

  const navResults = useMemo(() => {
    const recentsFirst = [...recents].reverse();
    const ordered = [...flatNav].sort((a, b) => {
      const ia = recentsFirst.indexOf(a.item.id);
      const ib = recentsFirst.indexOf(b.item.id);
      return (ia === -1 ? 1 : 0) - (ib === -1 ? 1 : 0);
    });
    if (!q) return ordered.slice(0, 8);
    return ordered
      .filter(({ item }) => item.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [flatNav, q, recents]);

  // Combined result rows: navigation first, then employees.
  const rows = useMemo(() => {
    const nav: { kind: 'nav'; key: string; label: string; meta: string; icon: LucideIcon; item: NavItem }[] =
      navResults.map(({ item, section }) => ({
        kind: 'nav' as const,
        key: `nav:${item.id}`,
        label: item.label,
        meta: section,
        icon: item.icon,
        item,
      }));
    const emp: { kind: 'emp'; key: string; label: string; meta: string; icon: LucideIcon; item: NavItem | null }[] =
      empHits.map((e) => ({
        kind: 'emp' as const,
        key: `emp:${e.id}`,
        label: e.label,
        meta: e.meta || 'Employee',
        icon: User,
        item: null,
      }));
    return [...nav, ...emp];
  }, [navResults, empHits]);

  useEffect(() => {
    setActiveIndex(0);
  }, [q, empHits.length]);

  function run(row: (typeof rows)[number]) {
    if (row.kind === 'nav' && row.item) {
      const next = [row.item.id, ...recents.filter((r) => r !== row.item.id)].slice(0, 6);
      setRecents(next);
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      onNavigate(row.item.id, null);
    } else {
      onNavigate('employees', null);
    }
    onOpenChange(false);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && rows[activeIndex]) { e.preventDefault(); run(rows[activeIndex]); }
  }

  const hasNav = navResults.length > 0;
  const hasEmp = empHits.length > 0;
  const empty = !hasNav && !hasEmp && !searchingEmp;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] bg-ink/50 dark:bg-black/60 backdrop-blur-sm flex items-start justify-center px-4 pt-[12vh]"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
        >
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.12 } }}
            className="w-full max-w-xl rounded-2xl glass-panel dark:bg-[#0f172a]/90 shadow-nexora-lg overflow-hidden"
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 border-b border-slate-200/70 dark:border-white/10">
              <Search className="w-5 h-5 text-nexora-500 dark:text-nexora-300 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search employees, payrolls, plantilla items, reports…"
                className="flex-1 py-4 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
              />
              <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-white/10 text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10">
                <Command className="w-3 h-3" /> K
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[46vh] overflow-y-auto p-2 space-y-0.5">
              {rows.length === 0 && empty && (
                <div className="py-10 text-center">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
                    <Search className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No results</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {q ? `Nothing found for "${query.trim()}"` : 'Type to search the system'}
                  </p>
                </div>
              )}

              {hasNav && (
                <>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> {q ? 'Navigation' : 'Quick access'}
                  </p>
                  {navResults.map(({ item, section }, i) => {
                    const Icon = item.icon;
                    const active = activeIndex === i && !(hasEmp && activeIndex >= navResults.length);
                    return (
                      <button
                        key={`nav:${item.id}`}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => run({ kind: 'nav', key: `nav:${item.id}`, label: item.label, meta: section, icon: item.icon, item })}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                          active ? 'bg-nexora-50 dark:bg-nexora-900/40 ring-1 ring-nexora-200 dark:ring-nexora-700' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-nexora-100 dark:bg-nexora-800 text-nexora-700 dark:text-nexora-200' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.label}</span>
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">{section}</span>
                        </span>
                        {recents.includes(item.id) && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-500 shrink-0">Recent</span>
                        )}
                        {active && <CornerDownLeft className="w-3.5 h-3.5 text-nexora-500 shrink-0" />}
                      </button>
                    );
                  })}
                </>
              )}

              {hasEmp && (
                <>
                  <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <User className="w-3 h-3" /> Employees
                  </p>
                  {empHits.map((e, j) => {
                    const i = navResults.length + j;
                    const active = activeIndex === i;
                    return (
                      <button
                        key={`emp:${e.id}`}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => run({ kind: 'emp', key: `emp:${e.id}`, label: e.label, meta: e.meta || 'Employee', icon: User, item: null })}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                          active ? 'bg-aurora-50 dark:bg-aurora-900/30 ring-1 ring-aurora-200 dark:ring-aurora-700' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-aurora-100 dark:bg-aurora-800 text-aurora-700 dark:text-aurora-200' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}>
                          <User className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{e.label}</span>
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">{e.meta}</span>
                        </span>
                        <span className="text-[10px] font-medium text-nexora-600 dark:text-nexora-300 shrink-0">Open Masterfile</span>
                        {active && <CornerDownLeft className="w-3.5 h-3.5 text-aurora-600 shrink-0" />}
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-200/70 dark:border-white/10 text-[10px] text-slate-400 dark:text-slate-500">
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10">↵</kbd> open</span>
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10">esc</kbd> close</span>
              <span className="ml-auto hidden sm:block">Signed in as {profile.first_name || profile.email}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
