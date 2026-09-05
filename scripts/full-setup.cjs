const http = require('http');
const fs = require('fs');
const PB = 'http://localhost:8090';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PB);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
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
  // 1. Create admin
  const adminRes = await req('POST', '/api/admins', {
    email: 'admin@scrivia.local', password: 'Admin123456!', passwordConfirm: 'Admin123456!'
  });
  if (adminRes.s >= 400 && !String(adminRes.d).includes('already exists')) {
    console.log('Admin creation error:', JSON.stringify(adminRes.d).substring(0, 100));
  }
  console.log('1. Admin created');

  // 2. Login as admin
  const loginRes = await req('POST', '/api/admins/auth-with-password', {
    identity: 'admin@scrivia.local', password: 'Admin123456!'
  });
  const token = loginRes.d.token;
  console.log('2. Admin logged in');

  // 3. Run the table creation script
  // First, check if tables already exist
  const colsList = await req('GET', '/api/collections?perPage=500', null, token);
  const existingNames = (colsList.d.items || []).map(c => c.name);
  console.log('3. Existing collections:', existingNames.length);

  // Read the backup and extract tables
  const backupPath = 'C:/Backups/supabase_backup_2026-Tue 09-01_ 0-13.sql';
  if (!fs.existsSync(backupPath)) {
    console.log('ERROR: Backup file not found at', backupPath);
    return;
  }
  const content = fs.readFileSync(backupPath, 'utf8');

  // Extract all CREATE TABLE blocks
  const tableRegex = /CREATE TABLE public\.(\w+)\s*\(([\s\S]*?)\);/g;
  let match;
  const allTables = {};
  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const columns = [];
    const items = body.split(/(?<=\n)\s/);
    let curLine = '';
    for (const ch of body) {
      if (ch === ',') {
        const trimmed = curLine.trim();
        if (trimmed && !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|EXCLUDE|FOREIGN|CREATE |INDEX |ENABLE |ALTER |USING |WITH |GRANT|NOT |--)/i.test(trimmed)) {
          const m = trimmed.match(/^"?(\w+)"?\s+(.+)/);
          if (m && m[1].toLowerCase() !== 'id') {
            const colName = m[1];
            const typeDef = m[2].trim();
            let colType = typeDef.split(/\s+DEFAULT\b/i)[0].split(/\s+NOT\s+NULL\b/i)[0]
              .split(/\s+NULL\b/i)[0].split(/\s+PRIMARY\b/i)[0].split(/\s+REFERENCES\b/i)[0]
              .split(/\s+UNIQUE\b/i)[0].trim().replace(/\(\d+(?:,\s*\d+)?\)/, '');
            const PB_TYPES = { 'uuid':'text','text':'text','character varying':'text','varchar':'text',
              'boolean':'bool','integer':'number','int':'number','bigint':'number','smallint':'number',
              'numeric':'number','decimal':'number','real':'number','double precision':'number','money':'number',
              'date':'text','time':'text','timetz':'text','timestamp':'text','timestamptz':'text',
              'timestamp with time zone':'text','timestamp without time zone':'text',
              'json':'text','jsonb':'text','bytea':'text','oid':'number' };
            const pbType = PB_TYPES[colType.toLowerCase()] || 'text';
            columns.push({
              name: colName, type: pbType,
              required: /\bNOT\s+NULL\b/i.test(typeDef) && !/\bDEFAULT\b/i.test(typeDef),
              options: pbType === 'text' ? { maxSize: 500 } : {}
            });
          }
        }
        curLine = '';
      } else {
        curLine += ch;
      }
    }
    if (columns.length > 0) allTables[tableName] = columns;
  }

  console.log('   Extracted', Object.keys(allTables).length, 'tables from backup');

  // Create missing collections
  let created = 0;
  const RESERVED = new Set(['id', 'created', 'updated', 'collectionId', 'collectionName']);
  for (const [tableName, columns] of Object.entries(allTables)) {
    if (existingNames.includes(tableName)) continue;
    const nameCount = {};
    const safeColumns = columns.map(c => {
      let name = c.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 60);
      if (RESERVED.has(name)) name = 'col_' + name;
      if (nameCount[name] !== undefined) { nameCount[name]++; name = name + '_' + nameCount[name]; }
      else nameCount[name] = 0;
      return { ...c, name };
    }).slice(0, 400);

    const res = await req('POST', '/api/collections', {
      name: tableName, type: 'base', system: false, schema: safeColumns,
      listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: ''
    }, token);
    if (res.s >= 400) {
      console.log('   SKIP', tableName, ':', String(res.d?.message || res.d).substring(0, 80));
    } else {
      created++;
    }
  }
  console.log('4. Created', created, 'new collections');

  // 4. Create profiles as AUTH collection (delete base version first)
  const existingProfiles = (colsList.d.items || []).find(c => c.name === 'profiles');
  if (existingProfiles) {
    await req('DELETE', '/api/collections/' + existingProfiles.id, null, token);
    console.log('5. Deleted old profiles collection');
  }

  const profilesRes = await req('POST', '/api/collections', {
    name: 'profiles', type: 'auth', system: false,
    schema: [
      { name: 'first_name', type: 'text', options: { maxSize: 500 } },
      { name: 'last_name', type: 'text', options: { maxSize: 500 } },
      { name: 'middle_name', type: 'text', options: { maxSize: 500 } },
      { name: 'role', type: 'text', options: { maxSize: 500 } },
      { name: 'status', type: 'text', options: { maxSize: 500 } },
      { name: 'division_id', type: 'text', options: { maxSize: 500 } },
      { name: 'regcode', type: 'text', options: { maxSize: 500 } },
      { name: 'divcode', type: 'text', options: { maxSize: 500 } },
      { name: 'avatar', type: 'text', options: { maxSize: 500 } },
      { name: 'office_assignment', type: 'text', options: { maxSize: 500 } },
    ],
    listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
    auth: { enabled: true, manageRule: '', inviteRule: '', verifyRule: '',
      mfa: { enabled: false, duration: 0, period: 0 },
      password: { enabled: true, minLength: 8 }, resetPassword: true, autoVerify: false }
  }, token);
  console.log('6. Created profiles auth collection:', profilesRes.s === 200 ? 'OK' : 'ERROR');

  // 5. Open ALL collection access rules
  const allCols = await req('GET', '/api/collections?perPage=500', null, token);
  const items = allCols.d.items || [];
  let rulesUpdated = 0;
  for (const col of items) {
    if (col.listRule === '' && col.createRule === '') continue; // already open
    if (col.type === 'auth') continue; // skip auth collections
    await req('PATCH', '/api/collections/' + col.id, {
      listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: ''
    }, token);
    rulesUpdated++;
  }
  console.log('7. Updated', rulesUpdated, 'collection access rules');

  // 6. Create user accounts
  const users = [
    { email: 'adonaimagno@gmail.com', password: 'Admin123!@#', first_name: 'Adonai', last_name: 'Magno', role: 'super_admin', status: 'approved' },
    { email: 'e2e.test@deped.gov.ph', password: 'E2ETest123!', first_name: 'E2E', last_name: 'TestUser', role: 'payroll_processor', status: 'approved' },
    { email: 'demo@scrivia.local', password: 'Demo123456!', first_name: 'Demo', last_name: 'User', role: 'super_admin', status: 'approved' },
  ];
  for (const u of users) {
    const res = await req('POST', '/api/collections/profiles/records', {
      email: u.email, password: u.password, passwordConfirm: u.password,
      first_name: u.first_name, last_name: u.last_name, role: u.role, status: u.status
    }, token);
    console.log('   User ' + u.email + ':', res.s === 200 ? 'OK' : 'ERROR ' + String(res.d?.message || '').substring(0, 80));
  }

  // 7. Seed dashboard_stats_cache and security_settings
  await req('POST', '/api/collections/dashboard_stats_cache/records', {
    total_records: 0, active_employees: 0, total_gross: 0, total_net: 0,
    total_mandatory: 0, total_loan_deds: 0, processed_count: 0, pending_count: 0,
    period_net: 0, active_loan_accounts: 0, unassigned_count: 0,
    group_stats: '[]', ded_totals_by_code: '[]', recent_employees: '[]',
    current_period: '', refreshed_at: '', regcode: '', divcode: ''
  }, token);
  await req('POST', '/api/collections/security_settings/records', {
    lockdown_enabled: false, lockdown_reason: '', lockdown_at: '', locked_by: '', updated_at: ''
  }, token);
  console.log('8. Seeded dashboard_stats_cache and security_settings');

  // 8. Test login
  const testLogin = await req('POST', '/api/collections/profiles/auth-with-password', {
    identity: 'adonaimagno@gmail.com', password: 'Admin123!@#'
  });
  console.log('9. Login test:', testLogin.s === 200 ? 'SUCCESS' : 'FAILED: ' + JSON.stringify(testLogin.d).substring(0, 100));

  const finalCols = await req('GET', '/api/collections?perPage=1', null, token);
  console.log('\n=== DONE ===');
  console.log('Total collections:', finalCols.d.totalItems || (finalCols.d.items || []).length);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
