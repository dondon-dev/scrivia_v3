/**
 * Migrate the PocketBase `gsis_import_logs` / `pli_import_logs` collections so
 * their schema matches what the frontend reads and writes.
 *
 * The frontend (Dashboard, GsisImport, PliImport, RoleDashboards) expects:
 *   gsis_import_logs: new_deductions, updated_deductions, failed_records, ...
 *   pli_import_logs : new_deductions, updated_deductions, terminated_deductions, failed_records, ...
 *
 * If a deployed PocketBase was seeded without those columns, their REST API
 * returns 400 "failed to resolve field" for `fields`/`filter`. This script
 * reconciles the schema by adding any missing fields via the admin API.
 *
 * Usage:
 *   node scripts/migrate-import-log-schema.cjs
 *
 * Env vars (optional):
 *   PB_BASE              PocketBase URL            (default http://localhost:8090)
 *   POCKETBASE_ADMIN_EMAIL   admin identity        (default admin@scrivia.local)
 *   POCKETBASE_ADMIN_PASSWORD admin password       (default Admin123456!)
 */
const PB_BASE = (process.env.PB_BASE || 'http://localhost:8090').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@scrivia.local';
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || 'Admin123456!';

const REQUIRED_FIELDS = {
  gsis_import_logs: [
    { name: 'uploaded_by', type: 'text' },
    { name: 'uploaded_by_id', type: 'text' },
    { name: 'filename', type: 'text' },
    { name: 'file_content', type: 'text' },
    { name: 'remark', type: 'text' },
    { name: 'total_records', type: 'number' },
    { name: 'matched_records', type: 'number' },
    { name: 'new_deductions', type: 'number' },
    { name: 'updated_deductions', type: 'number' },
    { name: 'failed_records', type: 'number' },
    { name: 'processing_time_ms', type: 'number' },
    { name: 'status', type: 'text' },
    { name: 'dbf_filename', type: 'text' },
  ],
  pli_import_logs: [
    { name: 'uploaded_by', type: 'text' },
    { name: 'uploaded_by_id', type: 'text' },
    { name: 'add_filename', type: 'text' },
    { name: 'del_filename', type: 'text' },
    { name: 'file_content', type: 'text' },
    { name: 'remark', type: 'text' },
    { name: 'total_records', type: 'number' },
    { name: 'add_records', type: 'number' },
    { name: 'del_records', type: 'number' },
    { name: 'new_deductions', type: 'number' },
    { name: 'updated_deductions', type: 'number' },
    { name: 'terminated_deductions', type: 'number' },
    { name: 'failed_records', type: 'number' },
    { name: 'processing_time_ms', type: 'number' },
    { name: 'status', type: 'text' },
    { name: 'dbf_filename', type: 'text' },
    { name: 'stacode', type: 'text' },
  ],
};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${PB_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  console.log(`Connecting to ${PB_BASE} ...`);
  const login = await api('POST', '/api/admins/auth-with-password', {
    body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (login.status >= 400) {
    console.error(`Admin login failed (${login.status}):`, JSON.stringify(login.data)?.slice(0, 300));
    process.exit(1);
  }
  const token = login.data.token;
  console.log(`Authenticated as ${ADMIN_EMAIL}`);

  const list = await api('GET', '/api/collections?perPage=500', { token });
  if (list.status >= 400) {
    console.error(`Could not list collections (${list.status})`);
    process.exit(1);
  }
  const byName = new Map(list.data.items.map((c) => [c.name, c]));

  for (const [collectionName, required] of Object.entries(REQUIRED_FIELDS)) {
    const col = byName.get(collectionName);
    if (!col) {
      console.log(`[${collectionName}] SKIP — collection does not exist`);
      continue;
    }
    const existing = new Set((col.schema || []).map((f) => f.name));
    const missing = required.filter((f) => !existing.has(f.name));

    console.log(`[${collectionName}] existing=${[...existing].join(', ')}`);
    if (missing.length === 0) {
      console.log(`[${collectionName}] OK — no missing fields\n`);
      continue;
    }
    console.log(`[${collectionName}] adding missing: ${missing.map((f) => f.name).join(', ')}`);

    const nextSchema = [
      ...(col.schema || []),
      ...missing.map((f) => ({
        name: f.name,
        type: f.type,
        required: false,
        presentable: false,
        unique: false,
        options: f.type === 'number' ? { min: null, max: null, noDecimal: false } : { min: null, max: null, pattern: '' },
      })),
    ];

    const patch = await api('PATCH', `/api/collections/${col.id}`, { token, body: { schema: nextSchema } });
    if (patch.status < 400) {
      console.log(`[${collectionName}] OK — schema updated (${nextSchema.length} fields)\n`);
    } else {
      console.error(`[${collectionName}] PATCH FAILED (${patch.status}):`, JSON.stringify(patch.data)?.slice(0, 400), '\n');
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});