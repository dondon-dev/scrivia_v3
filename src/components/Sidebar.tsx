import { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  X, ChevronDown, ChevronRight, ChevronLeft, Search,
  Star, LogOut, Code2, LayoutDashboard, Clock,
  type LucideIcon,
} from 'lucide-react';
import { ScriviaLogo, ScriviaWordmark } from '@/components/ScriviaLogo';
import type { UserProfile } from '@/types/auth';
import { ROLE_LABELS } from '@/types/auth';
import { usePermissions } from '@/lib/permissions';
import RegionDivisionSelector from '@/components/RegionDivisionSelector';
import type { PayrollCategory } from '@/lib/categories';
import {
  NAV_SECTIONS, type NavSection, type NavSubGroup, type NavItem, type ViewKey,
  findNavItem,
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
    onNavigate, onToggleCollapse, onCloseMobile, onSignOut, onHoverSection,
  } = props;

  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [expandedSubGroups, setExpandedSubGroups] = useState<Record<string, boolean>>({});
  const { hasPermission } = usePermissions();

  useEffect(() => {
    try {
      const favRaw = localStorage.getItem(FAV_KEY);
      if (favRaw) setFavorites(JSON.parse(favRaw));
      const recentRaw = localStorage.getItem(RECENT_KEY);
      if (recentRaw) setRecents(JSON.parse(recentRaw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!activeNavId) return;
    for (const section of NAV_SECTIONS) {
      const contains = section.items?.some((i) => i.id === activeNavId) ||
        section.subGroups?.some((sg) => sg.items.some((i) => i.id === activeNavId));
      if (contains) {
        setExpandedSections((prev) => ({ ...prev, [section.id]: true }));
        if (section.subGroups) {
          for (const sg of section.subGroups) {
            if (sg.items.some((i) => i.id === activeNavId)) {
              setExpandedSubGroups((prev) => ({ ...prev, [sg.id]: true }));
            }
          }
        }
      }
    }
  }, [activeNavId]);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [id, ...prev].slice(0, MAX_FAVORITES);
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleItemClick(item: NavItem, category: PayrollCategory | null) {
    setRecents((prev) => {
      const next = [item.id, ...prev.filter((r) => r !== item.id)].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
    onNavigate(item, category);
  }

  const filteredSections = useMemo(() => {
    return NAV_SECTIONS
      .filter((section) => section.id !== 'notifications') // Notifications moved to topbar flyout
      .map((section) => {
        const filterItem = (item: NavItem) => hasPermission(item.permission);
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
      }).filter((section) => {
        const hasItems = (section.items?.length ?? 0) > 0;
        const hasSubItems = (section.subGroups?.length ?? 0) > 0;
        return hasItems || hasSubItems;
      });
  }, [hasPermission]);

  const flatSearchItems = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const result: { item: NavItem; sectionLabel: string }[] = [];
    for (const section of filteredSections) {
      if (section.items) {
        for (const item of section.items) {
          if (item.label.toLowerCase().includes(q)) {
            result.push({ item, sectionLabel: section.label });
          }
        }
      }
      if (section.subGroups) {
        for (const sg of section.subGroups) {
          for (const item of sg.items) {
            if (item.label.toLowerCase().includes(q)) {
              result.push({ item, sectionLabel: `${section.label} › ${sg.label}` });
            }
          }
        }
      }
    }
    return result;
  }, [filteredSections, searchQuery]);

  const favoriteItems = useMemo(() => {
    return favorites
      .map((id) => findNavItem(id))
      .filter((item): item is NavItem => !!item && hasPermission(item.permission));
  }, [favorites, hasPermission]);

  const recentItems = useMemo(() => {
    return recents
      .map((id) => findNavItem(id))
      .filter((item): item is NavItem => !!item && hasPermission(item.permission))
      .filter((item) => item.id !== activeNavId)
      .slice(0, MAX_RECENT);
  }, [recents, hasPermission, activeNavId]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <aside
      className={`fixed lg:static inset-y-0 left-0 z-[60] ${collapsed ? 'lg:w-20' : 'lg:w-72'} w-72 flex flex-col transition-all duration-300 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
      style={{ fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif', fontSize: '14px', fontWeight: 500, lineHeight: '20px' }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 h-16 border-b border-white/10 shrink-0 relative overflow-hidden ${collapsed ? 'lg:px-3 px-5' : 'px-5'}`}>
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-nexora-500/20 blur-2xl" />
        <ScriviaLogo light className="w-10 h-10 shrink-0 relative" />
        {!collapsed && (
          <ScriviaWordmark light size="sm" className="flex-1 min-w-0 overflow-hidden relative" />
        )}
        <button
          onClick={onCloseMobile}
          className="ml-auto lg:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content below logo — light background with dark text */}
      <div className="flex-1 flex flex-col" style={{ backgroundColor: '#D9D9DB', color: '#2F3B57' }}>
        {/* Region / Division */}
        {!collapsed && <RegionDivisionSelector />}

        {/* Search */}
      {!collapsed && (
        <div className="px-3 py-2.5 border-b border-white/10 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-deped-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search menu…  (⌘K)"
              className="w-full pl-8 pr-7 py-2 rounded-lg bg-white text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#078A8C]/50 transition-all" style={{ color: '#2F3B57' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-deped-300 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className={`flex-1 px-3 py-3 overflow-y-auto sidebar-scroll ${collapsed ? 'lg:px-2' : ''}`}>


        {/* Favorites */}
        {!isSearching && !collapsed && favoriteItems.length > 0 && (
          <div className="mb-2">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: '#6B6B6B' }}>
              <Star className="w-3 h-3 fill-amber-300/80" /> Favorites
            </p>
            {favoriteItems.map((item) => (
              <NavLeaf
                key={item.id}
                item={item}
                active={activeNavId === item.id}
                onClick={(it) => handleItemClick(it, props.globalCategory)}
                isFavorite
                onToggleFavorite={() => toggleFavorite(item.id)}
              />
            ))}
          </div>
        )}

        {/* Search results */}
        {isSearching && !collapsed && (
          <div className="space-y-0.5">
            {flatSearchItems.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: '#6B6B6B' }}>No results for "{searchQuery}"</p>
            ) : (
              flatSearchItems.map(({ item }) => (
                <NavLeaf
                  key={item.id}
                  item={item}
                  active={activeNavId === item.id}
                  onClick={(it) => { handleItemClick(it, props.globalCategory); setSearchQuery(''); }}
                  isFavorite={favorites.includes(item.id)}
                  onToggleFavorite={() => toggleFavorite(item.id)}
                  showSection
                />
              ))
            )}
          </div>
        )}

        {/* Main navigation with cascading flyouts */}
        {!isSearching && (
          filteredSections.map((section) => {
            // Leaf sections (Dashboard, Import and Backup) — single clickable item
            if (section.leaf && section.items && section.items.length > 0) {
              const item = section.items[0];
              return (
                <NavLeaf
                  key={section.id}
                  item={item}
                  active={activeNavId === item.id}
                  onClick={(it) => handleItemClick(it, props.globalCategory)}
                  isFavorite={favorites.includes(item.id)}
                  onToggleFavorite={() => toggleFavorite(item.id)}
                  collapsed={collapsed}
                  stacodeBadgeCount={stacodeBadge}
                />
              );
            }
            // Sections with flyout submenu
            return (
              <FlyoutSection
                key={section.id}
                section={section}
                collapsed={collapsed}
                activeNavId={activeNavId}
                stacodeBadge={stacodeBadge}
                globalCategory={props.globalCategory}
                onNavigate={handleItemClick}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onHoverSection={onHoverSection}
              />
            );
          })
        )}

        {/* About the Creator */}
        {!isSearching && (
          <div className="pt-2 mt-2 border-t border-white/10">
            <NavLeaf
              item={{ id: 'creator', label: 'About the Creator', icon: Code2, permission: 'dashboard', viewKey: 'creator' }}
              active={activeNavId === 'creator'}
              onClick={(item) => handleItemClick(item, null)}
              collapsed={collapsed}
            />
          </div>
        )}
      </nav>
      </div>{/* End content below logo */}

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="hidden lg:flex items-center justify-center gap-2 py-3 border-t border-gray-300 transition-colors text-xs font-medium shrink-0 hover:bg-gray-300"
        style={{ color: '#6B6B6B' }}
      >
        <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        {!collapsed && <span>Collapse</span>}
      </button>

      {/* User profile */}
      <div className="px-3 py-3 border-t border-gray-300 shrink-0" style={{ backgroundColor: '#D9D9DB' }}>
        <div className={`flex items-center gap-3 px-2 py-2 ${collapsed ? 'lg:justify-center' : ''}`}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ backgroundColor: '#078A8C', color: '#fff' }}>
            {profile.first_name?.[0]?.toUpperCase() ?? profile.email[0]?.toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" style={{ color: '#2F3B57' }}>{profile.first_name} {profile.last_name}</p>
              <p className="text-[11px]" style={{ color: '#6B6B6B' }}>{ROLE_LABELS[profile.role]}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onSignOut}
            className="w-full mt-2 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-gray-300"
            style={{ color: '#2F3B57' }}
          >
            <LogOut className="w-[18px] h-[18px]" />
            Sign Out
          </button>
        )}
      </div>
    </aside>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NavLeaf — single clickable item
