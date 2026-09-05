#!/usr/bin/env node
/**
 * recreate-collections.cjs
 * 
 * 1. Deletes all non-system PocketBase collections that have 0 fields
 * 2. Recreates them with proper fields from the SQL backup
 */

const fs = require('fs');
const http = require('http');

const PB_BASE = 'http://localhost:8090';
const ADMIN_EMAIL = 'admin@scrivia.local';
const ADMIN_PASSWORD = 'Admin123456!';
const BACKUP_PATH = 'C:/Backups/supabase_backup_2026-Tue 09-01_ 0-13.sql';

const PG_TO_PB = {
  'uuid': 'text', 'text': 'text', 'character varying': 'text', 'varchar': 'text', 'char': 'text',
  'boolean': 'bool', 'bool': 'bool',
  'integer': 'number', 'int': 'number', 'int2': 'number', 'int4': 'number', 'int8': 'number',
  'bigint': 'number', 'smallint': 'number', 'numeric': 'number', 'decimal': 'number',
  'real': 'number', 'float4': 'number', 'float8': 'number', 'double precision': 'number',
  'money': 'number',
  'date': 'text', 'time': 'text', 'timetz': 'text',
  'timestamp': 'text', 'timestamptz': 'text',
  'timestamp with time zone': 'text', 'timestamp without time zone': 'text',
  'json': 'json', 'jsonb': 'json', 'bytea': 'text', 'oid': 'number',
};

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
        catch { resolve({ status: res.statusCode, data, error: 'Parse error' }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getToken() {
  const res = await httpReq('POST', '/api/admins/auth-with-password', {
    identity: ADMIN_EMAIL, password: ADMIN_PASSWORD,
  });
  return res.data.token;
}

async function listCollections(token) {
  const res = await httpReq('GET', '/api/collections?perPage=500', null, token);
  return res.data.items || [];
}

async function deleteCollection(token, id) {
  return httpReq('DELETE', `/api/collections/${id}`, null, token);
}

async function createCollection(token, name, fields, type) {
  const body = {
    name, type: type || 'base', system: false, schema: fields,
    listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
  };
  return httpReq('POST', '/api/collections', body, token);
}

function extractTablesFromBackup(backupPath) {
  console.log('Reading backup file...');
  const content = fs.readFileSync(backupPath, 'utf8');
  console.log(`File size: ${(content.length / 1024 / 1024).toFixed(1)} MB`);

  const tables = {};
  const lines = content.split(/\r?\n/);
  
  let inTable = false;
  let currentTable = '';
  let currentBody = '';
  let depth = 0;

  for (const line of lines) {
    if (!inTable) {
      const m = line.match(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)\s*\(/i);
      if (m) {
        inTable = true;
        currentTable = m[1];
        currentBody = '';
        depth = 1;
        const afterOpen = line.substring(line.indexOf('(') + 1);
        currentBody += afterOpen + '\n';
      }
    } else {
      for (const ch of line) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
      }
      currentBody += line + '\n';
      
      if (depth <= 0) {
        inTable = false;
        const columns = parseColumns(currentBody);
        if (columns.length > 0) {
          tables[currentTable] = columns;
        }
        currentTable = '';
        currentBody = '';
      }
    }
  }
  return tables;
}

function parseColumns(body) {
  const columns = [];
  const items = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') { depth++; current += ch; }
    else if (ch === ')') { depth--; current += ch; }
    else if (ch === ',' && depth === 0) {
      items.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(current);

  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|EXCLUDE|FOREIGN KEY|CREATE |INDEX |ENABLE |ALTER |USING |WITH |GRANT|NOT VALID|--)/i.test(trimmed)) continue;

    const m = trimmed.match(/^"?(\w+)"?\s+(.+)/);
    if (!m) continue;

    const colName = m[1];
    const typeDef = m[2].trim();
    const colType = extractTypeName(typeDef);
    const pbType = PG_TO_PB[colType.toLowerCase()] || 'text';

    if (colName === 'id' && colType === 'uuid') continue;

    columns.push({
      name: colName,
      type: pbType,
      required: /\bNOT\s+NULL\b/i.test(typeDef) && !/\bDEFAULT\b/i.test(typeDef),
      options: {},
    });
  }
  return columns;
}

