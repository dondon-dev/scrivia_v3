import { type NavSection, type NavItem } from '@/lib/navConfig';
import { usePermissions } from '@/lib/permissions';

interface FlyoutMenuProps {
  section: NavSection;
  activeNavId: string;
  top: number;
  collapsed?: boolean;
  onNavigate: (item: NavItem) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function FlyoutMenu({ section, activeNavId, top, collapsed, onNavigate, onMouseEnter, onMouseLeave }: FlyoutMenuProps) {
  const { hasPermission } = usePermissions();

  // Build groups
  const groups: { label: string; items: NavItem[] }[] = [];
  if (section.items && section.items.length > 0) {
    const filtered = section.items.filter((i) => hasPermission(i.permission));
    if (filtered.length > 0) groups.push({ label: section.label, items: filtered });
  }
  if (section.subGroups) {
    for (const sg of section.subGroups) {
      const filtered = sg.items.filter((i) => hasPermission(i.permission));
      if (filtered.length > 0) groups.push({ label: sg.label, items: filtered });
    }
  }

  // Clamp top so flyout stays within viewport
  const maxTop = typeof window !== 'undefined' ? window.innerHeight - 400 : 600;
  const clampedTop = Math.min(Math.max(top, 60), maxTop);

  // Position: collapsed sidebar is 80px (lg:w-20), expanded is 288px (lg:w-72)
  const leftPos = collapsed ? 80 : 288;

  return (
    <div
      className="fixed z-50"
      style={{ top: clampedTop, left: leftPos }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="w-60 border border-gray-300 rounded-r-xl shadow-2xl overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 80px)', backgroundColor: '#D9D9DB', fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif', fontSize: '14px', fontWeight: 500, lineHeight: '20px' }}
      >
        {/* Items */}
        <div className="py-1.5">
          {groups.map((group) => (
            <div key={group.label}>
              {groups.length > 1 && (
                <p className="text-[9px] font-semibold uppercase tracking-wider px-3 pt-2 pb-0.5" style={{ color: '#6B6B6B' }}>
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeNavId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors text-left hover:bg-gray-300"
                    style={active ? { backgroundColor: '#078A8C', color: '#fff' } : { color: '#2F3B57' }}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
