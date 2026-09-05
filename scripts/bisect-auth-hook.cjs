const fs = require('fs');
const SRC = 'pocketbase_bin/pb_hooks/auth_security.pb.js';
const lines = fs.readFileSync(SRC, 'utf8').split('\n');

// 1-indexed [start, end] ranges of the two auth handlers (verified via grep)
const RANGES = {
  afterAuth: [438, 481],   // onRecordAfterAuthWithPasswordRequest block
  beforeAuth: [483, 516],  // onRecordBeforeAuthWithPasswordRequest block
};

function makeVariant(disabled) {
  const v = lines.slice();
  for (const key of disabled) {
    const [s, e] = RANGES[key];
    for (let i = s - 1; i < e && i < v.length; i++) v[i] = '// BISECT ' + v[i];
  }
  return v.join('\n');
}

// A: only afterAuth disabled  -> if 200, afterAuth is the culprit
// B: only beforeAuth disabled -> if 200, beforeAuth is the culprit
fs.writeFileSync('.freebuff/hooktest/variant_A.pb.js', makeVariant(['afterAuth']));
fs.writeFileSync('.freebuff/hooktest/variant_B.pb.js', makeVariant(['beforeAuth']));
fs.writeFileSync('.freebuff/hooktest/variant_C.pb.js', makeVariant(['afterAuth', 'beforeAuth']));
console.log('variants written');
