const fs = require('fs');
const P = '.freebuff/h1/rpc_compat_routes.pb.js';
let s = fs.readFileSync(P, 'utf8');

const oldHandler = `routerAdd("POST", "/api/permissions", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) return c.json(401, { error: "Unauthorized" });
  return c.json(200, permissionList());
});`;

const newHandler = `routerAdd("POST", "/api/permissions", (c) => {
  const steps = [];
  try {
    const authRecord = c.get("authRecord");
    steps.push("auth:" + !!authRecord);
    if (!authRecord) return c.json(401, { error: "Unauthorized", steps });
    const list = permissionList();
    steps.push("list:" + list.length);
    return c.json(200, list);
  } catch (eAll) {
    return c.json(200, { fatal: String(eAll), steps });
  }
});`;

if (!s.includes(oldHandler)) {
  console.error('PATTERN NOT FOUND — dumping POST handler region:');
  const i = s.indexOf('routerAdd("POST", "/api/permissions"');
  console.error(s.slice(i, i + 300));
  process.exit(1);
}
s = s.replace(oldHandler, newHandler);
fs.writeFileSync(P, s);
console.log('instrumented OK');