// ══════════════════════════════════════════════════════════════════════════════

interface NavLeafProps {
  item: NavItem;
  active: boolean;
  onClick: (item: NavItem) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  compact?: boolean;
  collapsed?: boolean;
  showSection?: boolean;
  stacodeBadgeCount?: number;
}

function NavLeaf({ item, active, onClick, isFavorite, onToggleFavorite, compact, collapsed, showSection, stacodeBadgeCount = 0 }: NavLeafProps) {
  const Icon = item.icon;
  if (collapsed) {
    return (
      <div className="relative mb-1">
        {active && (
          <motion.span
            layoutId="nexora-sidebar-active"
            className="sidebar-accent"
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
        <button
          onClick={() => onClick(item)}
          title={item.label}
          className={`w-full flex items-center justify-center px-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            active ? 'text-white' : 'hover:bg-gray-300'
          }`}
          style={active ? { backgroundColor: '#078A8C', color: '#fff' } : { color: '#2F3B57' }}
        >
          <Icon className="w-5 h-5 shrink-0" />
        </button>
        {item.badgeKey === 'stacode' && stacodeBadgeCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-semibold tabular">{stacodeBadgeCount}</span>
        )}
      </div>
    );
  }
  return (
    <div className="group relative flex items-center gap-0.5 mb-0.5">
      {active && (
        <motion.span
          layoutId="nexora-sidebar-active"
          className="sidebar-accent"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <button
        onClick={() => onClick(item)}
        className={`flex-1 flex items-center gap-2.5 ${compact ? 'pl-2 pr-1 py-1.5' : 'pl-3 pr-1 py-2'} rounded-lg text-[13px] font-medium transition-colors ${
          active ? 'shadow-sm' : 'hover:bg-gray-300'
        }`}
        style={active ? { backgroundColor: '#078A8C', color: '#fff' } : { color: '#2F3B57' }}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">
          {item.label}
          {showSection && <span className="block text-[9px] font-normal" style={{ color: '#6B6B6B' }}>{''}</span>}
        </span>
        {item.badgeKey === 'stacode' && stacodeBadgeCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-semibold tabular">{stacodeBadgeCount}</span>
        )}
      </button>
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          className={`p-1 rounded transition-opacity ${
            isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Star className="w-3 h-3" style={{ color: isFavorite ? '#F59E0B' : '#6B6B6B', fill: isFavorite ? '#F59E0B' : 'none' }} />
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FlyoutSection — QuickBooks-style cascading flyout submenu
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// FlyoutSection — triggers flyout column via onHoverSection callback
// ══════════════════════════════════════════════════════════════════════════════

interface FlyoutSectionProps {
  section: NavSection;
  collapsed: boolean;
  activeNavId: string;
  stacodeBadge: number;
  globalCategory: PayrollCategory | null;
  onNavigate: (item: NavItem, category: PayrollCategory | null) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onHoverSection?: (sectionId: string | null, top?: number) => void;
}

function FlyoutSection({
  section, collapsed, activeNavId, onHoverSection,
}: FlyoutSectionProps) {
  const SectionIcon = section.icon;
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const hasActiveChild = section.items?.some((i) => i.id === activeNavId) ||
    section.subGroups?.some((sg) => sg.items.some((i) => i.id === activeNavId));

  function handleMouseEnter() {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(() => {
      const top = rowRef.current?.getBoundingClientRect().top ?? 60;
      onHoverSection?.(section.id, top);
    }, 50);
  }

  function handleMouseLeave() {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    onHoverSection?.(null);
  }

  const hasItems = (section.items && section.items.length > 0) || (section.subGroups && section.subGroups.length > 0);

  if (collapsed) {
    return (
      <div
        ref={rowRef}
        className="mb-1 relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          title={section.label}
          className={`w-full flex items-center justify-center px-2 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
            hasActiveChild ? '' : 'hover:bg-gray-300'
          }`}
          style={hasActiveChild ? { backgroundColor: '#078A8C', color: '#fff' } : { color: '#2F3B57' }}
        >
          <SectionIcon className="w-5 h-5 shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className="mb-1 relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors ${
          hasActiveChild ? '' : 'hover:bg-gray-300'
        }`}
        style={hasActiveChild ? { backgroundColor: '#078A8C', color: '#fff' } : { color: '#2F3B57' }}
      >
        <SectionIcon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{section.label}</span>
        {hasItems && <ChevronRight className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />}
      </button>
    </div>
  );
}
