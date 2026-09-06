#!/usr/bin/env node
/**
 * Runs the payroll-engine unit tests (scripts/test-payroll-engine.ts) without
 * adding a TypeScript runtime dependency: it bundles the test + its imports
 * with the esbuild that ships inside frontend/node_modules (a Vite dependency)
 * and executes the bundle with node, forwarding the test's exit code.
 *
 * Usage (from the repo root):
 *   node scripts/run-engine-tests.mjs
 *
 * Also exposed as `npm run test:engine` inside frontend/.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');

// Resolve esbuild from frontend/ so the runner needs only `cd frontend && npm ci`
// (no root node_modules). createRequire() walks up from the base path given.
const requireFromFrontend = createRequire(path.join(frontend, '__runner__.cjs'));
const esbuild = requireFromFrontend('esbuild');

const entry = path.join(root, 'scripts', 'test-payroll-engine.ts');
const outfile = path.join(os.tmpdir(), `payroll-engine-tests-${process.pid}.cjs`);

let status = 1;
try {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile,
    logLevel: 'warning',
  });
  const res = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
  status = res.status ?? 1;
} finally {
  fs.rmSync(outfile, { force: true });
}
process.exitCode = status;
