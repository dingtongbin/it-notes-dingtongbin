// 自定义 markdown 插件：在 VitePress 编译前，
// 把正文里可能被 Vue / @vue/compiler-core 误当作语法的字符全部转成 HTML 实体。
// 策略：
//   1. 先把 ``` 代码围栏整体替换为占位符（围栏内是代码，不能动）
//   2. 围栏外的正文：把 {{ }} < > 全部转义为 &# 实体
//   3. 还原代码围栏
// 这样用户文档里写任何 <abc>、{a+b}、<?P<name>> 都按纯文本显示，不会触发 Vue 编译报错。
// 注：config.mts 还开了 markdown.html: false，两者双保险。
export default function escapeBraces(md) {
  const originalParse = md.parse.bind(md)

  md.parse = (src, env) => {
    const FENCE_RE = /```[\s\S]*?```/g
    const fences = []
    let i = 0
    const PLACEHOLDER = '\x00__FENCE__\x00'

    // 1. 移除代码围栏
    const withoutFences = src.replace(FENCE_RE, (m) => {
      fences.push(m)
      return `${PLACEHOLDER}${i++}${PLACEHOLDER}`
    })

    // 2. 在非代码区，Vue 敏感字符 → HTML 实体
    let escaped = withoutFences
      .replace(/\{\{/g, '&#123;&#123;')
      .replace(/\}\}/g, '&#125;&#125;')
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;')
      .replace(/</g, '&#60;')
      .replace(/>/g, '&#62;')

    // 3. 还原代码围栏
    for (let j = 0; j < fences.length; j++) {
      escaped = escaped.replace(
        new RegExp(`${PLACEHOLDER}${j}${PLACEHOLDER}`, 'g'),
        fences[j]
      )
    }

    return originalParse(escaped, env)
  }
}
