#!/usr/bin/env node
const fs = require('fs');
const http = require('http');

const BACKUP = 'C:/Backups/supabase_backup_2026-Tue 09-01_ 0-13.sql';
const PB = 'http://localhost:8090';

const PG_TO_PB = {
  'uuid': 'text', 'text': 'text', 'character varying': 'text', 'varchar': 'text',
  'boolean': 'bool', 'integer': 'number', 'int': 'number', 'bigint': 'number',
  'smallint': 'number', 'numeric': 'number', 'decimal': 'number', 'real': 'number',
  'money': 'number', 'double precision': 'number',
  'date': 'text', 'time': 'text', 'timetz': 'text',
  'timestamp': 'text', 'timestamptz': 'text',
  'timestamp with time zone': 'text', 'timestamp without time zone': 'text',
  // Map json/jsonb to text - PocketBase requires maxSize on json
  'json': 'text', 'jsonb': 'text',
  'bytea': 'text', 'oid': 'number',
};

const RESERVED = new Set(['id', 'created', 'updated', 'collectionId', 'collectionName']);

function httpReq(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, PB);
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = token;
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const tables = ['dashboard_stats_cache', 'dbf_restore_history', 'dbf_sync_sessions', 'ips_audit_logs'];
  const content = fs.readFileSync(BACKUP, 'utf8');

  const loginRes = await httpReq('POST', '/api/admins/auth-with-password', { identity: 'admin@scrivia.local', password: 'Admin123456!' });
  const token = loginRes.data.token;

  for (const tableName of tables) {
    const searchStr = 'CREATE TABLE public.' + tableName + ' (';
    const idx = content.indexOf(searchStr);
    if (idx === -1) { console.log(tableName + ': NOT FOUND'); continue; }

    let depth = 1, i = idx + searchStr.length;
    while (i < content.length && depth > 0) {
      if (content[i] === '(') depth++;
      else if (content[i] === ')') depth--;
      i++;
    }
    const body = content.substring(idx + searchStr.length, i - 1);

    const items = [];
    let cur = '', d = 0;
    for (const ch of body) {
      if (ch === '(') { d++; cur += ch; }
      else if (ch === ')') { d--; cur += ch; }
      else if (ch === ',' && d === 0) { items.push(cur); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) items.push(cur);

    const columns = [];
    for (const item of items) {
      const t = item.trim();
      if (!t || /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|EXCLUDE|FOREIGN|CREATE |INDEX |ENABLE |ALTER |USING |WITH |GRANT|NOT |--)/i.test(t)) continue;
      const m = t.match(/^"?(\w+)"?\s+(.+)/);
      if (!m) continue;
      const colName = m[1];
      const typeDef = m[2].trim();
      if (colName.toLowerCase() === 'id') continue;

      let colType = typeDef.split(/\s+DEFAULT\b/i)[0].split(/\s+NOT\s+NULL\b/i)[0]
        .split(/\s+NULL\b/i)[0].split(/\s+PRIMARY\b/i)[0].split(/\s+REFERENCES\b/i)[0]
        .split(/\s+UNIQUE\b/i)[0].trim().replace(/\(\d+(?:,\s*\d+)?\)/, '');
      const pbType = PG_TO_PB[colType.toLowerCase()] || 'text';

      columns.push({
        name: colName,
        type: pbType,
        required: /\bNOT\s+NULL\b/i.test(typeDef) && !/\bDEFAULT\b/i.test(typeDef),
        options: pbType === 'text' ? { maxSize: 500 } : {},
      });
    }

    const nameCount = {};
    const safeColumns = columns.map(c => {
      let name = c.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 60);
      if (RESERVED.has(name)) name = 'col_' + name;
      if (nameCount[name] !== undefined) { nameCount[name]++; name = name + '_' + nameCount[name]; }
      else nameCount[name] = 0;
      return { ...c, name };
    }).slice(0, 400);

    console.log('Creating ' + tableName + ' (' + safeColumns.length + ' cols)...');
    const createRes = await httpReq('POST', '/api/collections', {
      name: tableName, type: 'base', system: false, schema: safeColumns,
      listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
    }, token);

    if (createRes.status >= 400) {
      console.log('  ERROR: ' + JSON.stringify(createRes.data).substring(0, 500));
    } else {
      console.log('  OK');
    }
  }

  // Also recreate the 4 that also failed from first run: dbf_restore_history etc are done above
  // But let's also check the original 8 that were missing from the main create-all-tables run
  // They should already exist from the second run except these 4
  const colRes = await httpReq('GET', '/api/collections?perPage=500', null, token);
  const names = colRes.data.items.map(c => c.name).sort();
  console.log('\nTotal collections: ' + names.length);

  // Check the missing ones
  const allExpected = ['dashboard_stats_cache', 'dbf_restore_history', 'dbf_sync_sessions', 'ips_audit_logs',
    'plantilla_headers', 'plantilla_import_logs', 'plantilla_positions', 'security_settings'];
  for (const t of allExpected) {
    console.log('  ' + t + ': ' + (names.includes(t) ? 'OK' : 'MISSING'));
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
