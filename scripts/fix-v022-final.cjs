/**
 * Final v0.22 safety pass for pb_hooks:
 *  A. `$app.dao().updateRecord(X.load({...}));` → X.load({...}); $app.dao().updateRecord(X);
 *     (load() returns void in v0.22 — passing it to updateRecord panics)
 *  B. Wrap risky find* DAO calls in SAFE_* helpers defined at the top of each
 *     handler body (file-level definitions are invisible at request time).
 */
const fs = require('fs');

const FILES = [
  'pocketbase_bin/pb_hooks/auth_security.pb.js',
  'pocketbase_bin/pb_hooks/dashboard.pb.js',
];

const SAFE_HELPERS = `  function SAFE_FIND(col, filter, sort, limit, offset) {
    try { return $app.dao().findRecordsByFilter(col, filter || "", sort || "", limit || 1000000, offset || 0); } catch (_) { return []; }
  }
  function SAFE_FIND_DAO(dao, col, filter, sort, limit, offset) {
    try { return dao.findRecordsByFilter(col, filter || "", sort || "", limit || 1000000, offset || 0); } catch (_) { return []; }
  }
`;

function findHandlerBodies(src) {
  // returns array of [openBodyIdx, closeBodyIdx] for handler arrow bodies
  const re = /(routerAdd\(\s*"[A-Z]+"|onRecord[A-Za-z]+Request\()([\s\S]*?)(\((?:c|e)\)\s*=>\s*\{)/g;
  const spans = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = m.index + m[0].length - 1; // index of '{'
    let depth = 0, inStr = null, esc = false, end = -1;
    for (let i = open; i < src.length; i++) {
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
    spans.push([open + 1, end]);
    re.lastIndex = end;
  }
  return spans;
}

for (const f of FILES) {
  let src = fs.readFileSync(f, 'utf8');

  // A. split updateRecord(X.load(...)) — both one-line object and multiline
  // Pattern: ($app.dao\(\)\.)?updateRecord\((\w+)\.load\(
  // We find the matching close of load's paren, then rewrite.
  function splitLoads(s) {
    let guard = 60;
    while (guard-- > 0) {
      const m = s.match(/updateRecord\(([A-Za-z_$][\w$]*)\.load\(/);
      if (!m) break;
      const start = m.index;
      const varName = m[1];
      const loadOpen = start + m[0].length - 1;
      // find balanced close paren for load(
      let depth = 0, inStr = null, esc = false, close = -1;
      for (let i = loadOpen; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === inStr) inStr = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) { close = i; break; } }
      }
      if (close === -1) break;
      const inner = s.slice(loadOpen + 1, close); // object literal or var
      // after close should be '));'
      const after = s.slice(close + 1, close + 4);
      const stmtStart = s.lastIndexOf(';', start) + 1;
      const indentMatch = s.slice(stmtStart, start).match(/\n([ \t]*)$/);
      const indent = indentMatch ? indentMatch[1] : '  ';
      const replacement =
        `${varName}.load(${inner});\n${indent}$app.dao().updateRecord(${varName})`;
      // original span: from 'updateRecord(' to close (inclusive) covers
      // updateRecord( X .load( ... )  -> we replace up to close, leaving the
      // final ')' of updateRecord and the trailing ';'
      // s[start..close] is "updateRecord(X.load(<inner>" ; after close is "));"
      // We want: "X.load(<inner>);\n<indent>$app.dao().updateRecord(X));" — the
      // leftover "))" would double-close. Instead consume the trailing ");" too:
      let endIdx = close + 1;
      if (s[close + 1] === ')') endIdx = close + 2; // consume ')'
      if (s[endIdx] === ';') { /* keep semicolon handling simple: we include it */ }
      const trailingSemi = s[endIdx] === ';' ? ';' : '';
      const newStmt = `${varName}.load(${inner});${trailingSemi}\n${indent}$app.dao().updateRecord(${varName})${trailingSemi ? '' : ''}`;
      // If we consumed ')', the original "));" or ");" tail must be reconstructed:
      // original after close: "));"  -> consumed "));"? endIdx=close+2 consumed ");"
      // leaving ")"; messy — simpler: replace s[start..endIdxInclusiveOfSemi]
      let stmtEnd = close + 1;
      if (s[stmtEnd] === ')') stmtEnd++;
      if (s[stmtEnd] === ';') stmtEnd++;
      const fullOriginal = s.slice(start, stmtEnd);
      const rebuilt =
        `${varName}.load(${inner});\n${indent}$app.dao().updateRecord(${varName});`;
      s = s.slice(0, start) + rebuilt + s.slice(stmtEnd);
      void fullOriginal; void replacement; void after;
    }
    return s;
  }
  src = splitLoads(src);

  // B. safe-find helpers + call rewrite inside each handler body
  const spans = findHandlerBodies(src);
  const insertions = [];
  for (const [open, close] of spans) {
    const body = src.slice(open, close);
    const usesFind = /(\bdao\.findRecordsByFilter\(|\$app\.dao\(\)\.findRecordsByFilter\()/.test(body);
    if (usesFind) insertions.push({ open, close, body });
  }
  // apply from the end so indices stay valid
  for (let k = insertions.length - 1; k >= 0; k--) {
    const { open, close } = insertions[k];
    let body = src.slice(open, close);
    body = body.replace(/\bdao\.findRecordsByFilter\(/g, 'SAFE_FIND_DAO(dao, ');
    body = body.replace(/\$app\.dao\(\)\.findRecordsByFilter\(/g, 'SAFE_FIND(');
    src = src.slice(0, open) + '\n' + SAFE_HELPERS + body + src.slice(close);
  }

  fs.writeFileSync(f, src);
  console.log('fixed', f);
}
console.log('done');
