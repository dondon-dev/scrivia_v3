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

  // Get profiles collection details
  const cols = await httpReq('GET', '/api/collections?perPage=500', null, token);
  const profiles = cols.data.items.find(c => c.name === 'profiles');
  console.log('profiles id:', profiles.id);
  console.log('profiles options:', JSON.stringify(profiles.options));

  // Try different PATCH body formats
  console.log('\n--- Trying options update ---');
  
  // Format 1: options as nested object
  const patchRes = await httpReq('PATCH', `/api/collections/${profiles.id}`, {
    options: {
      allowEmailAuth: true,
      minPasswordLength: 8,
      onlyVerified: false,
    }
  }, token);
  console.log('Format 1 status:', patchRes.status);
  console.log('Format 1 data:', JSON.stringify(patchRes.data).substring(0, 500));

  // Try format 2
  console.log('\n--- Trying full PATCH ---');
  const patchRes2 = await httpReq('PATCH', `/api/collections/${profiles.id}`, {
    name: 'profiles',
    type: 'auth',
    system: false,
    options: {
      allowEmailAuth: true,
      allowOAuth2Auth: false,
      allowUsernameAuth: false,
      minPasswordLength: 8,
      onlyVerified: false,
    }
  }, token);
  console.log('Format 2 status:', patchRes2.status);

  // Now try login
  console.log('\n--- Trying login ---');
  const loginRes = await httpReq('POST', `/api/collections/profiles/auth-with-password`, {
    identity: 'adonaimagno@gmail.com',
    password: 'Admin123!@#',
  });
  console.log('Login status:', loginRes.status);
  if (loginRes.status >= 400) {
    console.log('Login error:', JSON.stringify(loginRes.data));
  } else {
    console.log('LOGIN OK');
  }
}

main().catch(console.error);
