// 批量去除 md 文件中所有行内反引号 `xxx` → xxx
// 安全策略：
// 1) 先把 ``` 代码围栏整体替换为占位符（围栏内部的反引号不受影响）
// 2) 替换代码围栏外所有单行内反引号
// 3) 还原代码围栏
// 4) 内容不变则跳过写回，避免 git 无意义变更
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'docs');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// 匹配 ``` 代码围栏（三反引号开始到下一个三反引号，跨多行）
const FENCE_RE = /```[\s\S]*?```/g;
// 匹配单个反引号包裹的行内代码：内容不包含反引号和换行
const INLINE_RE = /`([^`\n]+?)`/g;
// 代码围栏外，可能被 Vue 误当作 HTML 开始标签/结束标签的 "<"：
//   <字母   </字母   <?   <!
// 不包含自动链接 <scheme://...> 那种后面带冒号的。
const DANGEROUS_LT_RE = /<(?=[/?!a-zA-Z])/g;
// 代码围栏外，对应结束的 ">" 也转义，保持一致性
const DANGEROUS_GT_RE = /(?<=[a-zA-Z0-9_\"'\)\]])>/g;
// 花括号也顺手转义（和 escapeBraces 插件功能一致，但这里范围更精准：只在非代码区）
const LBRACE_RE = /\{/g;
const RBRACE_RE = /\}/g;

let changed = 0;
let totalBefore = 0;
let totalAfter = 0;

for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');

  // 步骤1：保存代码围栏到数组，并用占位符替换
  const fences = [];
  let idx = 0;
  const placeholder = '__FENCE__PLACEHOLDER__';
  const withoutFences = original.replace(FENCE_RE, (m) => {
    fences.push(m);
    return `${placeholder}${idx++}${placeholder}`;
  });

  // 步骤2：替换行内反引号（仅在代码围栏外）
  let replaced = withoutFences.replace(INLINE_RE, '$1');

  // 步骤2.5：去反引号后，在正文（非代码区）里转义 Vue 敏感字符
  //   - \<  : 防止 <?P<name>  <class 'int'>  被当 HTML 标签
  //   - \{  : 防止 {a+b} 被当 Vue 插值
  replaced = replaced
    .replace(DANGEROUS_LT_RE, '\\<')
    .replace(DANGEROUS_GT_RE, '\\>')
    .replace(LBRACE_RE, '\\{')
    .replace(RBRACE_RE, '\\}');

  // 步骤3：还原代码围栏
  let restored = replaced;
  for (let i = 0; i < fences.length; i++) {
    restored = restored.replace(`${placeholder}${i}${placeholder}`, fences[i]);
  }

  const before = (original.match(INLINE_RE) || []).length;
  const after = (restored.match(INLINE_RE) || []).length;
  totalBefore += before;
  totalAfter += after;

  if (restored !== original) {
    fs.writeFileSync(file, restored, 'utf8');
    changed++;
    const rel = path.relative(__dirname, file);
    console.log(`✓ ${rel}: 移除 ${before - after} 个反引号`);
  }
}

console.log(`\n完成。共处理 ${walk(ROOT).length} 个 md 文件，修改 ${changed} 个文件。`);
console.log(`反引号数量：${totalBefore} → ${totalAfter}（移除了 ${totalBefore - totalAfter} 处）`);
