const http = require('http');
const PB_BASE = 'http://localhost:8090';

function httpReq(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, PB_BASE);
    const options = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = token;
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const authRes = await httpReq('POST', '/api/admins/auth-with-password', {
    identity: 'admin@scrivia.local', password: 'Admin123456!'
  });
  const token = authRes.data.token;
  
  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  console.log(`Total: ${cols.data.totalItems} collections\n`);
  
  let hasFields = 0, noFields = 0, missing = [];
  
  for (const c of cols.data.items.sort((a,b) => a.name.localeCompare(b.name))) {
    const schema = c.schema || c.fields || [];
    const fieldCount = schema.length;
    if (fieldCount > 0) hasFields++;
    else noFields++;
    console.log(`${c.name} [${c.type}] schema=${fieldCount}${c.system ? ' (system)' : ''}`);
    if (fieldCount > 0 && fieldCount <= 5) {
      schema.forEach(f => console.log(`  ${f.name} [${f.type}]`));
    } else if (fieldCount > 5) {
      schema.slice(0, 3).forEach(f => console.log(`  ${f.name} [${f.type}]`));
      console.log(`  ... and ${fieldCount - 3} more`);
    }
  }
  
  console.log(`\nWith fields: ${hasFields}, Without fields: ${noFields}`);
}

main().catch(console.error);
