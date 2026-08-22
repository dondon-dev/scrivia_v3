/** Status distribution of the newest open period's entries (read-only). */
import { existsSync, readFileSync } from 'node:fs';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref') ? readFileSync('supabase/.temp/project-ref', 'utf8').trim() : '');
if (!TOKEN || !projectRef) { console.error('Missing token/ref'); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
async function runSql(query: string) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body: unknown = text; try { body = JSON.parse(text); } catch { /* */ }
  return { ok: res.ok, status: res.status, body };
}
const r = await runSql(
  `SELECT p.period_name, p.status AS period_status, e.status AS entry_status, count(*) AS n
   FROM pay_periods p
   JOIN payroll_entries e ON e.pay_period_id = p.id
   WHERE p.status <> 'closed'
   GROUP BY p.period_name, p.status, e.status
   ORDER BY p.period_name, e.status;`,
);
if (r.ok) {
  const rows = r.body as { period_name: string; period_status: string; entry_status: string; n: number }[];
  for (const row of rows) console.log(`${row.period_name} [${row.period_status}] entries ${row.entry_status}: ${row.n}`);
} else {
  console.log(JSON.stringify(r.body).slice(0, 300));
}
