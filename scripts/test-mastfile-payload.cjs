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

  // Simulate exact syncMastfile payload with null values
  console.log('=== Test: Create employee with syncMastfile-like payload ===');
  const payload = {
    empno: 'TESTMAST001',
    fname: 'JUAN',
    mi: 'A',
    lname: 'DELA CRUZ',
    appel: 'MR',
    empname: 'DELA CRUZ, JUAN A.',
    regcode: '04A',
    divcode: '252',
    division_id: null,
    stacode: '001',
    account: '1234567890',
    poscode: 'T-I',
    paymode: 'ATM',
    grade: 18,
    step: 3,
    basic: 45000,
    trans: 2000,
    pera: 2000,
    aca: 0,
    rata: 0,
    ontop: 0,
    long: 0,
    clothing: 0,
    cashallow: 0,
    dedlnr: 0,
    dedmed: 0,
    dedtax: 0,
    dedpag: 0,
    netpay: 41000,
    govtlnr: 0,
    govtecc: 0,
    govtmed: 0,
    govtpag: 0,
    pagcode: '',
    taxcode: 'ME1',
    civilstat: 'M',
    attend: '',
    status: 'Active',
    sex: 'M',
    tin: '',
    gsis_pn: '',
    gsis_id: '',
    hdmf_id: '',
    phic_id: '',
    banker: '',
    pib: '',
    birthdate: null,
    update: null,
    paydate: null,
    hiredate: null,
    mid_bonus: 0,
    mid_cash: 0,
    end_bonus: 0,
    end_cash: 0,
    add_bonus: 0,
    taxref: 0,
    special: 0,
    over_wheld: 0,
    exposcode: '',
    exgrade: 0,
    exstep: 0,
    exbasic: 0,
    exlnr: 0,
    exmed: 0,
    expag: 0,
    extax: 0,
    exglnr: 0,
    exgmed: 0,
    exgpag: 0,
    exgecc: 0,
    saldiff: 0,
    lnrdiff: 0,
    meddiff: 0,
    pagdiff: 0,
    taxdiff: 0,
    glnrdiff: 0,
    gmeddiff: 0,
    gpagdiff: 0,
    geccdiff: 0,
    updcode: '',
    editor: '',
    depname1: '',
    depname2: '',
    depname3: '',
    depname4: '',
    depdate1: null,
    depdate2: null,
    depdate3: null,
    depdate4: null,
    distcode: '',
    payroll_group_id: null,
    employee_number: 'TESTMAST001',
    first_name: 'JUAN',
    last_name: 'DELA CRUZ',
    middle_name: 'A',
    position: 'T-I',
    bank_name: '',
    bank_account: '1234567890',
    basic_salary: 45000,
    tax_status: 'ME1',
    philhealth_number: '',
    pagibig_number: '',
    hire_date: null,
    updated_at: new Date().toISOString(),
  };

  const res = await httpReq('POST', '/api/collections/employees/records', payload, token);
  console.log('Status:', res.status);
  if (res.status >= 400) {
    console.log('ERROR:', JSON.stringify(res.data, null, 2));
  } else {
    console.log('SUCCESS, id:', res.data.id);
    // Cleanup
    await httpReq('DELETE', `/api/collections/employees/records/${res.data.id}`, null, token);
    console.log('Cleaned up');
  }

  // Also test: what happens with division_id as empty string vs null
  console.log('\n=== Test: division_id as empty string ===');
  const payload2 = { ...payload, empno: 'TESTMAST002', employee_number: 'TESTMAST002', division_id: '' };
  const res2 = await httpReq('POST', '/api/collections/employees/records', payload2, token);
  console.log('Status:', res2.status);
  if (res2.status >= 400) {
    console.log('ERROR:', JSON.stringify(res2.data, null, 2));
  } else {
    console.log('SUCCESS, id:', res2.data.id);
    await httpReq('DELETE', `/api/collections/employees/records/${res2.data.id}`, null, token);
  }
}

main().catch(console.error);
