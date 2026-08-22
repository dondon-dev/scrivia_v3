import { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';

interface DeleteAllConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  count: number;
  label: string;
  description: string;
}

export default function DeleteAllConfirm({
  open, onClose, onConfirm, title, count, label, description,
}: DeleteAllConfirmProps) {
  const [step, setStep] = useState<'warn' | 'type' | 'deleting'>('warn');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const confirmWord = 'DELETE';

  function reset() {
    setStep('warn');
    setTyped('');
    setError('');
  }

  function handleClose() {
    if (step === 'deleting') return;
    reset();
    onClose();
  }

  async function handleConfirm() {
    if (typed !== confirmWord) {
      setError(`You must type "${confirmWord}" exactly to proceed.`);
      return;
    }
    setStep('deleting');
    setError('');
    try {
      await onConfirm();
      reset();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Failed to delete records.');
      setStep('type');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-rose-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={step === 'deleting'}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {step === 'warn' && (
            <>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-rose-800 mb-2">
                  You are about to permanently delete {count.toLocaleString()} {label}.
                </p>
                <p className="text-sm text-rose-700">{description}</p>
              </div>
              <ul className="space-y-1.5 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                  All {count.toLocaleString()} records will be permanently removed from the database.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                  This action cannot be undone.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                  Consider exporting a backup before proceeding.
                </li>
              </ul>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('type')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Yes, Continue
                </button>
              </div>
            </>
          )}

          {step === 'type' && (
            <>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                <p className="text-sm text-rose-700 mb-1">
                  To confirm, type <span className="font-bold tracking-wider text-rose-900">{confirmWord}</span> in the box below.
                </p>
                <p className="text-xs text-rose-600">
                  This will permanently delete {count.toLocaleString()} {label}.
                </p>
              </div>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 text-rose-700 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
              <input
                type="text"
                value={typed}
                onChange={(e) => { setTyped(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                autoFocus
                placeholder={`Type ${confirmWord} here`}
                className="w-full px-4 py-3 rounded-lg border-2 border-rose-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 uppercase tracking-wider"
              />
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => { reset(); }}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={typed !== confirmWord}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete All {count.toLocaleString()} Records
                </button>
              </div>
            </>
          )}

          {step === 'deleting' && (
            <div className="py-12 flex flex-col items-center gap-4">
              <ScriviaLogo className="w-10 h-10 animate-pulse" />
              <p className="text-sm font-medium text-slate-700">Deleting {count.toLocaleString()} records…</p>
              <p className="text-xs text-slate-400">Please do not close this window.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
