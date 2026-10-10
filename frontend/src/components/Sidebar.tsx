import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronRight, ChevronLeft, Search, Star, LogOut, Settings, HelpCircle, Code2,
  type LucideIcon,
} from 'lucide-react';

import type { UserProfile } from '@/types/auth';
import { ROLE_LABELS } from '@/types/auth';
import { usePermissions } from '@/lib/permissions';
import RegionDivisionSelector from '@/components/RegionDivisionSelector';
import type { PayrollCategory } from '@/lib/categories';
import {
  NAV_SECTIONS, type NavSection, type NavItem, type ViewKey,
  findNavItem, isSectionHiddenForRole, isNavItemHiddenForRole,
} from '@/lib/navConfig';

const FAV_KEY = 'payrollpro_favorites';
const MAX_FAVORITES = 10;
const RECENT_KEY = 'scrivia_recent_nav';
const MAX_RECENT = 6;

export interface SidebarProps {
  profile: UserProfile;
  collapsed: boolean;
  mobileOpen: boolean;
  activeNavId: string;
  activeViewKey: ViewKey;
  globalCategory: PayrollCategory | null;
  stacodeBadge: number;
  onNavigate: (item: NavItem, category: PayrollCategory | null) => void;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onSignOut: () => void;
  onHoverSection?: (sectionId: string | null, top?: number) => void;
}

