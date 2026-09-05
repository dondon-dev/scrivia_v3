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

  // Step 1: Try what syncMastfile does - fetch existing employees
  console.log('=== Step 1: Fetch existing employees (like syncMastfile) ===');
  const existingRes = await httpReq('GET', '/api/collections/employees/records?page=1&perPage=30&fields=id,empno,employee_number', null, token);
  console.log('Existing employees:', existingRes.data?.totalItems ?? 'error', 'returned:', existingRes.data?.items?.length ?? 0);

  // Step 2: Create a batch of 3 employee records (like syncMastfile's upsert batch)
  console.log('\n=== Step 2: Batch upsert (array of objects) ===');
  const batch = [
    { empno: 'SYNC001', employee_number: 'SYNC001', first_name: 'Juan', last_name: 'Dela Cruz', stacode: '001', status: 'Active' },
    { empno: 'SYNC002', employee_number: 'SYNC002', first_name: 'Maria', last_name: 'Santos', stacode: '001', status: 'Active' },
    { empno: 'SYNC003', employee_number: 'SYNC003', first_name: 'Pedro', last_name: 'Garcia', stacode: '002', status: 'Active' },
  ];
  
  // This is what syncMastfile calls: supabase.from('employees').upsert(batch, { onConflict: 'employee_number' })
  // In pb.ts this hits the batch upsert path
  const upsertRes = await httpReq('POST', '/api/collections/employees/records', batch, token);
  console.log('Batch POST status:', upsertRes.status);
  if (upsertRes.status >= 400) {
    console.log('Error:', JSON.stringify(upsertRes.data).substring(0, 300));
  } else {
    console.log('OK - records:', Array.isArray(upsertRes.data) ? upsertRes.data.length : 'not array');
  }

  // Step 3: Try individual creates (what pb.ts batch upsert does)
  console.log('\n=== Step 3: Individual creates (what pb.ts does internally) ===');
  let success = 0, failed = 0;
  for (const rec of batch) {
    const res = await httpReq('POST', '/api/collections/employees/records', rec, token);
    if (res.status < 400) {
      success++;
      console.log(`  Created: ${rec.employee_number} (id: ${res.data.id})`);
    } else {
      failed++;
      console.log(`  FAILED: ${rec.employee_number} - ${res.status}: ${JSON.stringify(res.data).substring(0, 200)}`);
    }
  }
  console.log(`Result: ${success} created, ${failed} failed`);

  // Check total
  const count = await httpReq('GET', '/api/collections/employees/records?perPage=1', null, token);
  console.log(`\nTotal employees in DB: ${count.data?.totalItems ?? 'error'}`);

  // Cleanup
  const all = await httpReq('GET', '/api/collections/employees/records?perPage=500&filter=employee_number~"SYNC"', null, token);
  if (all.status < 400) {
    for (const e of all.data.items) {
      await httpReq('DELETE', `/api/collections/employees/records/${e.id}`, null, token);
    }
    console.log(`Cleaned up ${all.data.items.length} test records`);
  }
}

main().catch(console.error);
