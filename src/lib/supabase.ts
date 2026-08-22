import { createClient } from '@supabase/supabase-js';
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast with an actionable message instead of a cryptic createClient() error.
  throw new Error(
    'SCRIVIA CLOUD is missing Supabase credentials. Add VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY (Supabase Dashboard → Project Settings → API) to ' +
      'your environment keys and restart the dev server.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Raw project URL / anon key — needed for direct fetch calls (e.g. streaming
 *  edge function responses, which supabase-js's functions.invoke can't read). */
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

/**
 * Human-readable message from any thrown value. Supabase rejects with plain
 * PostgrestError objects (not Error instances), so `String(err)` renders as
 * "[object Object]" and hides the real reason (missing table, RLS denial,
 * constraint violation, …). Extracts the most useful field, then falls back
 * to JSON for anything else.
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const m = o.message ?? o.error_description ?? o.details ?? o.hint ?? o.error;
    if (typeof m === 'string' && m.trim()) return m;
    try { return JSON.stringify(o); } catch { /* fall through */ }
  }
  return String(err);
}

/**
 * Any Postgrest query builder, parameterized by its row type T so callers
 * keep full type inference on the rows they receive back.
 */
type AnyQueryBuilder<T> = PostgrestFilterBuilder<any, any, any, T[], any, any, 'GET'>;

/** Result of a batched query that may fail; `error` is intentionally loose. */
type QueryBatchResult<T> = { data: T[] | null; error: unknown };

/**
 * Fetches ALL rows from a table by paginating through the Supabase
 * default 1,000-row limit. Accepts a function that returns a fresh
 * query builder (so .range() can be applied on each iteration).
 *
 * Usage:
 *   const rows = await fetchAll(() => supabase.from('employees').select('*'));
 */
export async function fetchAll<T = never>(
  queryFn: () => AnyQueryBuilder<T>,
  pageSize = 1000,
): Promise<T[]> {
  const first = await queryFn().range(0, pageSize - 1);
  if (first.error) throw first.error;
  if (!first.data || first.data.length === 0) return [];
  if (first.data.length < pageSize) return first.data;

  // First page was full — more pages likely exist. Prefetch up to 8
  // concurrently, then continue sequentially if still more remain.
  const rows: T[] = [...first.data];
  const CONCURRENCY = 8;
  let nextOffset = pageSize;
  let done = false;

  while (!done) {
    const batch: Promise<QueryBatchResult<T>>[] = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      const off = nextOffset + i * pageSize;
      batch.push(
        Promise.resolve(queryFn().range(off, off + pageSize - 1))
          .then((r) => ({ data: r.data, error: r.error }))
          .catch((e: unknown) => ({ data: null, error: e })),
      );
    }

    for (const p of batch) {
      const r = await p;
      if (r.error) throw r.error;
      if (!r.data || r.data.length === 0) { done = true; break; }
      rows.push(...r.data);
      nextOffset += pageSize;
      if (r.data.length < pageSize) { done = true; break; }
    }
  }

  return rows;
}

/**
 * Split a large `.in()` filter across multiple requests so the URL doesn't
 * exceed the browser's fetch limit. Returns merged data rows.
 *
 * Each chunk is handed to `queryFn` (which typically applies `.in(column, chunk)`
 * itself) and the results are merged, paginating past 1,000 rows per chunk
 * when needed.
 */
export async function chunkedIn<T = never>(
  column: string,
  values: string[] | number[],
  queryFn: (chunk: string[] | number[]) => AnyQueryBuilder<T>,
  chunkSize = 200,
): Promise<T[]> {
  if (values.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const rows = await fetchAll(() => queryFn(chunk).in(column, chunk));
    results.push(...rows);
  }
  return results;
}
