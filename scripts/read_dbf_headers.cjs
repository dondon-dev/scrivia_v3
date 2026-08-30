const fs = require('fs');
const files = [
  'C:\\Users\\adona\\Downloads\\AUGUST 2026-20260815T062928Z-1-001\\AUGUST 2026\\BACKUP FILES\\ES\\DEDFILE.DBF',
  'C:\\Users\\adona\\Downloads\\AUGUST 2026-20260815T062928Z-1-001\\AUGUST 2026\\BACKUP FILES\\ES\\EXCLUDED.DBF',
  'C:\\Users\\adona\\Downloads\\AUGUST 2026-20260815T062928Z-1-001\\AUGUST 2026\\BACKUP FILES\\ES\\INCLUDED.DBF'
];
for (const f of files) {
  const buf = fs.readFileSync(f);
  // DBF header: bytes 0-3 version, 4-7 date, 8-9 header length (LE), 10-11 record length (LE)
  const headerLen = buf.readUInt16LE(8);
  const recLen = buf.readUInt16LE(10);
  // Field descriptors start at byte 32, each is 32 bytes, terminated by 0x0D
  // headerLen = 32 + (numFields+1)*32 + 1 (for the 0x0D terminator)
  const numFields = Math.floor((headerLen - 33) / 32);
  const name = f.split('\\').pop();
  console.log('\n=== ' + name + ' ===');
  console.log('Fields: ' + numFields + ', Header length: ' + headerLen + ', Record length: ' + recLen);
  for (let i = 0; i < numFields; i++) {
    const offset = 32 + i * 32;
    const fname = buf.slice(offset, offset + 11).toString('ascii').replace(/\0/g, '');
    const type = String.fromCharCode(buf[offset + 11]);
    const len = buf[offset + 16];
    const dec = buf[offset + 17];
    console.log('  ' + fname.padEnd(14) + ' type=' + type + ' len=' + len + ' dec=' + dec);
  }
}
