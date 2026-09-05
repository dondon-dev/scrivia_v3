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

  // Check employees schema
  const cols = await httpReq('GET', '/api/collections/employees', null, token);
  console.log('employees schema:', cols.data.schema.map(f => `${f.name}${f.required ? '*' : ''}(${f.type})`).join(', '));

  // Check if there's a required field
  const required = cols.data.schema.filter(f => f.required);
  console.log('\nRequired fields:', required.map(f => f.name).join(', ') || 'NONE');

  // Try inserting a simple employee record
  const testEmp = {
    employee_number: 'TEST001',
    last_name: 'Test',
    first_name: 'Employee',
    stacode: '001',
    empno: 'TEST001',
    status: 'Active',
  };
  console.log('\nTest insert:', JSON.stringify(testEmp));

  const insertRes = await httpReq('POST', '/api/collections/employees/records', testEmp, token);
  console.log('Insert status:', insertRes.status);
  if (insertRes.status >= 400) {
    console.log('Insert error:', JSON.stringify(insertRes.data, null, 2));
  } else {
    console.log('Insert OK, id:', insertRes.data.id);
    // Clean up
    await httpReq('DELETE', `/api/collections/employees/records/${insertRes.data.id}`, null, token);
    console.log('Cleaned up');
  }
}

main().catch(console.error);
