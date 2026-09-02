import { defineConfig } from 'vitepress'
import { withSidebar } from 'vitepress-sidebar'
import escapeBraces from '../plugins/escapeBraces.js'

// VitePress 自身配置
const vitePressConfig = {
  // 部署路径：GitHub Actions 里自动用仓库项目页路径，本地开发用根路径
  base: process.env.GITHUB_ACTIONS ? '/it-notes-dingtongbin/' : '/',
  // 是否忽略死链。false 表示存在无效链接时构建直接报错
  ignoreDeadLinks: false,
  // 自定义主题目录
  theme: './.vitepress/theme',
  head: [
    // 百度统计脚本
    [
      'script',
      {},
      `
        var _hmt = _hmt || [];
        (function() {
          var hm = document.createElement("script");
          hm.src = "https://hm.baidu.com/hm.js?8016c34df1938bfa9c6370a08fecfaac";
          var s = document.getElementsByTagName("script")[0]; 
          s.parentNode.insertBefore(hm, s);
        })();
      `
    ]
  ],
  markdown: {
    // 保留 markdown 的 HTML 功能（<!-- 注释 -->、<br> 等正常生效），
    // 但在 escapeBraces 插件里精准转义「裸 <xxx>」，不让 Vue 编译器误当标签报错
    config(md) {
      md.use(escapeBraces)
    }
  },
  // 站点标题（浏览器标签页 / SEO）
  title: 'it-notes-dingtongbin',
  // 站点描述（SEO）
  description: 'it-notes-dingtongbin',
  themeConfig: {
    // 顶部导航栏
    nav: [
      { text: '首页', link: '/' },
      { text: 'python', link: '/guide/python/基础语法/01-安装python' },
      { text: 'go', link: '/guide/go/' },
      { text: '前端', link: '/guide/frontend/' },
      { text: 'linux', link: '/guide/linux/' },
      { text: 'k8s', link: '/guide/k8s/' },
      { text: '智能体', link: '/guide/agent/' },
      { text: 'git使用', link: '/guide/git/' },
      { text: 'md语法', link: '/guide/md/' },
      { text: '我的博客', link: 'https://dingtongbin.cn' }
    ],
    // 底部社交链接（GitHub 图标 → 仓库地址）
    socialLinks: [
      { icon: 'github', link: 'https://github.com/dingtongbin/it-notes-dingtongbin' }
    ],
    // 站内本地全文搜索
    search: {
      provider: 'local'
    }
  }
}

/**
 * 多侧边栏：数组里每个元素对应一个分类。
 * - scanStartPath : 实际被扫描的目录（相对 documentRootPath）
 * - resolvePath   : 访问到该路径前缀的页面时，只显示这个分类的侧边栏
 * - link 为相对路径，Vitepress 会以 base(=resolvePath) 拼接成 /guide/xxx/页面
 * 使用 withSidebar 才能在新增/删除文件时热更新侧边栏。
 */
/**
 * 公共选项：
 * - sortMenusOrderNumericallyFromLink : 按链接（文件名）里的数字前缀排序（01- < 02- < … < 10-）
 * - useTitleFromFrontmatter           : 显示文本优先用 frontmatter 的 title
 * - removePrefixAfterOrdering         : 排序后去掉 "01-"、"02-" 等数字前缀（仅显示效果，不影响排序依据）
 * - prefixSeparator                    : 前缀分隔符
 */
const commonOpts = {
  documentRootPath: 'docs',
  sortMenusOrderNumericallyFromLink: true,
  useTitleFromFrontmatter: true,
  removePrefixAfterOrdering: true,
  prefixSeparator: '-'
}

const sidebarOptions = [
  { ...commonOpts, scanStartPath: 'guide/python',   resolvePath: '/guide/python/' },
  { ...commonOpts, scanStartPath: 'guide/go',       resolvePath: '/guide/go/' },
  { ...commonOpts, scanStartPath: 'guide/frontend', resolvePath: '/guide/frontend/' },
  { ...commonOpts, scanStartPath: 'guide/linux',    resolvePath: '/guide/linux/' },
  { ...commonOpts, scanStartPath: 'guide/k8s',      resolvePath: '/guide/k8s/' },
  { ...commonOpts, scanStartPath: 'guide/agent',    resolvePath: '/guide/agent/' },
  { ...commonOpts, scanStartPath: 'guide/git',      resolvePath: '/guide/git/' },
  { ...commonOpts, scanStartPath: 'guide/md',       resolvePath: '/guide/md/' }
]

export default defineConfig(withSidebar(vitePressConfig, sidebarOptions))