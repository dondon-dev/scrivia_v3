/**
 * PocketBase Client Adapter — drop-in replacement for Supabase client.
 *
 * Exports `supabase`, `fetchAll`, `chunkedIn`, `formatError`, `rpc` and
 * aliases that every existing file imports from '@/lib/pb'.
 *
 * Architecture:
 *   React frontend  →  PocketBase HTTP API  →  SQLite (single .db file)
 *   Litestream       →  continuously streams WAL to Cloudflare R2 / S3
 */
import PocketBase, { RecordService, type RecordModel } from 'pocketbase';

// ── PocketBase URL resolution ───────────────────────────────────────────────
// The API base URL comes exclusively from the build-time env var VITE_PB_URL:
//   .env.local      → the local dev PocketBase   (see .env.local)
//   .env.production → the deployed PocketBase    (see .env.production)
// There is deliberately NO code fallback pointing at a localhost URL, so a
// production bundle can never dial the visitor's own machine (that is what
// caused the CSP / upgrade-insecure-requests failures on the deployed
// scriviapayroll.com site). With no env var set, '/' means same-origin
// (PocketBase serving the SPA + API from one origin, as in the Docker deploy).
const PB_URL =
  ((import.meta.env.VITE_PB_URL as string | undefined) ?? '')
    .trim()
    .replace(/\/+$/, '') || '/';

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

// ── Timestamp aliasing ───────────────────────────────────────────────────────
// PocketBase stamps every record with system `created`/`updated` fields, but
// most collections in this app have NO custom `created_at`/`updated_at` fields —
// the Supabase-port code queries them by name anyway, which makes PocketBase
// return 400 ("failed to resolve field"). Alias the *_at names to the system
// fields on the way in, and back-fill them on the way out so callers that read
// `rec.created_at` keep working unchanged.
const TIMESTAMP_ALIAS: Record<string, string> = {
  created_at: 'created',
  updated_at: 'updated',
};
const tsCol = (col: string) => TIMESTAMP_ALIAS[col] ?? col;
const tsBackfill = (rec: any): any => {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return rec;
  let out = rec;
  if (rec.created && rec.created_at == null) out = { ...out, created_at: rec.created };
  if (rec.updated && rec.updated_at == null) out = { ...out, updated_at: rec.updated };
  return out;
};

// Legacy aliases so existing code that references these still compiles.
export const SUPABASE_URL = PB_URL;
export const SUPABASE_ANON_KEY = '';
export const PB_API_URL = PB_URL;

// ── Error formatter ────────────────────────────────────────────────────────

export function formatError(err: any, _context?: any): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  const m = err.message ?? err.data?.message ?? err.error?.message ?? err.error_description;
  if (typeof m === 'string' && m.trim()) return m;
  try { return JSON.stringify(err); } catch { return String(err); }
}

// ── Bounded-concurrency write pool ────────────────────────────────────────
// PocketBase has no batch-write endpoint, so bulk operations (payroll runs,
// Smart Import, DBF sync) issue one HTTP request per record. Doing that
// sequentially makes a multi-thousand-employee payroll run take many minutes;
// a small concurrency pool (12 in flight) cuts the wall time by ~12x while
// staying polite to the server — no request storm, no connection exhaustion.
const WRITE_CONCURRENCY = 12;

async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number = WRITE_CONCURRENCY,
): Promise<void> {
  if (items.length === 0) return;
  let nextIdx = 0;
  async function runner(): Promise<void> {
    while (true) {
      const i = nextIdx++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  }
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runner(),
  );
  await Promise.all(runners);
}

// ── fetchAll — works with both string collection names AND arrow functions ─

