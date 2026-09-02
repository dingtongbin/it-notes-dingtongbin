const fs = require('fs');
const path = require('path');
function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (e.isFile() && e.name.endsWith('.md')) o.push(p);
  }
  return o;
}
const FENCE = /```[\s\S]*?```/g;
const INLINE = /`[^`\n]+?`/g;

let totalInline = 0;
let allFiles = 0;
let hitFiles = 0;
for (const f of walk('docs')) {
  allFiles++;
  const c = fs.readFileSync(f, 'utf8');
  // 去掉代码围栏，只看正文
  const body = c.replace(FENCE, '');
  const m = body.match(INLINE);
  if (m && m.length > 0) {
    hitFiles++;
    totalInline += m.length;
    const rel = path.relative(process.cwd(), f);
    const samples = m.slice(0, 5).join(' , ');
    console.log(rel.padEnd(60), m.length.toString().padStart(4), '处  示例:', samples);
  }
}
console.log(`\n共扫描 ${allFiles} 个 md 文件`);
console.log(`正文（非代码围栏）还剩 ${totalInline} 处行内反引号，分布在 ${hitFiles} 个文件里`);
if (totalInline === 0) console.log('✅ 全清');
else console.log('❌ 还有残留，再跑一次 remove-inline-backticks.js 即可');
