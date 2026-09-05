/**
 * Make every pb_hooks handler v0.22-safe:
 *  1. .set({...}) / .set(varObj)  -> .load(...)  (v0.22 set(key,value) returns void;
 *     Record.load(data) is the supported bulk form)
 *  2. const X = new Record(col, { ... }); -> const X = new Record(col); X.load({ ... });
 *  3. findRecordsByFilter with <5 args -> pad (col, filter, sort, limit, offset)
 *  4. invisible top-level consts in handlers -> literals
 *  5. findFirstRecordByData(<collectionVar>, ...) -> string collection name
 */
const fs = require('fs');

const FILES = [
  'pocketbase_bin/pb_hooks/auth_security.pb.js',
  'pocketbase_bin/pb_hooks/dashboard.pb.js',
  'pocketbase_bin/pb_hooks/rpc_compat_routes.pb.js',
];

function findBalanced(src, openIdx) {
  // src[openIdx] === '(' -> return index of matching ')'
  let depth = 0, inStr = null, esc = false;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function fixNewRecord(src) {
  let out = src;
  let guard = 50;
  while (guard-- > 0) {
    const callIdx = out.indexOf('new Record(');
    if (callIdx === -1) break;
    const openParen = callIdx + 'new Record'.length;
    const closeParen = findBalanced(out, openParen);
    if (closeParen === -1) break;
    const argStr = out.slice(openParen + 1, closeParen);
    // split top-level commas
    let depth = 0, inStr = null, esc = false;
    const commas = [];
    for (let i = 0; i < argStr.length; i++) {
      const ch = argStr[i];
      if (inStr) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === inStr) inStr = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) commas.push(i);
    }
    if (commas.length === 0) break; // already 1-arg, move past
    const colExpr = argStr.slice(0, commas[0]).trim();
    const objExpr = argStr.slice(commas[0] + 1).trim();
    // var assignment?  `const X = new Record(...)`
    const before = out.slice(0, callIdx);
    const asgMatch = before.match(/(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
    const varName = asgMatch ? asgMatch[2] : null;
    if (varName) {
      const replacement = `new Record(${colExpr}); ${varName}.load(${objExpr}`;
      out = out.slice(0, callIdx) + replacement + out.slice(closeParen);
      // careful: we inserted "});" shape — the original had `});` after closeParen
      // original: new Record(col, {obj});  -> now: new Record(col); X.load({obj});
      // the char right after closeParen should be ')': original arg list ended with
      // ')' from closeParen and the object's '}' is inside argStr. But we consumed
      // the object literal's closing '}' inside objExpr and the ')' at closeParen
      // remains: `new Record(col); X.load({obj});` — wait, closeParen is Record's
      // own ')', we still need to close load('s paren. The original text after
      // closeParen is ');' which now closes load(). Correct.
    } else {
      // not a simple assignment; bail out for this occurrence to avoid corruption
      // move search window past this call
      out = out.slice(0, callIdx) + '/*NRA*/new Record(' + argStr.replace(',', '~COMMA~') + out.slice(closeParen);
    }
  }
  return out.split('~COMMA~').join(',').split('/*NRA*/new Record(').join('new Record(');
}

function padFindRecordsByFilter(src) {
  let out = src;
  let guard = 200;
  let idx = 0;
  while (guard-- > 0) {
    const name = 'findRecordsByFilter(';
    const callIdx = out.indexOf(name, idx);
    if (callIdx === -1) break;
    const openParen = callIdx + name.length - 1;
    const closeParen = findBalanced(out, openParen);
    if (closeParen === -1) break;
    const argStr = out.slice(openParen + 1, closeParen);
    // count top-level commas
    let depth = 0, inStr = null, esc = false, args = 1;
    for (let i = 0; i < argStr.length; i++) {
      const ch = argStr[i];
      if (inStr) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === inStr) inStr = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) args++;
    }
    if (args < 5) {
      const pad = ', 0'.repeat(5 - args);
      out = out.slice(0, closeParen) + pad + out.slice(closeParen);
    }
    idx = closeParen + 1;
  }
  return out;
}

for (const f of FILES) {
  let s = fs.readFileSync(f, 'utf8');

  // 1. batch set -> load (only object literals and the `updates` var)
  s = s.replace(/\.set\((\{[\s\S]*?\})\)/g, '.load($1)');
  s = s.replace(/\.set\(updates\)/g, '.load(updates)');

  // 2. new Record(col, {...}) -> new Record(col); X.load({...})
  s = fixNewRecord(s);

  // 3. findRecordsByFilter padding
  s = padFindRecordsByFilter(s);

  // 4. invisible consts -> literals (before removing their declarations)
  s = s.split('MAX_FAILED_ATTEMPTS').join('5');
  s = s.split('LOCKOUT_DURATION_MS').join('(15 * 60 * 1000)');
  s = s.split('MFA_CODE_EXPIRY_MINUTES').join('10');
  s = s.replace(/^const MAX_FAILED_ATTEMPTS = 5;\n/m, '');
  s = s.replace(/^const LOCKOUT_DURATION_MS[\s\S]*?;\n/m, '');
  s = s.replace(/^const MFA_CODE_EXPIRY_MINUTES = 10;\n/m, '');

  // 5. Collection object as collection arg -> string name
  s = s.replace(/findFirstRecordByData\(otpCollection,/g, 'findFirstRecordByData("otp_codes",');
  s = s.replace(/findFirstRecordByData\(resetCollection,/g, 'findFirstRecordByData("password_reset_tokens",');
  s = s.replace(/findFirstRecordByData\(loginCollection,/g, 'findFirstRecordByData("login_attempts",');

  fs.writeFileSync(f, s);
  console.log('patched', f);
}
console.log('done');
