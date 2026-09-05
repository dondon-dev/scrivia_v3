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

function jsonField(name, required) {
  return { name, type: 'json', required: required || false, options: { maxSize: 2097152 } };
}

async function main() {
  const authRes = await httpReq('POST', '/api/admins/auth-with-password', {
    identity: 'admin@scrivia.local', password: 'Admin123456!'
  });
  const token = authRes.data.token;
  const headers = { 'Authorization': token };

  // 1. Delete existing profiles (base type)
  console.log('=== Step 1: Fix profiles collection ===');
  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  const profilesCol = cols.data.items.find(c => c.name === 'profiles');
  if (profilesCol) {
    await httpReq('DELETE', `/api/collections/${profilesCol.id}`, null, token);
    console.log('Deleted old profiles (base type)');
  }

  // 2. Create profiles as AUTH type
  const profilesBody = {
    name: 'profiles',
    type: 'auth',
    system: false,
    schema: [
      { name: 'name', type: 'text', required: false, options: {} },
      { name: 'role', type: 'text', required: false, options: {} },
      { name: 'status', type: 'text', required: false, options: {} },
      { name: 'avatar_url', type: 'text', required: false, options: {} },
      { name: 'division_id', type: 'text', required: false, options: {} },
      { name: 'region_id', type: 'text', required: false, options: {} },
      { name: 'school_id', type: 'text', required: false, options: {} },
      { name: 'last_login', type: 'text', required: false, options: {} },
    ],
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  };
  const profilesRes = await httpReq('POST', '/api/collections', profilesBody, token);
  if (profilesRes.status >= 400) {
    console.log('ERROR creating profiles:', JSON.stringify(profilesRes.data).substring(0, 300));
    return;
  }
  console.log('Created profiles [auth] with', profilesBody.schema.length, 'fields');

  // 3. Enable email auth for profiles
  const updateAuthRes = await httpReq('PATCH', `/api/collections/${profilesRes.data.id}`, {
    options: {
      allowEmailAuth: true,
      allowOAuth2Auth: false,
      allowUsernameAuth: false,
      exceptEmailDomains: null,
      manageRule: '',
      minPasswordLength: 8,
      onlyVerified: false,
    }
  }, token);
  console.log('Email auth enabled:', updateAuthRes.status < 400 ? 'OK' : 'FAILED');

  // 4. Create user accounts
  console.log('\n=== Step 2: Create user accounts ===');
  const users = [
    { email: 'adonaimagno@gmail.com', password: 'Admin123!@#', name: 'Adonai Magno', role: 'super_admin', status: 'approved' },
    { email: 'demo@scrivia.local', password: 'Demo123456!', name: 'Demo User', role: 'super_admin', status: 'approved' },
    { email: 'e2e.test@deped.gov.ph', password: 'E2ETest1234!', name: 'E2E TestUser', role: 'payroll_processor', status: 'approved' },
    { email: 'testuser@deped.gov.ph', password: 'TestUser1234!', name: 'Test User', role: 'payroll_processor', status: 'approved' },
  ];

  for (const u of users) {
    try {
      const created = await httpReq('POST', `/api/collections/profiles/records`, {
        email: u.email,
        password: u.password,
        passwordConfirm: u.password,
        name: u.name,
        role: u.role,
        status: u.status,
        verified: true,
      }, token);
      if (created.status < 400) {
        console.log(`Created: ${u.email} [${u.role}]`);
      } else {
        console.log(`FAILED: ${u.email} - ${created.data?.message || JSON.stringify(created.data).substring(0, 200)}`);
      }
    } catch (err) {
      console.log(`ERROR: ${u.email} - ${err.message}`);
    }
  }

  // 5. Seed dashboard_stats_cache
  console.log('\n=== Step 3: Seed dashboard_stats_cache ===');
  try {
    const dashRes = await httpReq('POST', `/api/collections/dashboard_stats_cache/records`, {
      total_employees: 0,
      total_monthly_payroll: 0,
      pending_approvals: 0,
      active_loans: 0,
      group_stats: JSON.stringify({}),
      ded_totals_by_code: JSON.stringify({}),
      recent_employees: JSON.stringify([]),
      regcode: '',
      divcode: '',
    }, token);
    console.log('Seeded dashboard_stats_cache:', dashRes.status < 400 ? 'OK' : dashRes.data?.message);
  } catch(e) {
    console.log('dashboard_stats_cache error:', e.message);
  }

  // 6. Seed security_settings
  console.log('\n=== Step 4: Seed security_settings ===');
  try {
    const secRes = await httpReq('POST', `/api/collections/security_settings/records`, {
      setting_key: 'default',
      setting_value: JSON.stringify({
        password_min_length: 8,
        require_mfa: false,
        max_login_attempts: 5,
        lockout_duration_minutes: 30,
      }),
      description: 'Default security settings',
      updated_by: 'system',
    }, token);
    console.log('Seeded security_settings:', secRes.status < 400 ? 'OK' : secRes.data?.message);
  } catch(e) {
    console.log('security_settings error:', e.message);
  }

  // 7. Verify login works
  console.log('\n=== Step 5: Verify login ===');
  try {
    const loginRes = await httpReq('POST', `/api/collections/profiles/auth-with-password`, {
      identity: 'adonaimagno@gmail.com',
      password: 'Admin123!@#',
    });
    if (loginRes.status < 400) {
      console.log('LOGIN OK for adonaimagno@gmail.com');
      console.log('  Token:', loginRes.data.token ? 'present' : 'missing');
      console.log('  Record:', loginRes.data.record?.email, loginRes.data.record?.role);
    } else {
      console.log('LOGIN FAILED:', JSON.stringify(loginRes.data).substring(0, 300));
    }
  } catch(e) {
    console.log('LOGIN ERROR:', e.message);
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  const finalCols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  const profilesFinal = finalCols.data.items.find(c => c.name === 'profiles');
  console.log('profiles type:', profilesFinal?.type, 'schema:', profilesFinal?.schema?.length || 0);
}

main().catch(console.error);
