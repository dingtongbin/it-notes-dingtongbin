// 自定义插件：转义双花括号，避免被 VitePress 当作 Vue 插值语法
export default function escapeBraces(md) {
  // 在解析前处理原始内容
  const originalParse = md.parse.bind(md)
  
  md.parse = (src, env) => {
    // 将 {{ 和 }} 替换为 HTML 实体
    src = src.replace(/\{\{/g, '&#123;&#123;')
    src = src.replace(/\}\}/g, '&#125;&#125;')
    return originalParse(src, env)
  }
}
