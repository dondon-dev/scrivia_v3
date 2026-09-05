import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export interface SearchSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowFreeText?: boolean;
  inputClassName?: string;
}

export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = '— Select —',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches found',
  allowFreeText = false,
  inputClassName = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [freeText, setFreeText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  function handleSelect(val: string) {
    onChange(val);
    setOpen(false);
    setQuery('');
  }

  const displayValue = open
    ? (allowFreeText ? (freeText || query) : query)
    : (selected ? selected.label : value || placeholder);

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => { setOpen((o) => !o); setFreeText(allowFreeText ? (selected ? selected.label : value) : ''); }}
        className={`w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-1 focus:ring-amber-500/30 cursor-pointer flex items-center justify-between gap-2 ${inputClassName}`}
      >
        <span className={`truncate ${selected || value ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>
          {selected ? selected.label : (allowFreeText ? (value || placeholder) : value || placeholder)}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                ref={inputRef}
                value={allowFreeText ? freeText : query}
                onChange={(e) => {
                  if (allowFreeText) {
                    setFreeText(e.target.value);
                    setQuery(e.target.value);
                    onChange(e.target.value);
                  } else {
                    setQuery(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && allowFreeText) {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-7 pr-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm outline-none focus:ring-1 focus:ring-amber-500/30 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && !allowFreeText ? (
              <p className="px-3 py-4 text-center text-xs text-slate-400">{emptyText}</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  onClick={() => handleSelect(o.value)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-between gap-2 ${
                    o.value === value ? 'bg-amber-50/50 dark:bg-slate-700/50 text-amber-700 dark:text-amber-300 font-medium' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))
            )}
            {filtered.length === 0 && allowFreeText && (
              <p className="px-3 py-3 text-center text-xs text-slate-400">Press Enter to use "{freeText}"</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
