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

  // Try different maxSize values for JSON
  const tests = [0, 1, 100, 500000, 2097152];
  for (const ms of tests) {
    const body = {
      name: `test_json_${ms}`, type: 'base', system: false,
      schema: [
        { name: 'data', type: 'json', required: false, options: { maxSize: ms } },
      ],
      listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
    };
    const res = await httpReq('POST', '/api/collections', body, token);
    if (res.status < 400) {
      console.log(`maxSize=${ms}: OK`);
      // cleanup
      await httpReq('DELETE', `/api/collections/${res.data.id}`, null, token);
    } else {
      console.log(`maxSize=${ms}: FAILED - ${JSON.stringify(res.data).substring(0, 200)}`);
    }
  }
}

main().catch(console.error);
