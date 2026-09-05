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

  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);

  // Fix audit_logs - needs user_email, record_type, created_at
  const auditCol = cols.data.items.find(c => c.name === 'audit_logs');
  if (auditCol) {
    console.log('audit_logs current:', auditCol.schema.map(f => f.name).join(', '));
    const newSchema = [
      { name: 'user_id', type: 'text', required: false, options: {} },
      { name: 'user_email', type: 'text', required: false, options: {} },
      { name: 'action', type: 'text', required: false, options: {} },
      { name: 'table_name', type: 'text', required: false, options: {} },
      { name: 'record_type', type: 'text', required: false, options: {} },
      { name: 'record_id', type: 'text', required: false, options: {} },
      jsonField('old_data'),
      jsonField('new_data'),
      { name: 'ip_address', type: 'text', required: false, options: {} },
      { name: 'user_agent', type: 'text', required: false, options: {} },
      { name: 'created_at', type: 'text', required: false, options: {} },
    ];
    const res = await httpReq('PATCH', `/api/collections/${auditCol.id}`, { schema: newSchema }, token);
    if (res.status < 400) {
      console.log('audit_logs updated:', res.data.schema.map(f => f.name).join(', '));
    } else {
      console.log('FAILED:', JSON.stringify(res.data).substring(0, 200));
    }
  }

  // Fix gsis_import_logs - add new_deductions if missing
  const gsisCol = cols.data.items.find(c => c.name === 'gsis_import_logs');
  if (gsisCol) {
    const hasField = (name) => gsisCol.schema.some(f => f.name === name);
    const needs = ['new_deductions', 'updated_deductions', 'failed_records'].filter(n => !hasField(n));
    if (needs.length > 0) {
      console.log(`gsis_import_logs missing: ${needs.join(', ')}`);
      const newSchema = [...gsisCol.schema, ...needs.map(n => ({ name: n, type: 'number', required: false, options: {} }))];
      await httpReq('PATCH', `/api/collections/${gsisCol.id}`, { schema: newSchema }, token);
    } else {
      console.log('gsis_import_logs: all fields present');
    }
  }

  // Fix pli_import_logs 
  const pliCol = cols.data.items.find(c => c.name === 'pli_import_logs');
  if (pliCol) {
    const hasField = (name) => pliCol.schema.some(f => f.name === name);
    const needs = ['new_deductions', 'updated_deductions', 'terminated_deductions', 'failed_records'].filter(n => !hasField(n));
    if (needs.length > 0) {
      console.log(`pli_import_logs missing: ${needs.join(', ')}`);
      const newSchema = [...pliCol.schema, ...needs.map(n => ({ name: n, type: 'number', required: false, options: {} }))];
      await httpReq('PATCH', `/api/collections/${pliCol.id}`, { schema: newSchema }, token);
    } else {
      console.log('pli_import_logs: all fields present');
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
