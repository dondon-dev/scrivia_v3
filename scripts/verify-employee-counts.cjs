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

  const checks = [
    { name: 'employees', label: 'Employee Masterfile (from MASTFILE.DBF)' },
    { name: 'payroll_deductions', label: 'Payroll Deductions (from DEDFILE.DBF)' },
    { name: 'payroll_entries', label: 'Payroll Entries' },
    { name: 'payroll_groups', label: 'Payroll Groups' },
    { name: 'regions', label: 'Regions' },
    { name: 'divisions', label: 'Divisions' },
    { name: 'schools', label: 'Schools' },
  ];

  for (const { name, label } of checks) {
    const res = await httpReq('GET', `/api/collections/${name}/records?perPage=1`, null, token);
    if (res.status < 400) {
      console.log(`${label} (${name}): ${res.data.totalItems} records`);
    } else {
      console.log(`${label} (${name}): ERROR ${res.status}`);
    }
  }
}

main().catch(console.error);
