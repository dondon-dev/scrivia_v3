import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Menu } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ── Excel-style ribbon ─────────────────────────────────────────────────────
 * A flat, modern take on Microsoft Office's ribbon UI:
 *   • Top panel with tab strip (File, Home, Insert, Layout, View, …)
 *   • Horizontal ribbon bar below it with segmented groups (subtle dividers)
 *   • Large icon buttons with small labels, hover highlights
 *   • Collapses into dropdown menus on smaller viewports
 * The component is intentionally presentational — the caller supplies the
 * tabs, groups and click handlers (so it stays reusable across views).
 * ------------------------------------------------------------------------ */

export interface RibbonMenuItem {
  key: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  separatorAfter?: boolean;
}

export interface RibbonItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  badge?: string | null;
}

export interface RibbonGroup {
  key: string;
  label: string;
  items: RibbonItem[];
  /** Wide groups get more horizontal room for many buttons. */
  wide?: boolean;
}

export interface RibbonTab {
  key: string;
  label: string;
  /** The File tab renders a backstage-style menu (icon + label + hint) instead of groups. */
  file?: boolean;
  groups?: RibbonGroup[];
  menuItems?: RibbonMenuItem[];
}

interface ExcelRibbonProps {
  tabs: RibbonTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Small brand label shown at the left of the tab strip (like the app name in Excel). */
  brand?: string;
  fileName?: string;
  /** Custom control rendered at the right of the tab strip (like Excel's search box). */
  trailing?: ReactNode;
}

function useIsSmall(breakpoint = 1023): boolean {
  const [small, setSmall] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setSmall(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);
  return small;
}

function RibbonBigButton({ item }: { item: RibbonItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      title={item.title ?? item.label}
      onClick={item.onClick}
      disabled={item.disabled}
      className={`group/btn relative flex w-16 flex-col items-center gap-1 rounded-lg px-1.5 py-1.5 text-center transition-colors select-none ${
        item.disabled
          ? 'cursor-not-allowed opacity-30'
          : 'hover:bg-black/[0.06] dark:hover:bg-white/10'
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
          item.active
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300'
            : 'border-transparent bg-transparent text-slate-600 dark:text-slate-300'
        } ${!item.disabled ? 'group-hover/btn:border-slate-200 dark:group-hover/btn:border-slate-600' : ''}`}
      >
        <Icon
          className="h-[18px] w-[18px]"
          strokeWidth={item.active ? 2.2 : 1.8}
          aria-hidden="true"
        />
        {item.active && (
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
        )}
      </span>
      <span className="max-w-full truncate text-[10px] font-medium leading-tight text-slate-600 dark:text-slate-300">
        {item.label}
      </span>
      {item.badge && (
        <span className="absolute right-0.5 top-0.5 rounded bg-emerald-600 px-1 text-[8px] font-bold leading-3 text-white">
          {item.badge}
        </span>
      )}
    </button>
  );
}

