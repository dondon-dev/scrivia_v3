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
  return { name, type: 'json', required: required || false, options: { maxSize: 0 } };
}

async function main() {
  const authRes = await httpReq('POST', '/api/admins/auth-with-password', {
    identity: 'admin@scrivia.local', password: 'Admin123456!'
  });
  const token = authRes.data.token;

  const collections = [
    {
      name: 'audit_logs', type: 'base',
      schema: [
        { name: 'user_id', type: 'text', required: false, options: {} },
        { name: 'action', type: 'text', required: true, options: {} },
        { name: 'table_name', type: 'text', required: false, options: {} },
        { name: 'record_id', type: 'text', required: false, options: {} },
        jsonField('old_data'),
        jsonField('new_data'),
        { name: 'ip_address', type: 'text', required: false, options: {} },
        { name: 'user_agent', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'dashboard_stats_cache', type: 'base',
      schema: [
        { name: 'total_employees', type: 'number', required: false, options: {} },
        { name: 'total_monthly_payroll', type: 'number', required: false, options: {} },
        { name: 'pending_approvals', type: 'number', required: false, options: {} },
        { name: 'active_loans', type: 'number', required: false, options: {} },
        jsonField('group_stats'),
        jsonField('ded_totals_by_code'),
        jsonField('recent_employees'),
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
        jsonField('error_data'),
      ]
    },
    {
      name: 'security_settings', type: 'base',
      schema: [
        { name: 'setting_key', type: 'text', required: true, options: {} },
        jsonField('setting_value'),
        { name: 'description', type: 'text', required: false, options: {} },
        { name: 'updated_by', type: 'text', required: false, options: {} },
      ]
    },
  ];

  for (const def of collections) {
    const body = {
      name: def.name, type: def.type, system: false,
      schema: def.schema,
      listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
    };
    const res = await httpReq('POST', '/api/collections', body, token);
    if (res.status >= 400) {
      console.log(`FAILED: ${def.name} - ${JSON.stringify(res.data).substring(0, 300)}`);
    } else {
      console.log(`OK: ${def.name} (${def.schema.length} fields)`);
    }
  }
}

main().catch(console.error);