export default function Sidebar(props: SidebarProps) {
  const {
    profile, collapsed, mobileOpen, activeNavId, stacodeBadge,
    onNavigate, onToggleCollapse, onCloseMobile, onSignOut,
  } = props;

  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const { hasPermission } = usePermissions();

  // Flyout state
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const favRaw = localStorage.getItem(FAV_KEY);
      if (favRaw) setFavorites(JSON.parse(favRaw));
      const recentRaw = localStorage.getItem(RECENT_KEY);
      if (recentRaw) setRecents(JSON.parse(recentRaw));
    } catch { /* ignore */ }
  }, []);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [id, ...prev].slice(0, MAX_FAVORITES);
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleItemClick(item: NavItem, _category: PayrollCategory | null) {
    setRecents((prev) => {
      const next = [item.id, ...prev.filter((r) => r !== item.id)].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
    onNavigate(item, _category);
    setHoveredSection(null);
  }

  const filteredSections = useMemo(() => {
    return NAV_SECTIONS
      .filter((section) => section.id !== 'notifications')
      // Role-based hide (e.g. Remittance for School Payroll Coordinator)
      // outranks any permission grant.
      .filter((section) => !isSectionHiddenForRole(section, profile.role))
      .map((section) => {
        const filterItem = (item: NavItem) =>
          hasPermission(item.permission) && !isNavItemHiddenForRole(item, profile.role);
        if (section.subGroups) {
          return {
            ...section,
            subGroups: section.subGroups
              .map((sg) => ({ ...sg, items: sg.items.filter(filterItem) }))
              .filter((sg) => sg.items.length > 0),
            items: section.items?.filter(filterItem),
          };
        }
        return { ...section, items: section.items?.filter(filterItem) };
      })
      .filter((section) => {
        const hasItems = (section.items?.length ?? 0) > 0;
        const hasSubItems = (section.subGroups?.length ?? 0) > 0;
        return hasItems || hasSubItems;
      });
  }, [hasPermission, profile.role]);

  const filteredItems = useMemo(() => {
    return filteredSections.flatMap((s) => s.items ?? []);
  }, [filteredSections]);

  const favoriteItems = useMemo(() => {
    return favorites
      .map((id) => findNavItem(id))
      .filter((item): item is NavItem =>
        !!item && hasPermission(item.permission) && !isNavItemHiddenForRole(item, profile.role));
  }, [favorites, hasPermission, profile.role]);

  // Flyout handlers
  const handleSectionEnter = useCallback((sectionId: string) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredSection(sectionId), 40);
  }, []);

  const handleSectionLeave = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredSection(null), 150);
  }, []);

  const handleFlyoutEnter = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }, []);

  const handleFlyoutLeave = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setHoveredSection(null), 100);
  }, []);

  const hoveredSectionData = useMemo(() => {
    if (!hoveredSection) return null;
    return filteredSections.find((s) => s.id === hoveredSection) ?? null;
  }, [hoveredSection, filteredSections]);

  // Get the top position for the flyout
  const getFlyoutTop = useCallback(() => {
    if (!hoveredSection) return 0;
    const el = sectionRefs.current.get(hoveredSection);
    if (el) return el.getBoundingClientRect().top;
    return 80;
  }, [hoveredSection]);

  const isSearching = searchQuery.trim().length > 0;

  // ── Collapsed icon rail ──
  const renderCollapsedRail = () => (
    <aside className="hidden lg:flex flex-col items-center w-[68px] bg-white dark:bg-[#111827] border-r border-gray-200 dark:border-gray-800 h-full shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center w-full h-16 border-b border-gray-100 dark:border-gray-800">
        <img src="/scrivia_logo.png" alt="Scrivia" className="h-[50px] w-auto object-contain" />
      </div>

      {/* Nav icons */}
      <nav className="flex-1 flex flex-col items-center gap-1 py-4 px-2 overflow-y-auto sidebar-scroll">
        {/* Favorites first */}
        {favoriteItems.length > 0 && (
          <>
            {favoriteItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNavId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item, props.globalCategory)}
                  title={item.label}
                  className={`relative w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-[#6495ED]/10 text-[#6495ED]'
                      : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#6495ED] rounded-r-full" />
                  )}
                </button>
              );
            })}
            <div className="w-6 h-px bg-gray-200 dark:bg-gray-700 my-1" />
          </>
        )}

        {/* Section icons */}
        {filteredSections.map((section) => {
          const SectionIcon = section.icon;
          const hasActiveChild =
            section.items?.some((i) => i.id === activeNavId) ||
            section.subGroups?.some((sg) => sg.items.some((i) => i.id === activeNavId));
          const isHovered = hoveredSection === section.id;

          return (
            <div
              key={section.id}
              ref={(el) => { if (el) sectionRefs.current.set(section.id, el); }}
              onMouseEnter={() => handleSectionEnter(section.id)}
              onMouseLeave={handleSectionLeave}
              className="relative"
            >
              <button
                onClick={() => {
                  if (section.leaf && section.items?.[0]) {
                    handleItemClick(section.items[0], props.globalCategory);
                  } else {
                    setHoveredSection(isHovered ? null : section.id);
                  }
                }}
                title={section.label}
                className={`relative w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200 ${
                  hasActiveChild
                    ? 'bg-[#6495ED]/10 text-[#6495ED]'
                    : isHovered
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <SectionIcon className="w-5 h-5" strokeWidth={hasActiveChild ? 2.2 : 1.8} />
                {hasActiveChild && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#6495ED] rounded-r-full" />
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-1 py-4 px-2 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={onToggleCollapse}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title="Expand sidebar"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          title="Help & Support"
          className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
        <button
          title="Settings"
          className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );

  // ── Flyout panel (appears on hover in both collapsed and expanded modes) ──
  const renderFlyout = () => {
    if (!hoveredSectionData) return null;

    const el = hoveredSection ? sectionRefs.current.get(hoveredSection) : undefined;
    const rect = el?.getBoundingClientRect();
    const top = rect ? rect.top : 80;
    const left = rect ? rect.right + 4 : (collapsed ? 72 : 284);

    return (
      <AnimatePresence>
        <motion.div
          ref={flyoutRef}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -4 }}
          transition={{ duration: 0.15 }}
          onMouseEnter={handleFlyoutEnter}
          onMouseLeave={handleFlyoutLeave}
          className="fixed z-[70] w-64 bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl border border-gray-200/80 dark:border-gray-700/50 overflow-hidden"
          style={{ top: `${Math.min(top, window.innerHeight - 400)}px`, left: `${left}px` }}
        >
          {/* Flyout header */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-[11px] font-semibold tracking-wider text-gray-400 dark:text-gray-500 uppercase">
              {hoveredSectionData.label}
            </p>
          </div>

          {/* Flyout items */}
          <div className="px-2 pb-3">
            {hoveredSectionData.items?.map((item) => (
              <FlyoutItem
                key={item.id}
                item={item}
                active={activeNavId === item.id}
                onClick={() => handleItemClick(item, props.globalCategory)}
                isFavorite={favorites.includes(item.id)}
                onToggleFavorite={() => toggleFavorite(item.id)}
              />
            ))}

            {hoveredSectionData.subGroups?.map((sg) => (
              <div key={sg.id}>
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {sg.label}
                </p>
                {sg.items.map((item) => (
                  <FlyoutItem
                    key={item.id}
                    item={item}
                    active={activeNavId === item.id}
                    onClick={() => handleItemClick(item, props.globalCategory)}
                    isFavorite={favorites.includes(item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  };

  // ── Expanded sidebar ──
  const renderExpandedSidebar = () => (
    <aside className="hidden lg:flex flex-col w-72 bg-white dark:bg-[#111827] border-r border-gray-200 dark:border-gray-800 h-full shrink-0 transition-all duration-300">
      {/* Logo */}
      <div className="flex items-center gap-3 h-16 px-5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <img src="/scrivia_logo.png" alt="Scrivia" className="h-[50px] w-auto object-contain" />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="font-bold text-2xl text-gray-900 dark:text-white">Scrivia Cloud</span>
          <span className="text-[10px] text-gray-400">Smart Payroll. Secure Future.</span>
        </div>
      </div>

      {/* Region / Division */}
      <RegionDivisionSelector />

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu…"
            className="w-full pl-9 pr-7 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6495ED]/20 focus:border-[#6495ED] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto sidebar-scroll">
        {/* Search results */}
        {isSearching && (
          <div className="space-y-0.5">
            {filteredItems.filter((item) => item.label.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
              <p className="text-xs text-center py-6 text-gray-400">No results for "{searchQuery}"</p>
            ) : (
              filteredItems
                .filter((item) => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((item) => (
                  <NavItemRow
                    key={item.id}
                    item={item}
                    active={activeNavId === item.id}
                    onClick={() => { handleItemClick(item, props.globalCategory); setSearchQuery(''); }}
                    isFavorite={favorites.includes(item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id)}
                  />
                ))
            )}
          </div>
        )}

        {/* Favorites */}
        {!isSearching && favoriteItems.length > 0 && (
          <div className="mb-3">
            <p className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
              <Star className="w-3 h-3 fill-amber-300/80" /> Favorites
            </p>
            {favoriteItems.map((item) => (
              <NavItemRow
                key={item.id}
                item={item}
                active={activeNavId === item.id}
                onClick={() => handleItemClick(item, props.globalCategory)}
                isFavorite
                onToggleFavorite={() => toggleFavorite(item.id)}
              />
            ))}
          </div>
        )}

        {/* Main sections */}
        {!isSearching && filteredSections.map((section) => {
          const firstItem = section.items?.[0];
          if (section.leaf && firstItem) {
            return (
              <NavItemRow
                key={section.id}
                item={firstItem}
                active={activeNavId === firstItem.id}
                onClick={() => handleItemClick(firstItem, props.globalCategory)}
                isFavorite={favorites.includes(firstItem.id)}
                onToggleFavorite={() => toggleFavorite(firstItem.id)}
              />
            );
          }

          const SectionIcon = section.icon;
          const hasActiveChild =
            section.items?.some((i) => i.id === activeNavId) ||
            section.subGroups?.some((sg) => sg.items.some((i) => i.id === activeNavId));

          return (
            <div
              key={section.id}
              ref={(el) => { if (el) sectionRefs.current.set(section.id, el); }}
              className="mb-1 relative"
              onMouseEnter={() => handleSectionEnter(section.id)}
              onMouseLeave={handleSectionLeave}
            >
              <button
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  hasActiveChild
                    ? 'bg-[#6495ED]/10 text-[#6495ED]'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <SectionIcon className="w-5 h-5 shrink-0" strokeWidth={hasActiveChild ? 2.2 : 1.8} />
                <span className="flex-1 text-left">{section.label}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
              </button>
            </div>
          );
        })}

        {/* About the Creator */}
        {!isSearching && (
          <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-800">
            <NavItemRow
              item={{ id: 'creator', label: 'About the Creator', icon: Code2, permission: 'dashboard', viewKey: 'creator' }}
              active={activeNavId === 'creator'}
              onClick={(item) => handleItemClick(item, null)}
            />
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="hidden lg:flex items-center justify-center gap-2 py-3 border-t border-gray-100 dark:border-gray-800 transition-colors text-xs font-medium shrink-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-400"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Collapse</span>
      </button>

      {/* User profile */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 bg-[#6495ED] text-white">
            {profile.first_name?.[0]?.toUpperCase() ?? profile.email[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{profile.first_name} {profile.last_name}</p>
            <p className="text-[11px] text-gray-400">{ROLE_LABELS[profile.role]}</p>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="w-full mt-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition-all"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Sign Out
        </button>
      </div>
    </aside>
  );

  // ── Mobile overlay ──
  const renderMobileOverlay = () => (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-[55] lg:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-[60] w-72 flex flex-col bg-white dark:bg-[#111827] border-r border-gray-200 dark:border-gray-800 transition-transform duration-300 lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile header */}
        <div className="flex items-center gap-3 h-16 px-5 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <img src="/scrivia_logo.png" alt="Scrivia" className="h-[50px] w-auto object-contain" />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-bold text-2xl text-gray-900 dark:text-white">Scrivia Cloud</span>
            <span className="text-[10px] text-gray-400">Smart Payroll. Secure Future.</span>
          </div>
          <button onClick={onCloseMobile} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Mobile nav items (flat list) */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto sidebar-scroll">
          {filteredSections.map((section) => {
            if (section.leaf && section.items?.[0]) {
              const item = section.items[0];
              return (
                <NavItemRow
                  key={item.id}
                  item={item}
                  active={activeNavId === item.id}
                  onClick={() => handleItemClick(item, props.globalCategory)}
                />
              );
            }

            const SectionIcon = section.icon;
            return (
              <div key={section.id} className="mb-1">
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400">
                  <SectionIcon className="w-5 h-5 shrink-0" />
                  <span className="flex-1">{section.label}</span>
                </div>
                {section.subGroups?.map((sg) =>
                  sg.items.map((item) => (
                    <NavItemRow
                      key={item.id}
                      item={item}
                      active={activeNavId === item.id}
                      onClick={() => handleItemClick(item, props.globalCategory)}
                      compact
                    />
                  ))
                )}
                {section.items?.map((item) => (
                  <NavItemRow
                    key={item.id}
                    item={item}
                    active={activeNavId === item.id}
                    onClick={() => handleItemClick(item, props.globalCategory)}
                    compact
                  />
                ))}
              </div>
            );
          })}
        </nav>

        {/* Mobile user */}
        <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold bg-[#6495ED] text-white">
              {profile.first_name?.[0]?.toUpperCase() ?? profile.email[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{profile.first_name} {profile.last_name}</p>
              <p className="text-[11px] text-gray-400">{ROLE_LABELS[profile.role]}</p>
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="w-full mt-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition-all"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );

  return (
    <>
      {collapsed ? renderCollapsedRail() : renderExpandedSidebar()}
      {renderFlyout()}
      {renderMobileOverlay()}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FlyoutItem — single item in the collapsed flyout panel
// ══════════════════════════════════════════════════════════════════════════════

interface FlyoutItemProps {
  item: NavItem;
  active: boolean;
  onClick: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

function FlyoutItem({ item, active, onClick, isFavorite, onToggleFavorite }: FlyoutItemProps) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? 'bg-[#6495ED]/10 text-[#6495ED]'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      <span className="flex-1 text-left truncate">{item.label}</span>
      {isFavorite && (
        <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
      )}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NavItemRow — single clickable nav item in expanded sidebar
// ══════════════════════════════════════════════════════════════════════════════

interface NavItemRowProps {
  item: NavItem;
  active: boolean;
  onClick: (item: NavItem) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  compact?: boolean;
}

function NavItemRow({ item, active, onClick, isFavorite, onToggleFavorite, compact }: NavItemRowProps) {
  const Icon = item.icon;
  return (
    <div className="group relative flex items-center gap-0.5 mb-0.5">
      <button
        onClick={() => onClick(item)}
        className={`flex-1 flex items-center gap-3 ${compact ? 'pl-2 pr-1 py-1.5' : 'pl-3 pr-2 py-2.5'} rounded-xl text-sm font-medium transition-all ${
          active
            ? 'bg-[#6495ED]/10 text-[#6495ED]'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'
        }`}
      >
        <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
        <span className="flex-1 text-left truncate">{item.label}</span>
      </button>
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          className={`p-1 rounded transition-opacity ${isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <Star className="w-3 h-3" style={{ color: isFavorite ? '#F59E0B' : '#9CA3AF', fill: isFavorite ? '#F59E0B' : 'none' }} />
        </button>
      )}
    </div>
  );
}


