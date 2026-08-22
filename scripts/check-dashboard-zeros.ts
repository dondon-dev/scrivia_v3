/**
 * Diagnoses "dashboard shows 0 but the totals are right" — dumps the live
 * dashboard_stats_cache row and the raw get_dashboard_summary() output so we
 * can see exactly which source has the zeroed columns.
 * Usage: bun scripts/check-dashboard-zeros.ts
 */
import { existsSync, readFileSync } from 'node:fs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('Missing SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
const projectRef =
  process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref') ? readFileSync('supabase/.temp/project-ref', 'utf8').trim() : '');
if (!projectRef) { console.error('Missing SUPABASE_PROJECT_REF.'); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
const SUPER = '78f01f9e-4c26-44de-a7b8-7f4e2078c3f4';

async function runSql(query: string) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, body };
}

// 1) The cache row the unscoped dashboard reads
const cache = await runSql('SELECT * FROM dashboard_stats_cache WHERE id = 1;');
if (cache.ok) {
  const row = (cache.body as Record<string, unknown>[])?.[0];
  if (!row) {
    console.log('dashboard_stats_cache: NO ROW — the unscoped dashboard gets all-zero defaults.');
  } else {
    console.log('dashboard_stats_cache row (live):');
    for (const [k, v] of Object.entries(row)) {
      const s = typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 120) : String(v);
      console.log(`  ${k} = ${s}`);
    }
  }
} else {
  console.log(`cache: HTTP ${cache.status} ${JSON.stringify(cache.body).slice(0, 200)}`);
}

// 2) Raw RPC output (as Postgres returns it)
const rpc = await runSql(
  `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${SUPER}'; SELECT get_dashboard_summary() AS s;`,
);
if (rpc.ok) {
  const raw = (rpc.body as { s: string | Record<string, unknown> }[])?.[0]?.s;
  const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
  console.log('\nget_dashboard_summary() live output:');
  if (s && typeof s === 'object') {
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      const sv = typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 120) : String(v);
      console.log(`  ${k} = ${sv}`);
    }
  } else {
    console.log(`  unexpected: ${JSON.stringify(s).slice(0, 300)}`);
  }
} else {
  console.log(`rpc: HTTP ${rpc.status} ${JSON.stringify(rpc.body).slice(0, 200)}`);
}

// 3) When was the cache last refreshed + does the refresh function work?
const fresh = await runSql(
  `SELECT refreshed_at FROM dashboard_stats_cache WHERE id = 1; SELECT refresh_dashboard_cache(); SELECT refreshed_at FROM dashboard_stats_cache WHERE id = 1;`,
);
if (fresh.ok) {
  const rows = fresh.body as { refreshed_at?: string }[];
  const before = rows[0]?.refreshed_at ?? '?';
  const after = rows[rows.length - 1]?.refreshed_at ?? '?';
  console.log(`\ncache refreshed_at: ${before} → after manual refresh: ${after}`);
} else {
  console.log(`refresh: HTTP ${fresh.status} ${JSON.stringify(fresh.body).slice(0, 200)}`);
}
