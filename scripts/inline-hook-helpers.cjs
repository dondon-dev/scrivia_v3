/**
 * Inline top-level helper functions into every hook handler callback.
 *
 * Why: PocketBase v0.22's JSVM (this build) evaluates handler callbacks at
 * request time in a scope where ONLY built-in globals ($app, $apis, routerAdd,
 * Record, ...) exist. File-level helper definitions are invisible there, so any
 * handler calling a sibling helper dies with ReferenceError -> HTTP 400.
 *
 * Fix: mechanically prepend the source of each referenced top-level helper
 * (recursively — helpers may call other helpers) inside every handler body.
 *
 * Idempotent: marks patched handlers with a banner comment and skips them.
 */
const fs = require('fs');
const path = require('path');

const DIR = 'pocketbase_bin/pb_hooks';
const BANNER = '// [inlined-helpers]';

function parseTopLevelFns(src) {
  // Match top-level "function name(...) { ... }" with brace counting.
  const fns = {};
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const bodyStart = m.index; // includes "function name(...) {"
    let i = src.indexOf('{', m.index + m[0].length - 1);
    let depth = 0, end = -1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end === -1) continue;
    // skip line before body to keep indentation sane
    const fullSrc = src.slice(bodyStart, end);
    const lines = fullSrc.split('\n');
    const indented = lines.map((l) => (l.trim() ? '  ' + l : l)).join('\n');
    fns[name] = indented;
    re.lastIndex = end;
  }
  return fns;
}

function processFile(file) {
  const abs = path.join(DIR, file);
  let src = fs.readFileSync(abs, 'utf8');
  if (src.includes(BANNER)) {
    console.log(`${file}: already patched, skipping`);
    return;
  }
  const fns = parseTopLevelFns(src);
  const fnNames = Object.keys(fns);
  if (fnNames.length === 0) {
    console.log(`${file}: no top-level helpers, skipping`);
    return;
  }

  // Find every handler callback: routerAdd("VERB", "path", (c) => { ... })
  // and onXxx((e) => { ... }) registrations, then inline referenced helpers.
  const handlerRe = /(routerAdd\((?:\s*"?\w+"?\s*,\s*){2}|onRecord[A-Za-z]+Request\()(\((?:c|e)\)\s*=>\s*\{)/g;

  let patched = 0;
  src = src.replace(handlerRe, (match, prefix, arrow) => {
    // find the matching closing brace of the arrow body
    const start = match.length; // index within `match` where the body begins... not usable
    return match; // replaced below via a different strategy
  });

  // The regex replace above can't see the body; do a manual scan instead.
  const out = [];
  let idx = 0;
  const re2 = /(routerAdd\(\s*"[A-Z]+"|onRecord[A-Za-z]+Request\()([\s\S]*?)(\((?:c|e)\)\s*=>\s*\{)/g;
  let m2;
  const insertions = [];
  while ((m2 = re2.exec(src)) !== null) {
    const bodyOpen = m2.index + m2[0].length; // index just after "{"
    // find matching close brace
    let depth = 0, end = -1, inStr = null, esc = false;
    for (let i = bodyOpen - 1; i < src.length; i++) {
      const ch = src[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) continue;
    insertions.push({ at: bodyOpen, end });
    re2.lastIndex = end; // continue after this handler
  }

  // Build the new source by inserting helper sources (in reverse order).
  // Determine referenced helpers per handler by scanning the body text.
  const segments = [];
  let prev = 0;
  for (const ins of insertions) {
    segments.push(src.slice(prev, ins.at));
    const body = src.slice(ins.at, ins.end);
    const used = new Set();
    for (const name of fnNames) {
      if (new RegExp('\\b' + name + '\\s*\\(').test(body)) used.add(name);
    }
    // recursively include helpers used by included helpers
    let added = true;
    while (added) {
      added = false;
      for (const name of Array.from(used)) {
        const helperBody = fns[name] || '';
        for (const other of fnNames) {
          if (!used.has(other) && new RegExp('\\b' + other + '\\s*\\(').test(helperBody)) {
            used.add(other);
            added = true;
          }
        }
      }
    }
    let inlineBlock = '';
    for (const name of used) inlineBlock += fns[name] + '\n';
    segments.push(inlineBlock ? (BANNER + '\n' + inlineBlock) : '');
    segments.push(body);
    prev = ins.end;
  }
  segments.push(src.slice(prev));
  const result = segments.join('');
  fs.writeFileSync(abs, result);
  console.log(`${file}: inlined helpers into ${insertions.length} handler(s) (used: patched=${insertions.length})`);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.pb.js'));
for (const f of files) processFile(f);
console.log('done');
