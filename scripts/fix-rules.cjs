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
  let updated = 0, skipped = 0;

  for (const c of cols.data.items) {
    if (c.system) { skipped++; continue; }
    
    // Check if rules need updating
    const needsUpdate = c.listRule !== '' || c.viewRule !== '' || c.createRule !== '' || c.updateRule !== '' || c.deleteRule !== '';
    if (!needsUpdate && c.listRule === '' && c.viewRule === '') { 
      // Already public
      continue;
    }

    const res = await httpReq('PATCH', `/api/collections/${c.id}`, {
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    }, token);
    
    if (res.status < 400) {
      updated++;
    } else {
      console.log(`FAILED: ${c.name} - ${res.status}`);
    }
  }

  console.log(`Rules updated: ${updated}, Skipped system: ${skipped}`);

  // Final check
  const final = await httpReq('GET', '/api/collections?perPage=500', null, token);
  let allPublic = true;
  for (const c of final.data.items) {
    if (c.system) continue;
    if (c.listRule !== '' || c.viewRule !== '' || c.createRule !== '' || c.updateRule !== '' || c.deleteRule !== '') {
      console.log(`NOT PUBLIC: ${c.name} listRule=${c.listRule} viewRule=${c.viewRule}`);
      allPublic = false;
    }
  }
  console.log(allPublic ? 'All collections are public' : 'Some collections still restricted');
}

main().catch(console.error);
