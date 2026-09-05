import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ScriviaLogo } from '@/components/ScriviaLogo';

/** Max auto page-reloads per screen per session before showing the panel. */
const MAX_AUTO_RELOADS = 2;

/**
 * True when the failure is a lazy-loaded module / chunk that couldn't be
 * fetched (stale module graph, dev server cycling, deploy in progress).
 * These are recovered by a fresh page load; a genuine render crash is not.
 */
function isModuleLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError')
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Label shown in the heading (e.g. the view name). */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors so a failing view shows a readable panel with
 * the actual error message instead of unmounting the whole app into a white
 * screen. When the failure is a lazy module that couldn't be fetched, it
 * automatically reloads the page (bounded, per screen) — the standard
 * recovery for stale chunk/module graphs — before falling back to the panel.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(`[ErrorBoundary] ${this.props.label ?? 'view'} failed:`, error, info);
    if (isModuleLoadError(error)) {
      const key = `scrivia:module-reload:${this.props.label ?? 'view'}`;
      const count = Number(sessionStorage.getItem(key) ?? 0);
      if (count < MAX_AUTO_RELOADS) {
        sessionStorage.setItem(key, String(count + 1));
        // A failed dynamic import is fixed by a fresh page load: the browser
        // rebuilds the module graph and re-fetches the module from the
        // (now healthy) dev server / CDN.
        window.location.reload();
      }
    }
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    // A failed module import can't be retried in place (React caches the
    // rejected lazy payload) — a full page reload is the only recovery.
    const moduleError = isModuleLoadError(error);

    return (
      <div className="flex items-center justify-center p-6 min-h-[60vh]">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900/60 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-100 dark:border-rose-900/40">
            <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/60 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-rose-800 dark:text-rose-200">
                {this.props.label ?? 'This screen'} hit an unexpected error
              </h2>
              <p className="text-xs text-rose-600 dark:text-rose-300/80 mt-0.5">
                The app is still running — reload this screen to try again.
              </p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <pre className="text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words">
              {error.message || String(error)}
            </pre>
            <div className="flex items-center justify-end gap-3">
              {moduleError ? (
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Reload Page
                </button>
              ) : (
                <>
                  <button
                    onClick={this.handleReset}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> Reload
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                  >
                    <ScriviaLogo className="w-4 h-4" /> Reload App
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
