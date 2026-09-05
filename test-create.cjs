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
  // Get token
  const authRes = await httpReq('POST', '/api/admins/auth-with-password', {
    identity: 'admin@scrivia.local', password: 'Admin123456!'
  });
  const token = authRes.data.token;
  console.log('Got token');

  // Delete existing test collection if any
  try {
    const existing = await httpReq('GET', '/api/collections/test_collection', null, token);
    if (existing.status === 200) {
      await httpReq('DELETE', `/api/collections/${existing.data.id}`, null, token);
      console.log('Deleted existing test_collection');
    }
  } catch(e) {}

  // Try creating with schema (old format)
  const body = {
    name: 'test_collection',
    type: 'base',
    system: false,
    schema: [
      { name: 'first_name', type: 'text', required: true, options: {} },
      { name: 'age', type: 'number', required: false, options: {} },
      { name: 'email', type: 'text', required: true, options: {} },
    ],
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  };

  console.log('\n--- Creating with schema array ---');
  console.log('Request body schema:', JSON.stringify(body.schema));
  const createRes = await httpReq('POST', '/api/collections', body, token);
  console.log('Status:', createRes.status);
  
  if (createRes.status < 400) {
    console.log('Response fields:', JSON.stringify(createRes.data.fields));
    console.log('Response schema:', JSON.stringify(createRes.data.schema));
    console.log('Full response keys:', Object.keys(createRes.data));
  } else {
    console.log('Error:', JSON.stringify(createRes.data));
  }

  // Try PATCH to add fields after creation
  if (createRes.status < 400 && createRes.data.id) {
    console.log('\n--- Try adding fields via PATCH ---');
    const patchBody = {
      schema: [
        { name: 'first_name', type: 'text', required: true, options: {} },
        { name: 'age', type: 'number', required: false, options: {} },
        { name: 'email', type: 'text', required: true, options: {} },
      ]
    };
    const patchRes = await httpReq('PATCH', `/api/collections/${createRes.data.id}`, patchBody, token);
    console.log('PATCH status:', patchRes.status);
    if (patchRes.status < 400) {
      console.log('After PATCH fields:', JSON.stringify(patchRes.data.fields));
    } else {
      console.log('PATCH error:', JSON.stringify(patchRes.data));
    }
  }

  // Cleanup
  try {
    if (createRes.data?.id) {
      await httpReq('DELETE', `/api/collections/${createRes.data.id}`, null, token);
      console.log('\nCleaned up test_collection');
    }
  } catch(e) {}
}

main().catch(console.error);
