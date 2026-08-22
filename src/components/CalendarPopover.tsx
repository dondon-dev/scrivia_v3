import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarPopoverProps {
  date: Date;
  label?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CalendarPopover({ date, label = 'Last login' }: CalendarPopoverProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: date.getFullYear(), month: date.getMonth() });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const firstDay = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const isToday = (d: number) => {
    const t = new Date();
    return d === t.getDate() && view.month === t.getMonth() && view.year === t.getFullYear();
  };
  const isSelected = (d: number) =>
    d === date.getDate() && view.month === date.getMonth() && view.year === date.getFullYear();

  const prevMonth = () => setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }));
  const nextMonth = () => setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }));

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dateStr = date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs text-slate-500 border-l border-slate-200 pl-3 hover:text-slate-700 transition-colors group"
      >
        <Calendar className="w-4 h-4 text-slate-400 group-hover:text-brand-500 transition-colors" />
        <span className="text-slate-400">{label}:</span>
        <span className="font-medium text-slate-600 group-hover:text-slate-800 transition-colors">{dateStr}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white">
            <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-white/15 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold">{MONTHS[view.month]} {view.year}</span>
            <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-white/15 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 px-2 pt-3 pb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                {d.slice(0, 2)}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5 px-2 pb-3">
            {cells.map((d, i) => (
              <div key={i} className="aspect-square flex items-center justify-center">
                {d && (
                  <span
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                      isSelected(d)
                        ? 'bg-brand-600 text-white font-semibold shadow-sm'
                        : isToday(d)
                        ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                        : 'text-slate-600 hover:bg-slate-100 cursor-default'
                    }`}
                  >
                    {d}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {isToday(date.getDate()) && view.month === date.getMonth() ? 'Today' : date.toLocaleDateString('en-PH', { dateStyle: 'full' })}
            </span>
            <button
              onClick={() => { setView({ year: date.getFullYear(), month: date.getMonth() }); }}
              className="text-[11px] text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              Jump to date
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