export async function fetchAll<T = any>(
  collectionOrFn: string | RecordService | (() => any),
  filterOrPageSize?: string | number,
  sort?: string,
  expand?: string,
  batchSize = 1000,
): Promise<T[]> {
  // If caller passed an arrow function like () => supabase.from('employees').select('*'),
  // invoke it and extract the builder results.
  if (typeof collectionOrFn === 'function') {
    try {
      const result = await collectionOrFn();
      // The result could be a SupabaseQueryBuilder (then await it) or already data
      if (result && typeof result.then === 'function') {
        const awaited = await result;
        if (Array.isArray(awaited)) return awaited as T[];
        if (awaited?.data && Array.isArray(awaited.data)) return awaited.data as T[];
        return (awaited ?? []) as T[];
      }
      if (result?.data && Array.isArray(result.data)) return result.data as T[];
      if (Array.isArray(result)) return result as T[];
      return [];
    } catch {
      return [];
    }
  }

  // String collection name — use PocketBase API. getFullList() walks every page
  // automatically and has no per-page cap, which is what we want for "all rows".
  const svc = typeof collectionOrFn === 'string'
    ? pb.collection(collectionOrFn)
    : collectionOrFn;

  const filter = typeof filterOrPageSize === 'string' ? filterOrPageSize : '';
  const all = await svc.getFullList<T>({
    filter: filter ?? '',
    sort: sort ?? '-created',
    expand: expand ?? '',
    // PocketBase caps every page at 500; asking the SDK for larger batches makes
    // getFullList stop after the first page and silently truncate the result.
    batch: Math.min(batchSize, 500),
    requestKey: null,
  });
  return all;
}

// ── chunkedIn ──────────────────────────────────────────────────────────────

export async function chunkedIn<T = any>(
  column: string,
  values: (string | number)[],
  queryFn: (chunk: (string | number)[]) => any,
  // PocketBase's filter parser 400s on OR-expansions much above ~100 terms
  // ("Something went wrong while processing your request."), and `.in()`
  // expands every value into one OR term. 60 keeps every sub-query well under
  // that ceiling while still batching lookups efficiently.
  chunkSize = 60,
): Promise<T[]> {
  if (values.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const builder = queryFn(chunk);
    let rows: T[] = [];
    if (builder && typeof builder.then === 'function') {
      const result = await builder;
      if (Array.isArray(result)) rows = result;
      else if (result?.data && Array.isArray(result.data)) rows = result.data;
      else if (result?.items) rows = result.items;
    } else if (builder?.data) {
      rows = Array.isArray(builder.data) ? builder.data : [];
    }
    results.push(...rows);
  }
  return results;
}

// ── RPC helper ─────────────────────────────────────────────────────────────

const RPC_MAP: Record<string, string> = {
  approve_user: 'auth/approve',
  reject_user: 'auth/reject',
  disable_user: 'auth/disable',
  enable_user: 'auth/enable',
  issue_mfa_code: 'auth/mfa/issue',
  verify_mfa_code: 'auth/mfa/verify',
  get_role_permissions: 'permissions',
  upsert_role_permission: 'permissions/upsert',
  delete_role_permission: 'permissions/delete',
  mark_email_verified: 'auth/mark-verified',
  record_failed_login: 'auth/record-failed-login',
  record_successful_login: 'auth/record-successful-login',
  get_dashboard_summary: 'dashboard/summary',
  refresh_dashboard_cache: 'dashboard/refresh-cache',
  get_dbf_table_counts_by_category: 'dbf/table-counts',
  query_dedfile: 'dbf/query-dedfile',
  query_employees: 'employees/query',
  set_employee_number: 'employees/set-number',
  run_payroll: 'payroll/run',
  run_payroll_engine: 'payroll/run',
  reverse_payroll: 'payroll/reverse',
  get_payroll_engine_stats: 'payroll/engine-stats',
  generate_monthly_periods: 'payroll/generate-periods',
  get_deduction_engine_stats: 'payroll/deduction-engine',
  get_school_stats: 'schools/stats',
  query_schools_with_stats: 'query-schools-with-stats',
};

