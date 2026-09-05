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

  // Get current schema
  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  const syncCol = cols.data.items.find(c => c.name === 'dbf_sync_sessions');
  console.log('Current fields:', syncCol.schema.map(f => `${f.name}${f.required ? '*' : ''}`).join(', '));

  // New schema matching what the frontend code actually sends
  const newSchema = [
    { name: 'session_id', type: 'text', required: false, options: {} },
    { name: 'session_label', type: 'text', required: false, options: {} },
    { name: 'status', type: 'text', required: false, options: {} },
    { name: 'files_uploaded', type: 'text', required: false, options: {} },
    { name: 'error_log', type: 'text', required: false, options: {} },
    { name: 'per_file', type: 'text', required: false, options: {} },
    { name: 'performed_by', type: 'text', required: false, options: {} },
    { name: 'user_id', type: 'text', required: false, options: {} },
    jsonField('category'),
    { name: 'regcode', type: 'text', required: false, options: {} },
    { name: 'divcode', type: 'text', required: false, options: {} },
    { name: 'created_at', type: 'text', required: false, options: {} },
    { name: 'completed_at', type: 'text', required: false, options: {} },
    { name: 'started_by', type: 'text', required: false, options: {} },
  ];

  const patchRes = await httpReq('PATCH', `/api/collections/${syncCol.id}`, {
    schema: newSchema,
  }, token);

  if (patchRes.status < 400) {
    console.log('Updated fields:', patchRes.data.schema.map(f => `${f.name}${f.required ? '*' : ''}`).join(', '));
  } else {
    console.log('FAILED:', JSON.stringify(patchRes.data).substring(0, 300));
    return;
  }

  // Now test the insert
  console.log('\n--- Testing insert ---');
  const testRes = await httpReq('POST', `/api/collections/dbf_sync_sessions/records`, {
    session_label: 'Import ' + new Date().toLocaleString('en-PH'),
    files_uploaded: JSON.stringify(['test.DBF']),
    status: 'running',
    performed_by: 'adonaimagno@gmail.com',
    user_id: null,
    category: null,
  }, token);

  if (testRes.status < 400) {
    console.log('Insert OK, id:', testRes.data.id);
    // Clean up
    await httpReq('DELETE', `/api/collections/dbf_sync_sessions/records/${testRes.data.id}`, null, token);
    console.log('Cleaned up test record');
  } else {
    console.log('Insert FAILED:', JSON.stringify(testRes.data));
  }
}

main().catch(console.error);
