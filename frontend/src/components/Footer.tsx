import { Code2 } from 'lucide-react';

interface FooterProps {
  onShowCreator?: () => void;
  variant?: 'default' | 'auth';
}

export default function Footer({ onShowCreator, variant = 'default' }: FooterProps) {
  const isAuth = variant === 'auth';

  return (
    <footer
      className={`w-full border-t ${
        isAuth
          ? 'border-white/10 bg-[#05070f]/85 text-slate-400'
          : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs">
        <p className="flex items-center gap-1.5">
          {onShowCreator ? (
            <button
              onClick={onShowCreator}
              className={`inline-flex items-center gap-1.5 font-medium transition-colors hover:underline ${
                isAuth ? 'text-slate-300 hover:text-white' : 'text-slate-700 hover:text-brand-700'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Designed &amp; Developed by Adonai A. Magno
            </button>
          ) : (
            <span className="flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5" />
              Designed &amp; Developed by Adonai A. Magno
            </span>
          )}
        </p>
        <p className={isAuth ? 'text-slate-500' : 'text-slate-400'}>
          &copy; 2026 All Rights Reserved
        </p>
      </div>
    </footer>
  );
}
