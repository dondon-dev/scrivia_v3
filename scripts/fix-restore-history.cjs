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

  // Check what syncEngine sends to dbf_restore_history
  // The sync engine writes: session_id, table_name, records_inserted, records_updated, records_skipped, records_duplicates, errors, duration_ms
  // Also check what the loadSyncSessions function reads from dbf_sync_sessions

  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  
  // Fix dbf_restore_history
  const histCol = cols.data.items.find(c => c.name === 'dbf_restore_history');
  if (histCol) {
    console.log('dbf_restore_history current:', histCol.schema.map(f => `${f.name}${f.required ? '*' : ''}`).join(', '));
    
    const histSchema = [
      { name: 'session_id', type: 'text', required: false, options: {} },
      { name: 'table_name', type: 'text', required: false, options: {} },
      { name: 'records_inserted', type: 'number', required: false, options: {} },
      { name: 'records_updated', type: 'number', required: false, options: {} },
      { name: 'records_skipped', type: 'number', required: false, options: {} },
      { name: 'records_duplicates', type: 'number', required: false, options: {} },
      jsonField('errors'),
      { name: 'duration_ms', type: 'number', required: false, options: {} },
      { name: 'filename', type: 'text', required: false, options: {} },
      { name: 'status', type: 'text', required: false, options: {} },
      { name: 'restored_by', type: 'text', required: false, options: {} },
      { name: 'restored_at', type: 'text', required: false, options: {} },
    ];
    
    const res = await httpReq('PATCH', `/api/collections/${histCol.id}`, { schema: histSchema }, token);
    if (res.status < 400) {
      console.log('Updated:', res.data.schema.map(f => f.name).join(', '));
    } else {
      console.log('FAILED:', JSON.stringify(res.data).substring(0, 300));
    }
  }

  // Also check gsIS/pli import logs since they're referenced in the dashboard
  for (const name of ['gsis_import_logs', 'pli_import_logs']) {
    const col = cols.data.items.find(c => c.name === name);
    if (col) {
      console.log(`\n${name} current:`, col.schema.map(f => f.name).join(', '));
    }
  }
}

main().catch(console.error);
