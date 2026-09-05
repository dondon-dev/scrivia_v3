import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  icon: LucideIcon;
  description?: string;
}

export default function ComingSoon({ title, icon: Icon, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4 ring-1 ring-amber-200 dark:ring-amber-800/40">
        <Icon className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md">
        {description ?? 'This module is part of the enterprise navigation and will be available in a future update.'}
      </p>
      <div className="flex items-center gap-2 mt-4 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
        <Construction className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Under Development</span>
      </div>
    </div>
  );
}