function extractTypeName(typeDef) {
  return typeDef
    .split(/\s+DEFAULT\b/i)[0]
    .split(/\s+NOT\s+NULL\b/i)[0]
    .split(/\s+NULL\b/i)[0]
    .split(/\s+PRIMARY\b/i)[0]
    .split(/\s+REFERENCES\b/i)[0]
    .split(/\s+UNIQUE\b/i)[0]
    .split(/,\s*$/)[0]
    .trim()
    .replace(/\(\d+(?:,\s*\d+)?\)/, '');
}

// PocketBase system collections and app-managed auth
const PB_SYSTEM = new Set(['_mfa', '_otps', '_externalAuths', '_authOrigins', '_superusers']);

// Auth collections that need special handling (create as auth type)
const AUTH_COLLECTIONS = ['profiles'];

// Collections that already exist in PocketBase and should NOT be deleted
const PB_MANAGED = new Set(['users']);

async function main() {
  console.log('=== RECREATE COLLECTIONS WITH FIELDS ===\n');

  // 1. Extract table schemas from backup
  const tables = extractTablesFromBackup(BACKUP_PATH);
  console.log(`\nFound ${Object.keys(tables).length} tables in backup\n`);

  // 2. Get admin token
  const token = await getToken();

  // 3. List existing collections
  const existing = await listCollections(token);
  console.log(`Existing collections: ${existing.length}\n`);

  // 4. Delete all empty non-system collections
  console.log('--- Deleting empty collections ---');
  let deleted = 0;
  for (const col of existing) {
    if (PB_SYSTEM.has(col.name) || PB_MANAGED.has(col.name)) {
      continue; // Skip PocketBase system + managed collections
    }
    if (col.fields && col.fields.length > 0) {
      console.log(`  SKIP (has ${col.fields.length} fields): ${col.name}`);
      continue;
    }
    const res = await deleteCollection(token, col.id);
    if (res.status < 400) {
      console.log(`  DELETED: ${col.name}`);
      deleted++;
    } else {
      console.log(`  FAILED to delete ${col.name}: ${res.data?.message || 'unknown'}`);
    }
  }
  console.log(`\nDeleted ${deleted} empty collections\n`);

  // 5. Create collections from backup with fields
  console.log('--- Creating collections with fields ---');
  const fresh = await listCollections(token);
  const existingNames = new Set(fresh.map(c => c.name));

  let created = 0, errors = 0;
  for (const [tableName, columns] of Object.entries(tables)) {
    if (existingNames.has(tableName)) {
      console.log(`  SKIP (exists): ${tableName}`);
      continue;
    }

    const safeColumns = columns.map(c => ({
      ...c,
      name: c.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 60),
    }));
    const seen = new Set();
    const deduped = safeColumns.filter(c => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    }).slice(0, 400);

    const type = AUTH_COLLECTIONS.includes(tableName) ? 'auth' : 'base';
    const res = await createCollection(token, tableName, deduped, type);
    if (res.status >= 400) {
      console.log(`  ERROR: ${tableName} - ${(res.data?.message || '').substring(0, 120)}`);
      errors++;
    } else {
      console.log(`  CREATED: ${tableName} (${deduped.length} fields) [${type}]`);
      created++;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Deleted empty: ${deleted}`);
  console.log(`Created with fields: ${created}`);
  console.log(`Errors: ${errors}`);

  const finalCollections = await listCollections(token);
  console.log(`\nTotal collections: ${finalCollections.length}`);
  
  // Show collections with field counts
  const empty = [];
  const populated = [];
  for (const c of finalCollections.sort((a,b) => a.name.localeCompare(b.name))) {
    const count = c.fields?.length || 0;
    if (count === 0 && !PB_SYSTEM.has(c.name)) empty.push(c.name);
    else populated.push(`  ${c.name} [${c.type}] fields=${count}`);
  }
  populated.forEach(l => console.log(l));
  if (empty.length > 0) {
    console.log(`\nStill empty (0 fields): ${empty.join(', ')}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
