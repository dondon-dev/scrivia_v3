/**
 * Native API client adapter for the Express backend (backend/).
 *
 * Architecture:
 *   React frontend  →  Express API (backend/)  →  SQLite (app.db)
 *
 * This module is the single seam between the app and the network. Every other
 * file imports `pb`, `supabase`, `fetchAll`, `chunkedIn`, `formatError` or
 * `rpc` from here, so the transport can change without touching call sites.
 *
 * Exports:
 *   pb               — client (authStore / collection / send)
 *   supabase         — chainable query facade (from / rpc / auth / functions)
 *   from             — alias of supabase.from
 *   supabaseCompat   — the auth sub-object
 *   fetchAll         — read-everything helper (string name OR arrow fn)
 *   chunkedIn        — batched `col IN (...)` helper
 *   rpc              — named-RPC helper
 *   formatError      — error → human string
 *   SUPABASE_URL, SUPABASE_ANON_KEY — legacy constants
 */

// ── API URL resolution ──────────────────────────────────────────────────────
// Uses VITE_API_URL when set; otherwise '' means same-origin (SPA + API served
// together, with Vite proxying /api to the Express backend).
const API_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? '')
    .trim()
    .replace(/\/+$/, '') || '';

export const SUPABASE_URL = API_URL;
export const SUPABASE_ANON_KEY = '';

// ── Error shape ─────────────────────────────────────────────────────────────
// Carries `.status`, `.message`, `.data`, `.isAbort` for the app.
export class ClientResponseError extends Error {
  status: number;
  data: any;
  url: string;
  isAbort = false;
  constructor(message: string, status = 0, data: any = {}, url = '') {
    super(message);
    this.name = 'ClientResponseError';
    this.status = status;
    this.data = data;
    this.url = url;
  }
}

// ── Auth store (localStorage) ───────────────────────────────────────────────
const AUTH_STORAGE_KEY = 'scrivia_auth';

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload || typeof atob !== 'function') return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(decodeURIComponent(escape(atob(normalized))));
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

type AuthChangeListener = () => void;

class AuthStore {
  private token_ = '';
  private model_: any = null;
  private listeners = new Set<AuthChangeListener>();

  constructor() {
    this.load();
  }

  get token(): string {
    return this.token_;
  }

  get model(): any {
    return this.model_;
  }

  get isValid(): boolean {
    if (!this.token_ || !this.model_) return false;
    const exp = decodeJwtExp(this.token_);
    if (exp != null && Date.now() / 1000 > exp + 60) return false;
    return true;
  }

  save(token: string, model: any): void {
    this.token_ = token || '';
    this.model_ = model || null;
    this.persist();
    this.emit();
  }

  clear(): void {
    this.token_ = '';
    this.model_ = null;
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.emit();
  }

  onChange(cb: AuthChangeListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.token_ = typeof parsed?.token === 'string' ? parsed.token : '';
      this.model_ = parsed?.model ?? parsed?.record ?? null;
    } catch {
      this.token_ = '';
      this.model_ = null;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: this.token_, model: this.model_ }));
    } catch {
      /* storage might be unavailable (private mode) */
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* a bad listener must not break the others */
      }
    }
  }
}

export const authStore = new AuthStore();

// ── HTTP transport ──────────────────────────────────────────────────────────

interface SendOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  // Accepted for signature compatibility; the Express backend has no
  // per-request cancellation, so it is ignored.
  requestKey?: string | null;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const base = /^https?:\/\//i.test(path)
    ? path
    : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    usp.append(k, String(v));
  }
  const qs = usp.toString();
  if (!qs) return base;
  return base + (base.includes('?') ? '&' : '?') + qs;
}

