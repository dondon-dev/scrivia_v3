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

  // Get CALABARZON region
  const regions = await httpReq('GET', '/api/collections/regions/records?perPage=500', null, token);
  const calabarzon = regions.data.items.find(r => r.region_code === '04A');
  if (!calabarzon) {
    console.log('No CALABARZON region found! Regions:', regions.data.items.map(r => `${r.region_code} (${r.id})`));
    return;
  }
  console.log('CALABARZON region:', calabarzon.id, calabarzon.region_code);

  // Get all divisions
  const divisions = await httpReq('GET', '/api/collections/divisions/records?perPage=500', null, token);
  console.log(`Total divisions: ${divisions.data.totalItems}`);
  
  // Link all to CALABARZON
  let linked = 0, deleted = 0;
  for (const d of divisions.data.items) {
    if (d.region_id === calabarzon.id) {
      console.log(`  Already linked: ${d.division_code} (${d.division_name})`);
      continue;
    }
    const res = await httpReq('PATCH', `/api/collections/divisions/records/${d.id}`, {
      region_id: calabarzon.id,
    }, token);
    if (res.status < 400) {
      console.log(`  Linked: ${d.division_code} (${d.division_name}) → ${calabarzon.region_code}`);
      linked++;
    } else {
      console.log(`  FAILED: ${d.division_code} - ${JSON.stringify(res.data).substring(0, 200)}`);
    }
  }

  // Check for duplicates (keep first, delete rest)
  const byCode = {};
  for (const d of divisions.data.items) {
    if (!byCode[d.division_code]) byCode[d.division_code] = [];
    byCode[d.division_code].push(d);
  }
  for (const [code, dups] of Object.entries(byCode)) {
    if (dups.length > 1) {
      console.log(`\n  Duplicate "${code}": ${dups.length} records. Keeping first, deleting rest...`);
      for (let i = 1; i < dups.length; i++) {
        await httpReq('DELETE', `/api/collections/divisions/records/${dups[i].id}`, null, token);
        console.log(`    Deleted: ${dups[i].id}`);
        deleted++;
      }
    }
  }

  console.log(`\nDone. Linked: ${linked}, Deleted duplicates: ${deleted}`);

  // Final state
  const final = await httpReq('GET', '/api/collections/divisions/records?perPage=500', null, token);
  for (const d of final.data.items) {
    console.log(`  ${d.division_code} (${d.division_name}) region_id=${d.region_id || 'NULL'}`);
  }
}

main().catch(console.error);
