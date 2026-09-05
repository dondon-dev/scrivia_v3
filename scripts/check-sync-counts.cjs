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

  // Check actual record counts
  const tables = ['dbf_stntable', 'dbf_divtable', 'dbf_mastfile', 'dbf_included', 'dbf_excluded'];
  
  for (const t of tables) {
    const res = await httpReq('GET', `/api/collections/${t}/records?perPage=1`, null, token);
    if (res.status < 400) {
      console.log(`${t}: ${res.data.totalItems} total records`);
      if (res.data.totalItems > 0) {
        console.log(`  Sample: ${JSON.stringify(Object.keys(res.data.items[0]).slice(0, 5))}`);
      }
    } else {
      console.log(`${t}: ERROR ${res.status}`);
    }
  }

  // Check if there's a dedfile table too
  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  const dbfCols = cols.data.items.filter(c => c.name.startsWith('dbf_'));
  console.log(`\nDBF collections: ${dbfCols.length}`);
  for (const c of dbfCols) {
    const res = await httpReq('GET', `/api/collections/${c.name}/records?perPage=1`, null, token);
    if (res.status < 400) {
      console.log(`  ${c.name}: ${res.data.totalItems} records`);
    }
  }
}

main().catch(console.error);
