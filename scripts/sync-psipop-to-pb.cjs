/**
 * Sync localStorage deped_plantilla_positions → PocketBase plantilla_positions
 * Usage: node scripts/sync-psipop-to-pb.cjs <path-to-ls-dump.json>
 * 
 * To create the dump file, run in browser console:
 *   copy(localStorage.getItem('deped_plantilla_positions'))
 * Then paste into a file.
 */
const fs = require('fs');
const path = require('path');

const PB_URL = 'http://localhost:8090';
const BATCH_SIZE = 100;

async function getAdminToken() {
  const resp = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'admin@scrivia.local', password: 'Admin123!' }),
  });
  const data = await resp.json();
  if (!data.token) throw new Error('Admin auth failed: ' + JSON.stringify(data));
  return data.token;
}

async function insertRecord(token, record) {
  // Strip fields not in PB schema or with null/undefined
  const clean = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== null && v !== undefined) clean[k] = v;
  }
  const resp = await fetch(`${PB_URL}/api/collections/plantilla_positions/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(clean),
  });
  return resp.json();
}

async function main() {
  // Read dump file
  const dumpPath = process.argv[2] || path.join(__dirname, '..', '.freebuff', 'plantilla_dump.json');
  if (!fs.existsSync(dumpPath)) {
    console.error('Usage: node scripts/sync-psipop-to-pb.cjs <path-to-dump.json>');
    console.error('Create dump: run in browser console → copy(localStorage.getItem("deped_plantilla_positions"))');
    process.exit(1);
  }

  const positions = JSON.parse(fs.readFileSync(dumpPath, 'utf-8'));
  if (!Array.isArray(positions) || positions.length === 0) {
    console.error('No positions in dump file');
    process.exit(1);
  }
  console.log(`Loaded ${positions.length} positions from dump`);

  const token = await getAdminToken();
  console.log('Admin auth OK');

  // Check existing count
  const existResp = await fetch(`${PB_URL}/api/collections/plantilla_positions/records?perPage=1`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const existData = await existResp.json();
  console.log(`Existing records in PB: ${existData.totalItems || 0}`);

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    try {
      const result = await insertRecord(token, pos);
      if (result.id) {
        synced++;
      } else if (result.code === 400 && result.message?.includes('already exists')) {
        skipped++;
      } else {
        failed++;
        if (failed <= 5) console.error(`  Failed [${i}]: ${pos.item_number} — ${result.message || JSON.stringify(result).slice(0, 100)}`);
      }
    } catch (err) {
      failed++;
      if (failed <= 5) console.error(`  Error [${i}]: ${pos.item_number} — ${err.message}`);
    }

    if ((i + 1) % 200 === 0) {
      console.log(`  Progress: ${i + 1}/${positions.length} (synced: ${synced}, skipped: ${skipped}, failed: ${failed})`);
    }
  }

  console.log(`\nDone! Synced: ${synced}, Skipped (dupes): ${skipped}, Failed: ${failed}, Total: ${positions.length}`);
}

main().catch(console.error);
