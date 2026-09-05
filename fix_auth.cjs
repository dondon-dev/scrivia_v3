const http = require('http');
const token = process.argv[2];
const PB = 'http://localhost:8090';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PB);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ s: res.statusCode, d: JSON.parse(d) }); } catch { resolve({ s: res.statusCode, d }); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  // 1. List all collections
  const list = await req('GET', '/api/collections?perPage=500');
  const items = list.d.items || [];
  console.log('Total collections:', items.length);

  // Find and delete broken profiles/users
  for (const name of ['profiles', 'users']) {
    const col = items.find(c => c.name === name);
    if (col) {
      await req('DELETE', '/api/collections/' + col.id);
      console.log('Deleted:', name);
    }
  }

  // 2. Create PROFILES as an auth collection
  const profilesRes = await req('POST', '/api/collections', {
    name: 'profiles',
    type: 'auth',
    system: false,
    schema: [
      { name: 'first_name', type: 'text', options: { min: 0, max: 0 } },
      { name: 'last_name', type: 'text', options: { min: 0, max: 0 } },
      { name: 'middle_name', type: 'text', options: { min: 0, max: 0 } },
      { name: 'role', type: 'text', options: { min: 0, max: 0 } },
      { name: 'status', type: 'text', options: { min: 0, max: 0 } },
      { name: 'division_id', type: 'text', options: { min: 0, max: 0 } },
      { name: 'regcode', type: 'text', options: { min: 0, max: 0 } },
      { name: 'divcode', type: 'text', options: { min: 0, max: 0 } },
      { name: 'avatar', type: 'text', options: { min: 0, max: 0 } },
      { name: 'office_assignment', type: 'text', options: { min: 0, max: 0 } },
    ],
    listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
    auth: {
      enabled: true,
      manageRule: '',
      inviteRule: '',
      verifyRule: '',
      mfa: { enabled: false, duration: 0, period: 0 },
      password: { enabled: true, minLength: 8 },
      resetPassword: true,
      autoVerify: false,
    }
  }, token);
  console.log('Created profiles auth collection:', profilesRes.s === 200 ? 'OK' : 'ERROR ' + profilesRes.s);
  if (profilesRes.s !== 200) console.log(JSON.stringify(profilesRes.d).substring(0, 300));

  // 3. Create user accounts
  const users = [
    { email: 'adonaimagno@gmail.com', password: 'Admin123!@#', first_name: 'Adonai', last_name: 'Magno', role: 'super_admin', status: 'approved' },
    { email: 'e2e.test@deped.gov.ph', password: 'E2ETest123!', first_name: 'E2E', last_name: 'TestUser', role: 'payroll_processor', status: 'approved' },
    { email: 'testuser@deped.gov.ph', password: 'TestUser123!', first_name: 'Test', last_name: 'User', role: 'payroll_processor', status: 'approved' },
    { email: 'demo@scrivia.local', password: 'Demo123456!', first_name: 'Demo', last_name: 'User', role: 'super_admin', status: 'approved' },
  ];

  for (const u of users) {
    const res = await req('POST', '/api/collections/profiles/records', {
      email: u.email,
      password: u.password,
      passwordConfirm: u.password,
      first_name: u.first_name,
      last_name: u.last_name,
      role: u.role,
      status: u.status,
    }, token);
    console.log('Created user ' + u.email + ':', res.s === 200 ? 'OK (id:' + res.d.id + ')' : 'ERROR ' + res.s + ' ' + JSON.stringify(res.d).substring(0, 100));
  }

  // 4. Test login
  const loginRes = await req('POST', '/api/collections/profiles/auth-with-password', {
    identity: 'adonaimagno@gmail.com',
    password: 'Admin123!@#',
  });
  console.log('\nTest login:', loginRes.s === 200 ? 'SUCCESS (token: ' + loginRes.d.token.substring(0, 30) + '...)' : 'FAILED ' + loginRes.s + ' ' + JSON.stringify(loginRes.d).substring(0, 100));
}
main().catch(e => console.error('FATAL:', e));
