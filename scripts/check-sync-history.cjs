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

  // Check sync sessions
  const sessions = await httpReq('GET', '/api/collections/dbf_sync_sessions/records?perPage=12&sort=-created', null, token);
  console.log(`Sync sessions: ${sessions.data.totalItems}\n`);
  
  for (const s of sessions.data.items) {
    console.log(`Session: ${s.id} | ${s.session_label || s.session_id || 'N/A'}`);
    console.log(`  Status: ${s.status} | Performed by: ${s.performed_by || 'N/A'}`);
    if (s.files_uploaded) {
      try {
        const files = JSON.parse(s.files_uploaded);
        console.log(`  Files: ${Array.isArray(files) ? files.join(', ') : s.files_uploaded}`);
      } catch {
        console.log(`  Files: ${s.files_uploaded}`);
      }
    }
    if (s.error_log) {
      try {
        const errors = JSON.parse(s.error_log);
        if (Array.isArray(errors) && errors.length > 0) {
          console.log(`  Errors (${errors.length}):`);
          errors.slice(0, 5).forEach(e => console.log(`    - ${typeof e === 'string' ? e : JSON.stringify(e).substring(0, 150)}`));
        }
      } catch {
        console.log(`  Error log: ${s.error_log.substring(0, 200)}`);
      }
    }
    if (s.per_file) {
      try {
        const perFile = typeof s.per_file === 'string' ? JSON.parse(s.per_file) : s.per_file;
        if (typeof perFile === 'object') {
          for (const [name, data] of Object.entries(perFile)) {
            console.log(`  ${name}: inserted=${data.inserted || 0} updated=${data.updated || 0} errors=${(data.errors || []).length}`);
            if (data.errors && data.errors.length > 0) {
              data.errors.slice(0, 3).forEach(e => console.log(`    ERR: ${typeof e === 'string' ? e.substring(0, 150) : JSON.stringify(e).substring(0, 150)}`));
            }
          }
        }
      } catch {
        console.log(`  Per-file: ${JSON.stringify(s.per_file).substring(0, 200)}`);
      }
    }
    console.log('');
  }
}

main().catch(console.error);
