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
  // Get admin token
  const authRes = await httpReq('POST', '/api/admins/auth-with-password', {
    identity: 'admin@scrivia.local', password: 'Admin123456!'
  });
  const token = authRes.data.token;

  // Check dbf_sync_sessions schema
  const cols = await httpReq('GET', '/api/collections/dbf_sync_sessions', null, token);
  console.log('Schema:', JSON.stringify(cols.data.schema.map(f => ({ name: f.name, type: f.type, required: f.required })), null, 2));

  // Try to insert exactly what the sync engine sends
  const testInsert = {
    session_label: 'Import ' + new Date().toLocaleString('en-PH'),
    files_uploaded: JSON.stringify(['test1.DBF', 'test2.DBF']),
    status: 'running',
    performed_by: 'adonaimagno@gmail.com',
    user_id: null,
    category: null,
  };
  console.log('\nInsert payload:', JSON.stringify(testInsert, null, 2));
  
  const insertRes = await httpReq('POST', '/api/collections/dbf_sync_sessions/records', testInsert, token);
  console.log('\nInsert status:', insertRes.status);
  if (insertRes.status >= 400) {
    console.log('Insert error:', JSON.stringify(insertRes.data, null, 2));
  } else {
    console.log('Insert OK, id:', insertRes.data.id);
    // cleanup
    await httpReq('DELETE', `/api/collections/dbf_sync_sessions/records/${insertRes.data.id}`, null, token);
  }

  // Also try with a real user_id (get from profiles)
  const users = await httpReq('GET', '/api/collections/profiles/records?perPage=5', null, token);
  if (users.data.items.length > 0) {
    const uid = users.data.items[0].id;
    console.log('\nTrying with user_id:', uid);
    const insertRes2 = await httpReq('POST', '/api/collections/dbf_sync_sessions/records', {
      ...testInsert,
      user_id: uid,
    }, token);
    console.log('Status:', insertRes2.status);
    if (insertRes2.status >= 400) {
      console.log('Error:', JSON.stringify(insertRes2.data, null, 2));
    } else {
      console.log('OK, id:', insertRes2.data.id);
      await httpReq('DELETE', `/api/collections/dbf_sync_sessions/records/${insertRes2.data.id}`, null, token);
    }
  }
}

main().catch(console.error);
