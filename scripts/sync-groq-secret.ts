/**
 * Sync GROQ_API_KEY from the process environment into the Supabase project
 * secrets (upsert) via the Management API. The edge function `omnidev-ai`
 * reads this secret at runtime, so this makes the exact key the user supplied
 * in the Freebuff API Keys tab the one the live app uses.
 *
 * The secret value is read from the environment and sent to the API — it is
 * never printed or written to disk.
 *
 * Usage:
 *   bun scripts/sync-groq-secret.ts
 */
import { existsSync, readFileSync } from 'node:fs';

const key = process.env.GROQ_API_KEY?.trim();
if (!key) {
  console.error('GROQ_API_KEY is not visible to this process — nothing to sync.');
  process.exit(1);
}
if (key.length < 20) {
  console.error('GROQ_API_KEY looks too short to be a real key — aborting without syncing.');
  process.exit(1);
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is not visible to this process.');
  process.exit(1);
}
const projectRef =
  process.env.SUPABASE_PROJECT_REF ??
  (existsSync('supabase/.temp/project-ref')
    ? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
    : '');
if (!projectRef) {
  console.error('Missing SUPABASE_PROJECT_REF.');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify([{ name: 'GROQ_API_KEY', value: key }]),
});
const text = await res.text();

if (res.ok || res.status === 201) {
  console.log(`✅ GROQ_API_KEY upserted to Supabase project ${projectRef} secrets (HTTP ${res.status}).`);
} else {
  console.error(`❌ Sync failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  process.exit(1);
}
