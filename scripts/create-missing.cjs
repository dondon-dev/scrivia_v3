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

  // Missing collections from the backup that failed
  const missing = [
    {
      name: 'profiles', type: 'auth',
      schema: [
        { name: 'email', type: 'text', required: true, options: {} },
        { name: 'name', type: 'text', required: false, options: {} },
        { name: 'role', type: 'text', required: false, options: {} },
        { name: 'status', type: 'text', required: false, options: {} },
        { name: 'avatar_url', type: 'text', required: false, options: {} },
        { name: 'division_id', type: 'text', required: false, options: {} },
        { name: 'region_id', type: 'text', required: false, options: {} },
        { name: 'school_id', type: 'text', required: false, options: {} },
        { name: 'last_login', type: 'text', required: false, options: {} },
        { name: 'created_at', type: 'text', required: false, options: {} },
        { name: 'updated_at', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'divisions', type: 'base',
      schema: [
        { name: 'division_code', type: 'text', required: true, options: {} },
        { name: 'division_name', type: 'text', required: true, options: {} },
        { name: 'region_code', type: 'text', required: false, options: {} },
        { name: 'region_name', type: 'text', required: false, options: {} },
        { name: 'sort_order', type: 'number', required: false, options: {} },
        { name: 'is_active', type: 'bool', required: false, options: {} },
        { name: 'created_at', type: 'text', required: false, options: {} },
        { name: 'updated_at', type: 'text', required: false, options: {} },
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
        { name: 'user_agent', type: 'text', required: false, options: {} },
        { name: 'created_at', type: 'text', required: false, options: {} },
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
        { name: 'updated_at', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'dbf_restore_history', type: 'base',
      schema: [
        { name: 'table_name', type: 'text', required: true, options: {} },
        { name: 'record_count', type: 'number', required: false, options: {} },
        { name: 'restored_by', type: 'text', required: false, options: {} },
        { name: 'restored_at', type: 'text', required: false, options: {} },
        { name: 'filename', type: 'text', required: false, options: {} },
        { name: 'status', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'dbf_sync_sessions', type: 'base',
      schema: [
        { name: 'session_id', type: 'text', required: true, options: {} },
        { name: 'status', type: 'text', required: false, options: {} },
        { name: 'files_uploaded', type: 'text', required: false, options: {} },
        { name: 'error_log', type: 'text', required: false, options: {} },
        { name: 'per_file', type: 'text', required: false, options: {} },
        { name: 'regcode', type: 'text', required: false, options: {} },
        { name: 'divcode', type: 'text', required: false, options: {} },
        { name: 'created_at', type: 'text', required: false, options: {} },
        { name: 'completed_at', type: 'text', required: false, options: {} },
        { name: 'started_by', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'ips_audit_logs', type: 'base',
      schema: [
        { name: 'action', type: 'text', required: true, options: {} },
        { name: 'user_id', type: 'text', required: false, options: {} },
        { name: 'detail', type: 'text', required: false, options: {} },
        { name: 'created_at', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'plantilla_headers', type: 'base',
      schema: [
        { name: 'plantilla_no', type: 'text', required: true, options: {} },
        { name: 'plantilla_date', type: 'text', required: false, options: {} },
        { name: 'division', type: 'text', required: false, options: {} },
        { name: 'school', type: 'text', required: false, options: {} },
        { name: 'status', type: 'text', required: false, options: {} },
        { name: 'uploaded_by', type: 'text', required: false, options: {} },
        { name: 'created_at', type: 'text', required: false, options: {} },
        { name: 'updated_at', type: 'text', required: false, options: {} },
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
        { name: 'errors', type: 'json', required: false, options: {} },
        { name: 'created_at', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'plantilla_positions', type: 'base',
      schema: [
        { name: 'header_id', type: 'text', required: false, options: {} },
        { name: 'position_code', type: 'text', required: true, options: {} },
        { name: 'position_title', type: 'text', required: false, options: {} },
        { name: 'salary_grade', type: 'text', required: false, options: {} },
        { name: 'step', type: 'number', required: false, options: {} },
        { name: 'monthly_salary', type: 'number', required: false, options: {} },
        { name: 'annual_salary', type: 'number', required: false, options: {} },
        { name: 'employee_name', type: 'text', required: false, options: {} },
        { name: 'employee_no', type: 'text', required: false, options: {} },
        { name: 'status', type: 'text', required: false, options: {} },
        { name: 'created_at', type: 'text', required: false, options: {} },
        { name: 'updated_at', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'security_settings', type: 'base',
      schema: [
        { name: 'setting_key', type: 'text', required: true, options: {} },
        { name: 'setting_value', type: 'json', required: false, options: {} },
        { name: 'description', type: 'text', required: false, options: {} },
        { name: 'updated_by', type: 'text', required: false, options: {} },
        { name: 'updated_at', type: 'text', required: false, options: {} },
      ]
    },
    {
      name: 'notifications', type: 'base',
      schema: [
        { name: 'user_id', type: 'text', required: false, options: {} },
        { name: 'title', type: 'text', required: true, options: {} },
        { name: 'message', type: 'text', required: false, options: {} },
        { name: 'type', type: 'text', required: false, options: {} },
        { name: 'read', type: 'bool', required: false, options: {} },
        { name: 'created_at', type: 'text', required: false, options: {} },
      ]
    },
  ];

  for (const def of missing) {
    const body = {
      name: def.name,
      type: def.type,
      system: false,
      schema: def.schema,
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    };
    const res = await httpReq('POST', '/api/collections', body, token);
    if (res.status >= 400) {
      console.log(`ERROR: ${def.name} - ${res.data?.message || JSON.stringify(res.data).substring(0, 200)}`);
    } else {
      console.log(`CREATED: ${def.name} [${def.type}] (${def.schema.length} fields)`);
    }
  }

  // Verify all collections
  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  console.log(`\nTotal collections: ${cols.data.totalItems}`);
  for (const c of cols.data.items.sort((a,b) => a.name.localeCompare(b.name))) {
    const schema = c.schema || [];
    console.log(`  ${c.name} [${c.type}] schema=${schema.length}`);
  }
}

main().catch(console.error);