export async function rpc(
  name: string,
  params?: Record<string, any>,
): Promise<{ data: any; error: any | null }> {
  const endpoint = RPC_MAP[name] ?? name;
  try {
    const result = await pb.send(`/api/${endpoint}`, {
      method: 'POST',
      body: params ?? {},
    });
    return { data: result, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ── Supabase-style query builder ───────────────────────────────────────────

class SupabaseQueryBuilder {
  private _collection: string;
  private _filter: string[] = [];
  private _selectFields = '*';
  private _sortField = '';
  private _rangeFrom = 0;
  private _rangeTo = 0;
  private _limitN = 0;
  private _single = false;
  private _maybeSingle = false;
  private _insertData: any = null;
  private _updateData: any = null;
  private _deleteMode = false;
  private _countOnly = false;
  private _countExact = false;
  private _upsertMode = false;

  constructor(collection: string) {
    this._collection = collection;
  }

  select(fields?: string) {
    this._selectFields = fields ?? '*';
    return this;
  }

  eq(column: string, value: any) {
    column = tsCol(column);
    if (value === null || value === undefined) {
      this._filter.push(`${column} = null`);
    } else if (typeof value === 'string') {
      this._filter.push(`${column} = '${value.replace(/'/g, "''")}'`);
    } else {
      this._filter.push(`${column} = ${value}`);
    }
    return this;
  }

  neq(column: string, value: any) {
    column = tsCol(column);
    if (value === null || value === undefined) {
      this._filter.push(`${column} != null`);
    } else if (typeof value === 'string') {
      this._filter.push(`${column} != '${value.replace(/'/g, "''")}'`);
    } else {
      this._filter.push(`${column} != ${value}`);
    }
    return this;
  }

  gt(column: string, value: any) {
    this._filter.push(`${tsCol(column)} > ${typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value}`);
    return this;
  }

  gte(column: string, value: any) {
    this._filter.push(`${tsCol(column)} >= ${typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value}`);
    return this;
  }

  lt(column: string, value: any) {
    this._filter.push(`${tsCol(column)} < ${typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value}`);
    return this;
  }

  lte(column: string, value: any) {
    this._filter.push(`${tsCol(column)} <= ${typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value}`);
    return this;
  }

  like(column: string, value: string) {
    this._filter.push(`${tsCol(column)} ~ '${value.replace(/'/g, "''")}'`);
    return this;
  }

  ilike(column: string, value: string) {
    this._filter.push(`lower(${tsCol(column)}) ~ lower('${value.replace(/'/g, "''")}')`);
    return this;
  }

  in(column: string, values: any[]) {
    column = tsCol(column);
    if (values.length === 0) return this;
    // PocketBase does not support SQL `IN (...)` or array `~ [...]` filters —
    // only OR-expansion works (verified against the live instance, which 400s
    // on both). Expand `col IN (a, b, ...)` into `col='a' || col='b' || ...`.
    // Callers must keep `values` under ~100 (see chunkedIn) — the PocketBase
    // filter parser rejects longer OR-expansions with a generic 400.
    const ors = values.map((v) => {
      const esc = typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v);
      return `${column} = ${esc}`;
    });
    this._filter.push(`(${ors.join(' || ')})`);
    return this;
  }

  isNull(column: string) {
    this._filter.push(`${tsCol(column)} = null`);
    return this;
  }

  isNotNull(column: string) {
    this._filter.push(`${tsCol(column)} != null`);
    return this;
  }

  or(filter: string) {
    this._filter.push(`(${filter})`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    const dir = opts?.ascending === false ? '-' : '';
    column = tsCol(column);
    this._sortField = this._sortField ? `${this._sortField}, ${dir}${column}` : `${dir}${column}`;
    return this;
  }

  range(from: number, to: number) {
    this._rangeFrom = from;
    this._rangeTo = to;
    return this;
  }

  limit(count: number) {
    this._limitN = count;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  maybeSingle() {
    this._maybeSingle = true;
    return this;
  }

  insert(data: any) {
    this._insertData = data;
    return this;
  }

  update(data: any) {
    this._updateData = data;
    return this;
  }

  upsert(data: any, _opts?: { onConflict?: string }) {
    this._updateData = data;
    this._upsertMode = true;
    return this;
  }

  delete() {
    this._deleteMode = true;
    return this as any;
  }

  count(exact?: string) {
    this._countOnly = true;
    this._countExact = exact === 'exact';
    return this as any;
  }

  // Support then() so the builder can be awaited
  then<TResult = any>(resolve?: (value: any) => TResult | PromiseLike<TResult>, reject?: (reason: any) => TResult | PromiseLike<TResult>): Promise<TResult> {
    return this._execute().then(resolve, reject);
  }

  private _buildFilter(): string {
    return this._filter.join(' && ');
  }

  private async _execute(): Promise<any> {
    try {
      // Handle insert — support both single object and array (batch)
      if (this._insertData) {
        if (Array.isArray(this._insertData)) {
          // PocketBase doesn't accept batch POST with array body.
          // Insert records individually via the SDK, but run them through a
          // bounded-concurrency pool instead of a serial loop.
          const items = this._insertData;
          const results: any[] = [];
          await runPool(items, async (item) => {
            try {
              const created = await pb.collection(this._collection).create(item);
              results.push(created);
            } catch (err: any) {
              // If a record fails, skip it but continue with the rest
              console.warn(`Batch insert skip [${this._collection}]:`, err?.message ?? err);
            }
          });
          return { data: results, error: null };
        }
        const result = await pb.collection(this._collection).create(this._insertData);
        return { data: result, error: null };
      }

      // Handle update / upsert
      if (this._updateData && !this._deleteMode) {
        // Batch upsert: array of objects — create each individually, fall back to update on conflict
        if (this._upsertMode && Array.isArray(this._updateData)) {
          if (typeof window !== 'undefined') (window as any).__PB_BATCH_UPSERT__ = true;
          const items = this._updateData as Record<string, unknown>[];
          const results: any[] = [];
          const errors: string[] = [];

          // Natural key fields per collection for fallback lookup
          const NATURAL_KEYS: Record<string, string[]> = {
            payroll_entries: ['employee_id', 'pay_period_id'],
            employees: ['employee_number', 'empno'],
            deduction_codes: ['dedcode'],
            payroll_deductions: ['employee_id', 'dedcode', 'dedid'],
            deductions: ['employee_id', 'pay_period_id', 'deduction_code', 'source'],
            undeducted_obligations: ['employee_id', 'pay_period_id', 'deduction_code'],
            ca_employees: ['account_no'],
          };
          const keyFields = NATURAL_KEYS[this._collection] ?? [];

          const upsertOne = async (item: Record<string, unknown>): Promise<void> => {
            // If item has an id, try update-first (fast path for existing records)
            if (item.id) {
              try {
                const { id: _id, ...rest } = item;
                const updated = await pb.collection(this._collection).update(item.id as string, rest, { requestKey: null });
                results.push(updated);
                return;
              } catch {
                // Record doesn't exist yet — fall through to create
              }
            }
            // Try create
            try {
              const created = await pb.collection(this._collection).create(item);
              results.push(created);
            } catch (createErr: any) {
              // Create failed (likely duplicate) — try to find and update using natural keys
              try {
                const filterParts: string[] = [];
                for (const k of keyFields) {
                  const v = item[k];
                  if (v != null && v !== '') {
                    filterParts.push(`${k} = '${String(v).replace(/'/g, "''")}'`);
                  }
                }
                // Fallback: if no natural keys matched, use first non-null string field
                if (filterParts.length === 0) {
                  for (const [k, v] of Object.entries(item)) {
                    if (typeof v === 'string' && v && k !== 'id') {
                      filterParts.push(`${k} = '${v.replace(/'/g, "''")}'`);
                      break;
                    }
                  }
                }
                if (filterParts.length > 0) {
                  const existing = await pb.collection(this._collection).getFullList({ filter: filterParts.join(' && '), requestKey: null });
                  if (existing.length > 0) {
                    const { id: _id, ...rest } = item;
                    const updated = await pb.collection(this._collection).update(existing[0].id, rest, { requestKey: null });
                    results.push(updated);
                  } else {
                    errors.push(`Upsert skip: ${createErr?.message ?? 'unknown'}`);
                  }
                } else {
                  errors.push(`Upsert skip: ${createErr?.message ?? 'no key'}`);
                }
              } catch {
                errors.push(`Upsert error: ${createErr?.message ?? 'unknown'}`);
              }
            }
          };

          await runPool(items, upsertOne);
          if (errors.length > 0) console.warn(`Batch upsert [${this._collection}]:`, errors.slice(0, 5));
          return { data: results, error: null };
        }
        if (this._upsertMode && this._updateData.id) {
          // Upsert with explicit id: try update first, fall back to create
          const id = this._updateData.id;
          try {
            const { id: _id, ...rest } = this._updateData;
            const updated = await pb.collection(this._collection).update(id, rest);
            return { data: updated, error: null };
          } catch {
            const created = await pb.collection(this._collection).create(this._updateData);
            return { data: created, error: null };
          }
        }
        // Regular update: find matching records and update each (in parallel)
        const filter = this._buildFilter();
        const existing = await pb.collection(this._collection).getFullList({ filter });
        const results: any[] = [];
        await runPool(existing, async (rec) => {
          results.push(await pb.collection(this._collection).update(rec.id, this._updateData));
        });
        return { data: results, error: null };
      }

      // Handle delete
      if (this._deleteMode) {
        const filter = this._buildFilter();
        const existing = await pb.collection(this._collection).getFullList({ filter });
        await runPool(existing, async (rec) => {
          await pb.collection(this._collection).delete(rec.id);
        });
        // Return { data, error, count } to match Supabase's delete API
        return { data: null, error: null, count: existing.length };
      }

      // Handle count
      if (this._countOnly) {
        const filter = this._buildFilter();
        const result = await pb.collection(this._collection).getList(1, 1, { filter });
        return { count: result.totalItems, error: null, data: null };
      }

      // Handle select / query
      const filter = this._buildFilter();
      const opts: Record<string, any> = {};
      if (filter) opts.filter = filter;
      if (this._sortField) opts.sort = this._sortField;
      // Pass field selection to PocketBase (comma-separated field names)
      if (this._selectFields && this._selectFields !== '*') {
        opts.fields = this._selectFields.split(',')
          .map((f) => tsCol(f.trim()))
          .filter(Boolean)
          .join(',');
      }

      const collection = pb.collection(this._collection);

      // Fetch ALL matching records via getFullList().
      // PocketBase's getList() is capped by the server's max per-page size
      // (default 500), so a plain select() would silently truncate. getFullList()
      // automatically walks every page behind the scenes — exactly what the Smart
      // Import needs to read every DBF-mirrored record.
      if (this._single || this._maybeSingle) {
        try {
          const item = await collection.getFirstListItem(filter, opts);
          return { data: item ? tsBackfill(item) : (this._maybeSingle ? null : undefined), error: null };
        } catch (err: any) {
          if (this._maybeSingle) return { data: null, error: null };
          return { data: null, error: err };
        }
      }

      // Explicit .limit() — honour it with getList() so we get at most N rows.
      // PocketBase caps per-page at 500, so larger limits must walk pages.
      if (this._limitN > 0) {
        const PER_PAGE_MAX = 500;
        const collected: any[] = [];
        let pageNum = 1;
        while (collected.length < this._limitN) {
          const perPage = Math.min(PER_PAGE_MAX, this._limitN - collected.length);
          const result = await collection.getList(pageNum, perPage, opts);
          const items = result.items ?? [];
          collected.push(...items.map(tsBackfill));
          if (items.length < perPage || items.length === 0) break;
          pageNum += 1;
        }
        return { data: collected.slice(0, this._limitN), error: null };
      }

      // Explicit .range(from,to) — fetch the single requested window. PocketBase
      // caps every page at 500 rows regardless of the requested perPage, so a
      // window wider than 500 must be assembled by walking consecutive pages;
      // the old one-request math silently returned only the first page.
      if (this._rangeTo > this._rangeFrom) {
        const PER_PAGE_MAX = 500;
        const start = this._rangeFrom;
        const wanted = this._rangeTo - start + 1;
        const collected: any[] = [];
        let pageNum = Math.floor(start / PER_PAGE_MAX) + 1;
        while (collected.length < wanted) {
          const result = await collection.getList(pageNum, PER_PAGE_MAX, opts);
          const items = result.items ?? [];
          if (items.length === 0) break;
          // First page may begin mid-window when start is not page-aligned.
          const sliceFrom = pageNum === Math.floor(start / PER_PAGE_MAX) + 1 ? start % PER_PAGE_MAX : 0;
          const usable = sliceFrom > 0 ? items.slice(sliceFrom) : items;
          collected.push(...usable.map(tsBackfill));
          if (items.length < PER_PAGE_MAX || usable.length === 0) break;
          pageNum += 1;
        }
        return { data: collected.slice(0, wanted), error: null };
      }

      // Otherwise return ALL matching records (no per-page cap).
      const all = await collection.getFullList({ ...opts, requestKey: null });
      return { data: all.map(tsBackfill), error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }
}

// ── supabase compat object ─────────────────────────────────────────────────

function fromCollection(collection: string) {
  return new SupabaseQueryBuilder(collection);
}

export const from = fromCollection;

export const supabaseCompat = {
  auth: {
    getSession: async () => {
      try {
        const token = pb.authStore.token;
        const model = (pb.authStore as any).model;
        if (!token || !model) {
          return { data: { session: null }, error: null };
        }
        return {
          data: {
            session: {
              user: { id: model.id, email: model.email, email_confirmed_at: model.verified ? new Date().toISOString() : null },
              access_token: token,
            },
          },
          error: null,
        };
      } catch {
        return { data: { session: null }, error: null };
      }
    },

    getUser: async () => {
      try {
        const model = (pb.authStore as any).model;
        if (!model) return { data: { user: null }, error: null };
        return {
          data: {
            user: {
              id: model.id,
              email: model.email,
              email_confirmed_at: model.verified ? new Date().toISOString() : null,
            },
          },
          error: null,
        };
      } catch {
        return { data: { user: null }, error: null };
      }
    },

    signInWithPassword: async ({ email, phone, password }: { email?: string; phone?: string; password: string }) => {
      try {
        const identifier = email ?? phone ?? '';
        const authData = await pb.collection('profiles').authWithPassword(identifier, password);
        return {
          data: {
            user: {
              id: authData.record.id,
              email: authData.record.email,
              email_confirmed_at: authData.record.verified ? new Date().toISOString() : null,
            },
            session: { access_token: authData.token },
          },
          error: null,
        };
      } catch (err) {
        return { data: { user: null, session: null }, error: err };
      }
    },

    signUp: async ({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) => {
      try {
        const data = await pb.collection('profiles').create({
          email,
          password,
          passwordConfirm: password,
          ...options?.data,
        });
        return { data: { user: { id: data.id, email: data.email } }, error: null };
      } catch (err) {
        return { data: { user: null }, error: err };
      }
    },

    signOut: async () => {
      pb.authStore.clear();
    },

    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      const unsubscribe = pb.authStore.onChange(() => {
        const hasToken = !!pb.authStore.token;
        callback(hasToken ? 'SIGNED_IN' : 'SIGNED_OUT', hasToken ? (pb.authStore as any).model : null);
      });
      return { data: { subscription: { unsubscribe } } };
    },
  },
};

// ── Main export: drop-in replacement for old supabase object ───────────────

export const supabase = {
  from: fromCollection,
  rpc,
  auth: supabaseCompat.auth,
  send: pb.send.bind(pb),
};
