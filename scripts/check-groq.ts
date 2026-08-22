/**
 * Groq / OmniDev AI integration health check (read-only).
 *
 * Verifies without printing any secret values:
 *   1. `GROQ_API_KEY` presence in the process env (the value is never printed).
 *   2. The key actually authenticates against Groq's API (HTTP status only).
 *   3. The `omnidev-ai` edge function is deployed and the `GROQ_API_KEY`
 *      secret is registered on the Supabase project (name listing only).
 *
 * Usage:
 *   bun scripts/check-groq.ts
 */
import { existsSync, readFileSync } from 'node:fs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef =
  process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref')
    ? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
    : '');

console.log('Groq / OmniDev AI health check\n');

// 1) Key presence (never print the value)
const key = process.env.GROQ_API_KEY?.trim();
console.log(`GROQ_API_KEY in env: ${key ? `present (length ${key.length})` : 'MISSING'}`);

// 2) Key validity against Groq's API
if (key) {
  const t0 = Date.now();
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 200) {
      const j = (await res.json()) as { data?: { id: string }[] };
      const ids = (j.data ?? []).map((m) => m.id);
      console.log(`Groq API: ✅ authenticated (HTTP 200, ${ids.length} models, ${Date.now() - t0}ms)`);
      const hasLlama = ids.some((id) => id.startsWith('llama-3.3-70b'));
      console.log(`  default model llama-3.3-70b-versatile available: ${hasLlama ? 'yes' : 'no — check OMNIDEV_MODEL'}`);
    } else {
      console.log(`Groq API: ❌ HTTP ${res.status} — key invalid or restricted`);
    }
  } catch (e) {
    console.log(`Groq API: ❌ request failed — ${(e as Error).message}`);
  }
} else {
  console.log('Groq API: skipped (no key visible to this process)');
}

// 3) Supabase side (only when the management token is available)
if (TOKEN && projectRef) {
  const BASE = `https://api.supabase.com/v1/projects/${projectRef}`;
  const api = async (path: string) => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* non-JSON */ }
    return { ok: res.ok, status: res.status, body };
  };

  const funcs = await api('/functions');
  if (funcs.ok) {
    const list = (funcs.body as { slug: string; status: string }[] ?? []);
    const od = list.find((f) => f.slug === 'omnidev-ai');
    console.log(`\nEdge functions: ${list.map((f) => f.slug).join(', ') || '(none)'}`);
    console.log(`omnidev-ai: ${od ? `deployed (${od.status})` : 'NOT deployed'}`);
  } else {
    console.log(`\nfunctions list: HTTP ${funcs.status}`);
  }

  const sec = await api('/secrets');
  if (sec.ok) {
    const names = (sec.body as { name: string }[] ?? []).map((s) => s.name);
    console.log(`GROQ_API_KEY project secret: ${names.includes('GROQ_API_KEY') ? 'present' : 'MISSING'}`);
  } else {
    console.log(`secrets list: HTTP ${sec.status}`);
  }
} else {
  console.log('\nSupabase side: skipped (SUPABASE_ACCESS_TOKEN not visible to this process)');
}