async function send<T = any>(path: string, options: SendOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, query, signal } = options;
  const url = buildUrl(path, query);

  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  let payload: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      payload = body;
    } else {
      finalHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }
  if (authStore.token) finalHeaders.Authorization = `Bearer ${authStore.token}`;

  let response: Response;
  try {
    response = await fetch(url, { method, headers: finalHeaders, body: payload, signal });
  } catch (err: any) {
    throw new ClientResponseError(err?.message ?? 'Network request failed', 0, {}, url);
  }

  const text = await response.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      (parsed && (parsed.message || parsed.error)) ||
      (typeof parsed === 'string' ? parsed : '') ||
      `Request failed with status ${response.status}`;
    throw new ClientResponseError(message, response.status, parsed ?? {}, url);
  }

  return parsed as T;
}

// ── Native client ───────────────────────────────────────────────────────────

interface ListOptions {
  filter?: any;
  sort?: string;
  fields?: string | string[];
  expand?: string;
  batch?: number;
}

function toFilterArg(filter: any): any {
  if (!filter) return undefined;
  if (typeof filter === 'object') return filter;
  if (typeof filter === 'string') {
    const trimmed = filter.trim();
    if (!trimmed) return undefined;
    return parseFilter(trimmed);
  }
  return undefined;
}

