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

  // Get current divisions schema
  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  const divCol = cols.data.items.find(c => c.name === 'divisions');
  console.log('Current divisions fields:', divCol.schema.map(f => f.name).join(', '));

  // Add region_id field to the schema
  const newSchema = [...divCol.schema, { name: 'region_id', type: 'text', required: false, options: {} }];

  const patchRes = await httpReq('PATCH', `/api/collections/${divCol.id}`, {
    schema: newSchema,
  }, token);
  
  if (patchRes.status < 400) {
    console.log('Added region_id to divisions. New fields:', patchRes.data.schema.map(f => f.name).join(', '));
  } else {
    console.log('FAILED:', JSON.stringify(patchRes.data).substring(0, 300));
    return;
  }

  // Now link existing divisions to their regions
  const regions = await httpReq('GET', '/api/collections/regions/records?perPage=500', null, token);
  const regionMap = {};
  for (const r of regions.data.items) {
    regionMap[r.region_code] = r.id;
    regionMap[r.id] = r.id;
  }
  console.log('Region map:', JSON.stringify(regionMap));

  const divisions = await httpReq('GET', '/api/collections/divisions/records?perPage=500', null, token);
  console.log(`\nLinking ${divisions.data.totalItems} divisions to regions...`);

  for (const d of divisions.data.items) {
    // Try to find region by region_code field
    const regId = regionMap[d.region_code] || d.region_id || null;
    if (regId && regId !== d.region_id) {
      const updateRes = await httpReq('PATCH', `/api/collections/divisions/records/${d.id}`, {
        region_id: regId,
      }, token);
      if (updateRes.status < 400) {
        console.log(`  Linked ${d.division_code} (${d.division_name}) → region ${regId}`);
      } else {
        console.log(`  FAILED to link ${d.division_code}: ${JSON.stringify(updateRes.data).substring(0, 200)}`);
      }
    } else {
      console.log(`  ${d.division_code}: region_id=${d.region_id || 'NULL'}, region_code=${d.region_code || 'NULL'}`);
    }
  }
}

main().catch(console.error);
