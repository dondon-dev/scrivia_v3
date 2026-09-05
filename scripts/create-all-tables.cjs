#!/usr/bin/env node
/**
 * create-all-tables.cjs
 * 
 * Reads the PostgreSQL backup SQL line-by-line, extracts CREATE TABLE blocks,
 * and creates missing PocketBase collections via API.
 */

const fs = require('fs');
const http = require('http');

const BACKUP_PATH = 'C:/Backups/supabase_backup_2026-Tue 09-01_ 0-13.sql';
const PB_BASE = 'http://localhost:8090';
const ADMIN_EMAIL = 'admin@scrivia.local';
const ADMIN_PASSWORD = 'Admin123456!';

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
  return (res.data.items || []).map(c => c.name);
}

async function createCollection(token, name, fields) {
  const body = {
    name, type: 'base', system: false, schema: fields,
    listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
  };
  const res = await httpReq('POST', '/api/collections', body, token);
  if (res.status >= 400) {
    return { error: res.data?.message || res.data?.detail || JSON.stringify(res.data) };
  }
  return { id: res.data?.id, name: res.data?.name };
}

/**
 * Parse SQL backup line-by-line to extract CREATE TABLE blocks.
 * Returns { tableName: [ {name, type, required, options} ] }
 */
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
      // Look for CREATE TABLE public.xxx (
      const m = line.match(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)\s*\(/i);
      if (m) {
        inTable = true;
        currentTable = m[1];
        currentBody = '';
        depth = 1;
        // Check if the rest of the line has content after the opening (
        const afterOpen = line.substring(line.indexOf('(') + 1);
        currentBody += afterOpen + '\n';
      }
    } else {
      // Count parentheses depth
      for (const ch of line) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
      }
      currentBody += line + '\n';
      
      if (depth <= 0) {
        // End of CREATE TABLE
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
  // Split by commas at depth 0
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
    // Skip constraints/indexes
    if (/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|EXCLUDE|FOREIGN KEY|CREATE |INDEX |ENABLE |ALTER |USING |WITH |GRANT|NOT VALID|--)/i.test(trimmed)) continue;

    // Match: "colname" type ... or colname type ...
    const m = trimmed.match(/^"?(\w+)"?\s+(.+)/);
    if (!m) continue;

    const colName = m[1];
    const typeDef = m[2].trim();

    const colType = extractTypeName(typeDef);
    const pbType = PG_TO_PB[colType.toLowerCase()] || 'text';

    // Skip id column (PB manages it)
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
  let type = typeDef
    .split(/\s+DEFAULT\b/i)[0]
    .split(/\s+NOT\s+NULL\b/i)[0]
    .split(/\s+NULL\b/i)[0]
    .split(/\s+PRIMARY\b/i)[0]
    .split(/\s+REFERENCES\b/i)[0]
    .split(/\s+UNIQUE\b/i)[0]
    .split(/,\s*$/)[0]
    .trim()
    .replace(/\(\d+(?:,\s*\d+)?\)/, '');
  return type;
}

async function main() {
  console.log('=== Extracting table schemas from backup SQL ===\n');

  const tables = extractTablesFromBackup(BACKUP_PATH);
  const tableNames = Object.keys(tables).sort();
  console.log(`\nFound ${tableNames.length} public.* tables in backup\n`);

  // Get PB token and existing collections
  const token = await getToken();
  const existing = await listCollections(token);
  console.log(`Existing PocketBase collections (${existing.length}): ${existing.join(', ')}\n`);

  // Filter to missing
  const missing = tableNames.filter(t => !existing.includes(t));
  console.log(`Missing tables to create: ${missing.length}`);
  missing.forEach(t => console.log(`  - ${t} (${tables[t].length} columns)`));
  console.log('');

  let created = 0, errors = 0;

  for (const tableName of missing) {
    const columns = tables[tableName];

    // Sanitize column names
    const safeColumns = columns.map(c => ({
      ...c,
      name: c.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 60),
    }));

    // Deduplicate
    const seen = new Set();
    const deduped = safeColumns.filter(c => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    }).slice(0, 400); // PB limit

    process.stdout.write(`Creating ${tableName} (${deduped.length} cols)... `);
    const result = await createCollection(token, tableName, deduped);

    if (result.error) {
      console.log(`ERROR: ${result.error.substring(0, 120)}`);
      errors++;
    } else {
      console.log(`OK`);
      created++;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Tables in backup: ${tableNames.length}`);
  console.log(`Already existed: ${tableNames.length - missing.length}`);
  console.log(`Created: ${created}`);
  console.log(`Errors: ${errors}`);

  const finalCollections = await listCollections(token);
  console.log(`\nTotal PocketBase collections now: ${finalCollections.length}`);
  finalCollections.sort().forEach(c => console.log(`  ${c}`));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
