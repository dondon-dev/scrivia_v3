const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/**/*.ts*', { cwd: 'C:/scriviacloudV2' });
let count = 0;
for (const file of files) {
  const fullPath = 'C:/scriviacloudV2/' + file;
  let content = fs.readFileSync(fullPath, 'utf8');
  const newContent = content.replace(/from ["']@\/lib\/supabase["']/g, "from '@/lib/pb'");
  if (content !== newContent) {
    fs.writeFileSync(fullPath, newContent);
    console.log('Updated:', file);
    count++;
  }
}
console.log('Total files updated:', count);