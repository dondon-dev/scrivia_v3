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

  // Test: insert 5 employee records individually (as pb.ts adapter does)
  const testRecords = [];
  for (let i = 1; i <= 5; i++) {
    testRecords.push({
      employee_number: `BULK${String(i).padStart(3, '0')}`,
      empno: `BULK${String(i).padStart(3, '0')}`,
      last_name: `TestEmployee${i}`,
      first_name: `Bulk`,
      stacode: '001',
      status: 'Active',
    });
  }

  let success = 0, failed = 0;
  for (const rec of testRecords) {
    const res = await httpReq('POST', '/api/collections/employees/records', rec, token);
    if (res.status < 400) {
      success++;
    } else {
      failed++;
      console.log(`FAILED: ${rec.employee_number} - ${res.status}: ${JSON.stringify(res.data).substring(0, 200)}`);
    }
  }
  console.log(`Individual insert: ${success} success, ${failed} failed`);

  // Test: insert all 5 as a batch POST (array body)
  const batchRes = await httpReq('POST', '/api/collections/employees/records', testRecords, token);
  console.log(`\nBatch POST (array): status=${batchRes.status}`);
  if (batchRes.status >= 400) {
    console.log(`  Error: ${JSON.stringify(batchRes.data).substring(0, 300)}`);
  } else {
    console.log(`  OK: ${batchRes.data?.length ?? 0} records`);
  }

  // Count total employees
  const count = await httpReq('GET', '/api/collections/employees/records?perPage=1', null, token);
  console.log(`\nTotal employees: ${count.data?.totalItems ?? 'error'}`);

  // Cleanup test records
  const allEmps = await httpReq('GET', '/api/collections/employees/records?perPage=500&filter=employee_number~"BULK"', null, token);
  if (allEmps.status < 400) {
    for (const e of allEmps.data.items) {
      await httpReq('DELETE', `/api/collections/employees/records/${e.id}`, null, token);
    }
    console.log(`Cleaned up ${allEmps.data.items.length} test records`);
  }
}

main().catch(console.error);
