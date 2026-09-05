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
  const res = await httpReq('POST', '/api/admins/auth-with-password', {
    identity: 'admin@scrivia.local', password: 'Admin123456!'
  });
  const token = res.data.token;
  
  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  console.log(`Total: ${cols.data.totalItems} collections\n`);
  
  for (const c of cols.data.items.sort((a,b) => a.name.localeCompare(b.name))) {
    const fields = c.fields || [];
    console.log(`${c.name} [${c.type}] fields=${fields.length}${c.system ? ' (system)' : ''}`);
    if (fields.length > 0 && fields.length <= 5) {
      fields.forEach(f => console.log(`  ${f.name} [${f.type}]`));
    } else if (fields.length > 5) {
      fields.slice(0, 3).forEach(f => console.log(`  ${f.name} [${f.type}]`));
      console.log(`  ... and ${fields.length - 3} more`);
    }
  }
}

main().catch(console.error);