function toFieldsArg(fields?: string | string[]): string[] | undefined {
  if (!fields) return undefined;
  if (Array.isArray(fields)) return fields.map((f) => f.trim()).filter(Boolean);
  if (fields === '*') return undefined;
  return fields
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

function collectionService(name: string) {
  const rest = `/api/db/${name}`;
  const query = (payload: Record<string, unknown>) =>
    send<{ data: any; total?: number; page?: number; perPage?: number }>(`${rest}/query`, {
      method: 'POST',
      body: payload,
    });

  return {
    async getOne(id: string): Promise<any> {
      return send(`${rest}/${encodeURIComponent(id)}`);
    },

    async getFullList<T = any>(opts: ListOptions = {}): Promise<T[]> {
      const sort = opts.sort || '-created';
      const fields = toFieldsArg(opts.fields);
      const filter = toFilterArg(opts.filter);
      // The legacy server capped every page at 500 rows, so getFullList
      // walked pages behind the scenes. Keep walking so the SQLite backend is
      // never handed an unbounded query.
      const batch = Math.min(opts.batch ?? 1000, 2000);
      const out: T[] = [];
      let offset = 0;
      // Hard stop well past the current data volume; guards against a runaway.
      for (let guard = 0; guard < 100_000; guard++) {
        const res = await query({ filter, sort, fields, limit: batch, offset, noCount: true });
        const items = (res?.data as T[]) || [];
        out.push(...items);
        if (items.length < batch) break;
        offset += batch;
      }
      return out;
    },

    async getList<T = any>(page = 1, perPage = 30, opts: ListOptions = {}) {
      const safePage = Math.max(1, Number(page) || 1);
      const safePerPage = Math.max(1, Number(perPage) || 30);
      const res = await query({
        filter: toFilterArg(opts.filter),
        sort: opts.sort,
        fields: toFieldsArg(opts.fields),
        limit: safePerPage,
        offset: (safePage - 1) * safePerPage,
      });
      const items = (res?.data as T[]) || [];
      const totalItems = typeof res?.total === 'number' ? res.total : items.length;
      return {
        page: safePage,
        perPage: safePerPage,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / safePerPage)),
        items,
      };
    },

    async getFirstListItem<T = any>(filter: any, opts: { sort?: string; fields?: string | string[] } = {}): Promise<T> {
      const res = await query({
        filter: toFilterArg(filter),
        sort: opts.sort,
        fields: toFieldsArg(opts.fields),
        single: true,
      });
      if (!res || res.data == null) {
        throw new ClientResponseError('The requested resource was not found.', 404);
      }
      return res.data as T;
    },

    async create<T = any>(data: any): Promise<T> {
      return send<T>(rest, { method: 'POST', body: data });
    },

    async update<T = any>(id: string, data: any): Promise<T> {
      return send<T>(`${rest}/${encodeURIComponent(id)}`, { method: 'PUT', body: data });
    },

    async delete(id: string): Promise<boolean> {
      await send(`${rest}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    },

    async authWithPassword(identity: string, password: string) {
      const res = await send<{ token: string; record: any }>(
        '/api/collections/profiles/auth-with-password',
        { method: 'POST', body: { identity, password } },
      );
      authStore.save(res.token, res.record);
      return res;
    },
  };
}

export const pb = {
  authStore,
  collection: collectionService,
  send,
  autoCancellation: (_enabled: boolean) => {
    /* no-op: the Express backend does not implement request cancellation */
  },
  baseUrl: API_URL,
};

// ── formatError ─────────────────────────────────────────────────────────────

export function formatError(err: any, _context?: any): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  const m = err.message ?? err.data?.message ?? err.error?.message ?? err.error_description;
  if (typeof m === 'string' && m.trim()) return m;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// ── Timestamp aliasing ──────────────────────────────────────────────────────
// The server already back-fills created_at/updated_at from created/updated, but
// keep the client-side back-fill too so records fetched before a redeploy still
// expose the alias names legacy code reads.
const tsBackfill = (rec: any): any => {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return rec;
  let out = rec;
  if (rec.created && rec.created_at == null) out = { ...out, created_at: rec.created };
  if (rec.updated && rec.updated_at == null) out = { ...out, updated_at: rec.updated };
  return out;
};

// ── Bounded-concurrency write pool ──────────────────────────────────────────

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
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runner());
  await Promise.all(runners);
}

// ── fetchAll — works with string collection names AND arrow functions ───────
// Callers overwhelmingly pass an arrow function that returns a builder, e.g.
//   fetchAll(() => supabase.from('employees').select('*').eq('status', 'Active'))
// The string form (collection name) is kept for completeness.

type FetchSource = string | ((...args: any[]) => any);

export async function fetchAll<T = any>(
  collectionOrFn: FetchSource,
  filterOrPageSize?: string | number,
  sort?: string,
  expand?: string,
  batchSize = 1000,
): Promise<T[]> {
  if (typeof collectionOrFn === 'function') {
    try {
      const result = await collectionOrFn();
      const awaited = result && typeof result.then === 'function' ? await result : result;
      if (Array.isArray(awaited)) return awaited as T[];
      if (awaited?.data && Array.isArray(awaited.data)) return awaited.data as T[];
      return (awaited ?? []) as T[];
    } catch {
      return [];
    }
  }

  const svc = collectionService(collectionOrFn);
  const filter = typeof filterOrPageSize === 'string' ? filterOrPageSize : '';
  const all = await svc.getFullList<T>({
    filter: filter || undefined,
    sort: sort ?? '-created',
    expand: expand ?? '',
    batch: Math.min(batchSize, 2000),
  });
  return all;
}

// ── chunkedIn ──────────────────────────────────────────────────────────────

export async function chunkedIn<T = any>(
  column: string,
  values: (string | number)[],
  queryFn: (chunk: (string | number)[]) => any,
  // SQLite has no OR-expansion ceiling, but keep chunking so each request stays
  // a reasonable size (and so existing call sites keep their batching semantics).
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
  enrol_mfa: 'auth/mfa/enrol',
  verify_mfa_enrolment: 'auth/mfa/verify-enrolment',
  get_mfa_status: 'auth/mfa/status',
  regenerate_mfa_recovery_codes: 'auth/mfa/recovery-codes/regenerate',
  reset_mfa: 'auth/mfa/reset',
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
  set_user_role: 'auth/set-role',
  set_user_division: 'auth/set-division',
  set_assigned_stacode: 'auth/set-stacode',
  set_user_mfa: 'auth/set-mfa',
  unlock_user_account: 'auth/unlock',
  validate_employee_for_approval: 'auth/validate',
  run_payroll: 'payroll/run',
  run_payroll_engine: 'payroll/run',
  reverse_payroll: 'payroll/reverse',
  get_payroll_engine_stats: 'payroll/engine-stats',
  get_deduction_engine_stats: 'payroll/deduction-engine',
  get_school_stats: 'schools/stats',
  query_schools_with_stats: 'query-schools-with-stats',
  get_deduction_billing_session: 'deduction-billing/session',
  save_deduction_billing_session: 'deduction-billing/session/save',
  clear_deduction_billing_session: 'deduction-billing/session/clear',
  post_deduction_billing: 'deduction-billing/post',
};

export async function rpc(
  name: string,
  params?: Record<string, any>,
): Promise<{ data: any; error: any | null }> {
  const endpoint = RPC_MAP[name] ?? name;
  try {
    const result = await send(`/api/${endpoint}`, { method: 'POST', body: params ?? {} });
    return { data: result, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ── PostgREST `.or(...)` parser ─────────────────────────────────────────────
// Views call `.or('a.eq.1,b.ilike.%x%')` and `.or('and(a.eq.1,b.in.(x,y)),c.is.null')`.
// Translate that PostgREST grammar into the structured filter tree the backend
// understands.

function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function stripPercent(v: string): string {
  return v.replace(/^%+/, '').replace(/%+$/, '');
}

function postgrestLeaf(col: string, opRaw: string, value: string): any {
  const op = opRaw.toLowerCase();
  const isNullLiteral = value.toLowerCase() === 'null';
  switch (op) {
    case 'eq':
      return { col, op: 'eq', val: isNullLiteral ? null : value };
    case 'neq':
    case 'not':
      return { col, op: 'neq', val: isNullLiteral ? null : value };
    case 'gt':
      return { col, op: 'gt', val: value };
    case 'gte':
      return { col, op: 'gte', val: value };
    case 'lt':
      return { col, op: 'lt', val: value };
    case 'lte':
      return { col, op: 'lte', val: value };
    case 'like':
    case 'ilike':
      return { col, op: 'contains', val: stripPercent(value) };
    case 'is':
      return isNullLiteral ? { col, op: 'eq', val: null } : { col, op: 'neq', val: null };
    case 'in': {
      const inner = value.replace(/^\(/, '').replace(/\)$/, '');
      const arr = inner
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
      return { col, op: 'in', val: arr };
    }
    default:
      return { col, op: 'eq', val: value };
  }
}

function parsePostgrestNode(expr: string): any {
  const e = expr.trim();
  const grouped = e.match(/^(and|or)\(([\s\S]*)\)$/i);
  if (grouped) {
    const op = grouped[1].toLowerCase();
    const conditions = splitTopLevel(grouped[2]).map(parsePostgrestNode).filter(Boolean);
    return { op, conditions };
  }
  const firstDot = e.indexOf('.');
  if (firstDot < 0) return null;
  const col = e.slice(0, firstDot);
  const rest = e.slice(firstDot + 1);
  const secondDot = rest.indexOf('.');
  const opRaw = secondDot < 0 ? rest : rest.slice(0, secondDot);
  const value = secondDot < 0 ? '' : rest.slice(secondDot + 1);
  return postgrestLeaf(col, opRaw, value);
}

// ── Minimal filter-string → tree (legacy fetchAll string path) ──────────────
// Only the shapes the legacy adapter emitted are supported: leaves joined by
// `&&` / `||`, with `=`, `!=`, `>`, `>=`, `<`, `<=`, `~`, and `null`.
function parseFilter(input: string): any {
  function splitBy(str: string, separator: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let quote = '';
    let cur = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (quote) {
        cur += ch;
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        cur += ch;
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth === 0 && str.startsWith(separator, i)) {
        out.push(cur);
        cur = '';
        i += separator.length - 1;
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function leaf(str: string): any {
    const s = str.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
    const m = s.match(/^(\w+)\s*(!=|>=|<=|=|>|<|~)\s*(.*)$/);
    if (!m) return null;
    const col = m[1];
    const opToken = m[2];
    let raw = m[3].trim();
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
      raw = raw.slice(1, -1).replace(/''/g, "'");
    }
    const isNull = raw.toLowerCase() === 'null';
    switch (opToken) {
      case '=':
        return { col, op: 'eq', val: isNull ? null : raw };
      case '!=':
        return { col, op: 'neq', val: isNull ? null : raw };
      case '>':
        return { col, op: 'gt', val: raw };
      case '>=':
        return { col, op: 'gte', val: raw };
      case '<':
        return { col, op: 'lt', val: raw };
      case '<=':
        return { col, op: 'lte', val: raw };
      case '~':
        return { col, op: 'contains', val: raw };
      default:
        return null;
    }
  }

  function build(str: string): any {
    const orParts = splitBy(str, '||').map((p) => p.trim()).filter(Boolean);
    if (orParts.length > 1) {
      return { op: 'or', conditions: orParts.map(build).filter(Boolean) };
    }
    const andParts = splitBy(str, '&&').map((p) => p.trim()).filter(Boolean);
    if (andParts.length > 1) {
      return { op: 'and', conditions: andParts.map(build).filter(Boolean) };
    }
    return leaf(str);
  }

  return build(input);
}

// ── Supabase-style query builder ───────────────────────────────────────────

class SupabaseQueryBuilder {
  private _collection: string;
  private _filter: any[] = [];
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
  private _headOnly = false;
  private _upsertMode = false;
  // Forward any unrecognised chained call back to the same builder so legacy
  // chains that invoke unimplemented Supabase methods do not immediately break.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  constructor(collection: string) {
    this._collection = collection;
  }

  select(fields?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this._selectFields = fields ?? '*';
    if (opts?.count) this._countExact = opts.count === 'exact';
    if (opts?.head) this._headOnly = true;
    return this;
  }

  eq(column: string, value: any) {
    this._filter.push({ col: column, op: 'eq', val: value ?? null });
    return this;
  }

  neq(column: string, value: any) {
    this._filter.push({ col: column, op: 'neq', val: value ?? null });
    return this;
  }

  gt(column: string, value: any) {
    this._filter.push({ col: column, op: 'gt', val: value });
    return this;
  }

  gte(column: string, value: any) {
    this._filter.push({ col: column, op: 'gte', val: value });
    return this;
  }

  lt(column: string, value: any) {
    this._filter.push({ col: column, op: 'lt', val: value });
    return this;
  }

  lte(column: string, value: any) {
    this._filter.push({ col: column, op: 'lte', val: value });
    return this;
  }

  like(column: string, value: string) {
    this._filter.push({ col: column, op: 'contains', val: value });
    return this;
  }

  ilike(column: string, value: string) {
    this._filter.push({ col: column, op: 'contains', val: value });
    return this;
  }

  in(column: string, values: any[]) {
    if (!Array.isArray(values) || values.length === 0) return this;
    this._filter.push({ col: column, op: 'in', val: values });
    return this;
  }

  is(column: string, value: any) {
    // Supabase `is(col, 'null')` / `.is(col, null)` → IS NULL; `is(col,'not.null')` → IS NOT NULL.
    const isNull = value === null || value === undefined || value === 'null';
    this._filter.push({ col: column, op: isNull ? 'eq' : 'neq', val: null });
    return this;
  }

  isNull(column: string) {
    this._filter.push({ col: column, op: 'eq', val: null });
    return this;
  }

  isNotNull(column: string) {
    this._filter.push({ col: column, op: 'neq', val: null });
    return this;
  }

  or(filter: string) {
    const parts = splitTopLevel(filter)
      .map(parsePostgrestNode)
      .filter(Boolean);
    if (parts.length === 1) this._filter.push(parts[0]);
    else if (parts.length > 1) this._filter.push({ op: 'or', conditions: parts });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    const dir = opts?.ascending === false ? '-' : '';
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

  count(_exact?: string) {
    this._countOnly = true;
    this._countExact = _exact === 'exact';
    return this as any;
  }

  then<TResult = any>(
    resolve?: (value: any) => TResult | PromiseLike<TResult>,
    reject?: (reason: any) => TResult | PromiseLike<TResult>,
  ): Promise<TResult> {
    return this._execute().then(resolve, reject);
  }

  private _buildFilter(): any {
    const conds = this._filter.filter(Boolean);
    if (conds.length === 0) return undefined;
    if (conds.length === 1) return conds[0];
    return { op: 'and', conditions: conds };
  }

  private _svc() {
    return collectionService(this._collection);
  }

  private async _execute(): Promise<any> {
    try {
      const svc = this._svc();

      // ── Insert ──────────────────────────────────────────────────────────
      if (this._insertData) {
        if (Array.isArray(this._insertData)) {
          const items = this._insertData;
          const results: any[] = [];
          await runPool(items, async (item) => {
            try {
              results.push(await svc.create(item));
            } catch (err: any) {
              console.warn(`Batch insert skip [${this._collection}]:`, err?.message ?? err);
            }
          });
          return { data: results, error: null };
        }
        const result = await svc.create(this._insertData);
        return { data: result, error: null };
      }

      // ── Update / upsert ─────────────────────────────────────────────────
      if (this._updateData && !this._deleteMode) {
        if (this._upsertMode && Array.isArray(this._updateData)) {
          if (typeof window !== 'undefined') (window as any).__PB_BATCH_UPSERT__ = true;
          const items = this._updateData as Record<string, any>[];
          const results: any[] = [];

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

          const upsertOne = async (item: Record<string, any>): Promise<void> => {
            if (item.id) {
              try {
                const { id, ...rest } = item;
                results.push(await svc.update(id, rest));
                return;
              } catch {
                /* fall through to create */
              }
            }
            try {
              results.push(await svc.create(item));
            } catch (createErr: any) {
              try {
                const conditions: any[] = [];
                for (const k of keyFields) {
                  const v = item[k];
                  if (v != null && v !== '') conditions.push({ col: k, op: 'eq', val: v });
                }
                if (conditions.length === 0) {
                  for (const [k, v] of Object.entries(item)) {
                    if (typeof v === 'string' && v && k !== 'id') {
                      conditions.push({ col: k, op: 'eq', val: v });
                      break;
                    }
                  }
                }
                if (conditions.length > 0) {
                  const filter = conditions.length === 1 ? conditions[0] : { op: 'and', conditions };
                  const existing = await svc.getFullList({ filter });
                  if (existing.length > 0) {
                    const { id, ...rest } = item;
                    results.push(await svc.update(existing[0].id, rest));
                  }
                }
              } catch {
                console.warn(`Batch upsert skip [${this._collection}]:`, createErr?.message ?? createErr);
              }
            }
          };

          await runPool(items, upsertOne);
          return { data: results, error: null };
        }

        if (this._upsertMode && this._updateData.id) {
          const id = this._updateData.id;
          try {
            const { id: _id, ...rest } = this._updateData;
            return { data: await svc.update(id, rest), error: null };
          } catch {
            return { data: await svc.create(this._updateData), error: null };
          }
        }

        const filter = this._buildFilter();
        const existing = await svc.getFullList({ filter });
        const results: any[] = [];
        await runPool(existing, async (rec: any) => {
          results.push(await svc.update(rec.id, this._updateData));
        });
        return { data: results, error: null };
      }

      // ── Delete ──────────────────────────────────────────────────────────
      if (this._deleteMode) {
        const filter = this._buildFilter();
        const existing = await svc.getFullList({ filter });
        await runPool(existing, async (rec: any) => {
          await svc.delete(rec.id);
        });
        return { data: null, error: null, count: existing.length };
      }

      // ── Count ───────────────────────────────────────────────────────────
      if (this._countOnly) {
        const page = await svc.getList(1, 1, { filter: this._buildFilter() });
        return { count: page.totalItems, error: null, data: null };
      }

      // ── Select / query ──────────────────────────────────────────────────
      const filter = this._buildFilter();
      const fields = this._selectFields && this._selectFields !== '*' ? this._selectFields : undefined;
      const baseOpts = { filter, sort: this._sortField || undefined, fields };

      if (this._headOnly) {
        const page = await svc.getList(1, 1, baseOpts);
        return { data: [], error: null, count: page.totalItems ?? 0 };
      }

      let result: { data: any; error: any; count?: number };

      if (this._single || this._maybeSingle) {
        try {
          const item = await svc.getFirstListItem(filter, { sort: baseOpts.sort, fields });
          result = { data: item ? tsBackfill(item) : item, error: null };
        } catch (err: any) {
          if (this._maybeSingle) result = { data: null, error: null };
          else return { data: null, error: err };
        }
      } else if (this._limitN > 0) {
        const page = await svc.getList(1, this._limitN, baseOpts);
        result = { data: (page.items ?? []).map(tsBackfill), error: null };
      } else if (this._rangeTo > this._rangeFrom) {
        const start = this._rangeFrom;
        const wanted = this._rangeTo - start + 1;
        const page = Math.floor(start / Math.max(1, wanted)) + 1;
        const res = await svc.getList(page, wanted, baseOpts);
        const items = res.items ?? [];
        const sliceFrom = start % Math.max(1, wanted);
        const usable = sliceFrom > 0 ? items.slice(sliceFrom) : items;
        result = { data: usable.slice(0, wanted).map(tsBackfill), error: null };
      } else {
        const all = await svc.getFullList({ ...baseOpts });
        result = { data: all.map(tsBackfill), error: null };
      }

      if (this._countExact) {
        const page = await svc.getList(1, 1, baseOpts);
        result.count = page.totalItems ?? 0;
      }
      return result;
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
        const token = authStore.token;
        const model = authStore.model;
        if (!token || !model) return { data: { session: null }, error: null };
        return {
          data: {
            session: {
              user: {
                id: model.id,
                email: model.email,
                email_confirmed_at: model.verified ? new Date().toISOString() : null,
              },
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
        const model = authStore.model;
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
        const authData = await collectionService('profiles').authWithPassword(identifier, password);
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
        const data = await send<{ id: string; email: string }>('/api/register', {
          method: 'POST',
          body: { email, password, ...options?.data },
        });
        return { data: { user: { id: data.id, email: data.email } }, error: null };
      } catch (err) {
        return { data: { user: null }, error: err };
      }
    },

    signOut: async () => {
      authStore.clear();
    },

    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      const unsubscribe = authStore.onChange(() => {
        const hasToken = !!authStore.token;
        callback(hasToken ? 'SIGNED_IN' : 'SIGNED_OUT', hasToken ? authStore.model : null);
      });
      return { data: { subscription: { unsubscribe } } };
    },

    // Kept as typed shims so the legacy auth screens compile; the Express
    // backend does not implement email delivery, so they resolve as no-ops.
    resend: async (_opts: { type?: string; email: string; options?: { emailRedirectTo?: string } }) => ({
      data: { user: null },
      error: null as any,
    }),
    resetPasswordForEmail: async (_email: string, _opts?: { redirectTo?: string }) => ({
      data: { user: null },
      error: null as any,
    }),
    updateUser: async (_data: Record<string, unknown>) => ({ data: { user: null }, error: null as any }),
  },
};

export const supabase = {
  from: fromCollection,
  rpc,
  auth: supabaseCompat.auth,
  send: (path: string, options?: SendOptions) => send(path, options),
  functions: {
    invoke: async (name: string, opts?: { body?: any }) => {
      try {
        const data = await send(`/api/${name}`, { method: 'POST', body: opts?.body ?? {} });
        return { data: data as any, error: null };
      } catch (err) {
        return { data: null, error: err };
      }
    },
  },
};