function RibbonGroupView({ group }: { group: RibbonGroup }) {
  return (
    <div
      className={`flex min-h-[76px] shrink-0 flex-col items-center justify-between gap-1.5 px-3 py-2 border-l border-slate-200/80 dark:border-slate-700/60 ${
        group.wide ? 'min-w-44' : 'min-w-[7.5rem]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-center gap-0.5 px-1">
        {group.items.map((item) => <RibbonBigButton key={item.key} item={item} />)}
      </div>
      <span className="text-center text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {group.label}
      </span>
    </div>
  );
}

function FileMenu({ items }: { items: RibbonMenuItem[] }) {
  return (
    <div className="flex border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="flex w-full max-w-[300px] flex-col py-1">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={item.key}>
              <button
                type="button"
                onClick={item.onClick}
                disabled={item.disabled}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  item.danger
                    ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                } ${item.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                {Icon && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{item.label}</span>
                  {item.hint && (
                    <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
                      {item.hint}
                    </span>
                  )}
                </span>
                {item.checked && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                )}
              </button>
              {item.separatorAfter && i < items.length - 1 && (
                <div className="mx-3 border-t border-slate-200 dark:border-slate-700" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ExcelRibbon({
  tabs,
  activeTab,
  onTabChange,
  brand,
  fileName,
  trailing,
}: ExcelRibbonProps) {
  const small = useIsSmall();
  const [dropOpen, setDropOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const active = tabs.find((t) => t.key === activeTab) ?? tabs[0];
  const isFile = active.file === true;

  // Close dropdowns on outside click / Escape.
  useEffect(() => {
    if (!dropOpen && !fileOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setDropOpen(false);
      setFileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDropOpen(false); setFileOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropOpen, fileOpen]);

  // Collapsed (mobile) mode: a single "Ribbon" menu button that opens a
  // dropdown listing File + every tab's groups/items grouped by header.
  if (small) {
    return (
      <div ref={rootRef} className="relative z-30 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <button
            type="button"
            onClick={() => { setDropOpen((v) => !v); setFileOpen(false); }}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-black/[0.06] dark:hover:bg-white/10 transition-colors"
          >
            <Menu className="h-4 w-4" />
            Ribbon
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${dropOpen ? 'rotate-180' : ''}`} />
          </button>
          {trailing}
          <span className="ml-auto truncate text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {isFile ? 'File' : active.label}
          </span>
        </div>

        {dropOpen && (
          <div ref={menuRef} className="absolute right-0 top-full z-40 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl py-1 animate-fade-in">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {brand || 'Plantilla Allocation List'}
            </div>
            {tabs.map((tab) => (
              <div key={tab.key}>
                <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {tab.label}
                </div>
                {tab.file && tab.menuItems?.map((m) => {
                  const MIcon = m.icon;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={m.disabled}
                      onClick={() => { m.onClick(); setDropOpen(false); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                        m.danger
                          ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      } ${m.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                      {MIcon && <MIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      <span className="min-w-0">
                        <span className="block font-medium truncate">{m.label}</span>
                        {m.hint && <span className="block truncate text-[10px] text-slate-400">{m.hint}</span>}
                      </span>
                    </button>
                  );
                })}
                {!tab.file && tab.groups?.map((g) => (
                  <div key={g.key} className="pb-1">
                    <div className="px-3 pt-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                      {g.label}
                    </div>
                    {g.items.map((item) => {
                      const GIcon = item.icon;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          disabled={item.disabled}
                          onClick={() => { item.onClick(); setDropOpen(false); }}
                          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${item.active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                            <GIcon className="h-3.5 w-3.5" />
                          </span>
                          <span className="flex-1">{item.label}</span>
                          {item.active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Tab strip + ribbon pane (desktop)
  return (
    <div ref={rootRef} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* Top panel — tab strip */}
      <div className="flex items-stretch gap-0.5 bg-slate-100/90 px-2 pt-1 dark:bg-slate-900/80">
        {brand && (
          <span className="hidden items-center gap-1.5 pr-3 text-[11px] font-bold tracking-tight text-slate-500 dark:text-slate-400 lg:flex">
            {brand}
          </span>
        )}
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`relative -mb-px flex items-center gap-1 px-3.5 py-2 text-[12px] font-semibold transition-colors ${
                isActive
                  ? 'bg-slate-50 text-emerald-700 dark:bg-slate-950 dark:text-emerald-300'
                  : 'text-slate-500 hover:bg-black/[0.04] hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              )}
            </button>
          );
        })}
        {fileName && (
          <span className="ml-auto hidden items-center px-2 text-[11px] text-slate-400 dark:text-slate-500 md:flex">
            {fileName}
          </span>
        )}
        {trailing && (
          <span className="ml-auto flex items-center gap-1.5 px-2 md:ml-0">{trailing}</span>
        )}
      </div>

      {/* Ribbon bar */}
      {isFile ? (
        <>
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-700 bg-white px-4 py-1.5 dark:bg-slate-900">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">File</span>
            <button
              type="button"
              onClick={() => setFileOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-black/[0.05] dark:hover:bg-white/10 transition-colors"
            >
              More… <ChevronDown className={`h-3.5 w-3.5 transition-transform ${fileOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {fileOpen && (
            <div className="relative border-t border-slate-200 dark:border-slate-700">
              <div className="absolute left-36 top-0 z-30 max-h-[60vh] w-80 overflow-y-auto rounded-b-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                {active.menuItems?.map((m) => {
                  const MIcon = m.icon;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={m.onClick}
                      disabled={m.disabled}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {MIcon && <MIcon className="h-4 w-4 shrink-0 text-slate-400" />}
                      <span className="min-w-0 text-xs">
                        <span className="block font-medium truncate">{m.label}</span>
                        {m.hint && <span className="block truncate text-[10px] text-slate-400">{m.hint}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <FileMenu items={active.menuItems ?? []} />
        </>
      ) : (
        <div className="flex gap-0 overflow-x-auto border-t border-slate-200 bg-slate-50 px-1.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
          {active.groups?.map((group) => <RibbonGroupView key={group.key} group={group} />)}
        </div>
      )}
    </div>
  );
}