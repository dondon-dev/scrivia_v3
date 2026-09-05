// One-shot conversion of the two legacy hook files into v0.22-loadable .pb.js
// copies. Run: node scripts/convert-hooks.cjs
const fs = require('fs');
const path = require('path');

const HOOKS = path.join(__dirname, '..', 'pocketbase_bin', 'pb_hooks');
const LEGACY = path.join(HOOKS, '_legacy');
fs.mkdirSync(LEGACY, { recursive: true });

const HELPERS = `
// ── v0.22 JSVM helpers ──────────────────────────────────────────────────────
// PocketBase v0.22 has no Dao.countRecords and c.request().body() is not
// callable from the JSVM — use $apis.requestInfo(c).data instead.
function bodyOf(c) {
  try {
    const info = $apis.requestInfo(c);
    return info && info.data ? info.data : {};
  } catch (_) {
    return {};
  }
}

function countByFilter(collectionNameOrId, filter) {
  try {
    return $app.dao().findRecordsByFilter(collectionNameOrId, filter || "", "", 1000000, 0).length;
  } catch (_) {
    return 0;
  }
}

function collCount(col) {
  try {
    const name = typeof col === "string" ? col : col.name;
    return countByFilter(name, "");
  } catch (_) {
    return 0;
  }
}
`;

function convert(srcFile, outFile, transforms) {
  const src = path.join(HOOKS, srcFile);
  let js = fs.readFileSync(src, 'utf8');

  // 1. TS body casts: `c.request().body() as { ... };` (multi-line) → `bodyOf(c);`
  js = js.replace(/c\.request\(\)\.body\(\) as\s*\{[\s\S]*?\}\s*;/g, 'bodyOf(c);');
  // any leftover single-line `X as Y` casts on body access
  js = js.replace(/c\.request\(\)\.body\(\) as [A-Za-z]+/g, 'bodyOf(c)');

  // 2. http.Request members are FIELDS in goja, not methods
  js = js.replace(/c\.request\(\)\.remoteAddr\(\)/g, 'c.request().remoteAddr');
  js = js.replace(/c\.request\(\)\.header\(\)/g, 'c.request().header');

  // 2b. Remaining TS casts: `(x as number)`, `x as string`, etc.
  js = js.replace(/\(([^()]+?) as [a-zA-Z<>"\[\]]+\)/g, '($1)');
  js = js.replace(/([\w.)\]]+) as (?:number|string|boolean|any|[A-Z][A-Za-z<>"\[\]| ,]*?)(?=[\s,;)])/g, '$1');
  // 2c. Variable type annotations: `const updates: Record<string, any> = {` → `const updates = {`
  js = js.replace(/(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*Record<[\s\S]*?>\s*=/g, '$1 $2 =');

  // 2d. Record id is a METHOD in goja (record.id is undefined)
  js = js.replace(/(profile|authRecord|record)\.id\b(?!\()/g, '$1.id()');

  // 3. $http.send is synchronous in the JSVM — drop async/await
  js = js.replace(/await /g, '');
  js = js.replace(/async \((c|e)\)/g, '($1)');

  // 4. countRecords overloads
  js = js.replace(/([\w$.]+)\.countRecords\("([^"]+)",\s*/g, 'countByFilter("$2", ');
  js = js.replace(/\$app\.dao\(\)\.countRecords\(coll\)/g, 'collCount(coll)');

  // 5. authRecord.email used as property → method call
  js = js.replace(/authRecord\.email\b(?!\()/g, 'authRecord.email()');

  if (transforms) js = transforms(js);

  // prepend helpers after any <reference> comment block
  const refEnd = js.indexOf('/// <reference');
  if (refEnd === 0) {
    const nl = js.indexOf('\n', refEnd);
    js = js.slice(0, nl + 1) + HELPERS + js.slice(nl + 1);
  } else {
    js = HELPERS + js;
  }

  fs.writeFileSync(path.join(HOOKS, outFile), js);
  // archive the original
  fs.copyFileSync(src, path.join(LEGACY, srcFile));
  fs.unlinkSync(src);
  console.log(`converted ${srcFile} -> ${outFile}`);
}

// ── dashboard.js ────────────────────────────────────────────────────────────
convert('dashboard.js', 'dashboard.pb.js', (js) => {
  // query-schools-with-stats used an undefined PB_API_URL global to self-HTTP.
  // Replace the whole handler with a direct DB-backed implementation.
  js = js.replace(
    /routerAdd\("GET", "\/api\/query-schools-with-stats",[\s\S]*?\n\}\);/,
    `routerAdd("GET", "/api/query-schools-with-stats", (c) => {
  const dao = $app.dao();
  let schools = [];
  try { schools = dao.findRecordsByFilter("schools", "", "school_name", 2000, 0); } catch (_) {}
  const stats = schools.map((s) => ({
    id: s.id,
    school_code: s.get("school_code"),
    school_name: s.get("school_name"),
    division_id: s.get("division_id"),
  }));
  return c.json(200, { data: { schools: stats, divisions: [] } });
});`
  );
  // findFirstRecordById throws when the record is missing — guard it.
  js = js.replace(
    'const securitySettings = dao.findFirstRecordById("security_settings", "1");',
    'const securitySettings = (() => { try { return dao.findFirstRecordById("security_settings", "1"); } catch (_) { return null; } })();'
  );
  return js;
});

// ── auth_security.js ────────────────────────────────────────────────────────
convert('auth_security.js', 'auth_security.pb.js', (js) => {
  // Strip the legacy /api/permissions* routes: rpc_compat_routes.pb.js already
  // registers GET+POST with the response shape the frontend expects, and echo
  // panics on duplicate method+path registrations.
  js = js.replace(
    /\/\/ ─── Role Permissions Management[\s\S]*?(?=\/\/ ─── (?!Role Permissions))/,
    ''
  );
  return js;
});

console.log('done');
