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

  // Try profiles as base first
  const tests = [
    {
      name: 'profiles', type: 'base',
      schema: [
        { name: 'email', type: 'text', required: true, options: {} },
        { name: 'full_name', type: 'text', required: false, options: {} },
        { name: 'role', type: 'text', required: false, options: {} },
        { name: 'status', type: 'text', required: false, options: {} },
        { name: 'avatar_url', type: 'text', required: false, options: {} },
        { name: 'division_id', type: 'text', required: false, options: {} },
        { name: 'region_id', type: 'text', required: false, options: {} },
        { name: 'school_id', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'audit_logs', type: 'base',
      schema: [
        { name: 'user_id', type: 'text', required: false, options: {} },
        { name: 'action', type: 'text', required: true, options: {} },
        { name: 'table_name', type: 'text', required: false, options: {} },
        { name: 'record_id', type: 'text', required: false, options: {} },
        { name: 'old_data', type: 'json', required: false, options: {} },
        { name: 'new_data', type: 'json', required: false, options: {} },
        { name: 'ip_address', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'dashboard_stats_cache', type: 'base',
      schema: [
        { name: 'total_employees', type: 'number', required: false, options: {} },
        { name: 'total_monthly_payroll', type: 'number', required: false, options: {} },
        { name: 'pending_approvals', type: 'number', required: false, options: {} },
        { name: 'active_loans', type: 'number', required: false, options: {} },
        { name: 'group_stats', type: 'json', required: false, options: {} },
        { name: 'ded_totals_by_code', type: 'json', required: false, options: {} },
        { name: 'recent_employees', type: 'json', required: false, options: {} },
        { name: 'regcode', type: 'text', required: false, options: {} },
        { name: 'divcode', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'plantilla_import_logs', type: 'base',
      schema: [
        { name: 'uploaded_by', type: 'text', required: false, options: {} },
        { name: 'uploaded_by_id', type: 'text', required: false, options: {} },
        { name: 'filename', type: 'text', required: false, options: {} },
        { name: 'record_count', type: 'number', required: false, options: {} },
        { name: 'status', type: 'text', required: false, options: {} },
        { name: 'error_data', type: 'json', required: false, options: {} },
      ]
    },
    {
      name: 'security_settings', type: 'base',
      schema: [
        { name: 'setting_key', type: 'text', required: true, options: {} },
        { name: 'setting_value', type: 'json', required: false, options: {} },
        { name: 'description', type: 'text', required: false, options: {} },
        { name: 'updated_by', type: 'text', required: false, options: {} },
      ]
    },
  ];

  for (const def of tests) {
    const body = {
      name: def.name, type: def.type, system: false,
      schema: def.schema,
      listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
    };
    const res = await httpReq('POST', '/api/collections', body, token);
    if (res.status >= 400) {
      console.log(`FAILED: ${def.name}`);
      console.log(`  Status: ${res.status}`);
      console.log(`  Data: ${JSON.stringify(res.data).substring(0, 500)}`);
      console.log(`  Body sent: ${JSON.stringify({name: def.name, type: def.type, schema_count: def.schema.length})}`);
    } else {
      console.log(`OK: ${def.name} [${def.type}] (${def.schema.length} fields)`);
    }
  }
}

main().catch(console.error);
