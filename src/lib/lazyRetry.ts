import { lazy, type ComponentType } from 'react';

/**
 * Backoff schedule (ms) between dynamic-import retries. A short dev-server
 * blip recovers within a second; a full dev-server cycle (restart after file
 * edits, dependency re-optimization) can take 15–20s to come back, so the
 * schedule extends well past that before the view gives up and falls back to
 * the error panel + page reload.
 */
const RETRY_DELAYS_MS = [400, 800, 1500, 3000, 6000, 12000];

/**
 * Calls `importer()` and, if it rejects (e.g. "Failed to fetch dynamically
 * imported module"), retries with backoff. Only throws once every attempt has
 * failed, so a transient module-server hiccup self-heals instead of crashing
 * the view.
 */
export async function retryImport<T>(
  importer: () => Promise<T>,
  delays: number[] = RETRY_DELAYS_MS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await importer();
    } catch (err) {
      lastError = err;
      if (attempt < delays.length) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
  }
  throw lastError;
}

/**
 * Drop-in replacement for React's `lazy()` that retries the module fetch with
 * backoff before the import finally rejects.
 */
export function lazyRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(() => retryImport(importer));
}
