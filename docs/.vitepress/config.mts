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
    // 注册自定义 markdown 插件（转义花括号）
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
      { text: 'python', link: '/guide/python/' },
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
const sidebarOptions = [
  { documentRootPath: 'docs', scanStartPath: 'guide/python', resolvePath: '/guide/python/', sortMenusByName: true, useTitleFromFrontmatter: true },
  { documentRootPath: 'docs', scanStartPath: 'guide/go', resolvePath: '/guide/go/', sortMenusByName: true, useTitleFromFrontmatter: true },
  { documentRootPath: 'docs', scanStartPath: 'guide/frontend', resolvePath: '/guide/frontend/', sortMenusByName: true, useTitleFromFrontmatter: true },
  { documentRootPath: 'docs', scanStartPath: 'guide/linux', resolvePath: '/guide/linux/', sortMenusByName: true, useTitleFromFrontmatter: true },
  { documentRootPath: 'docs', scanStartPath: 'guide/k8s', resolvePath: '/guide/k8s/', sortMenusByName: true, useTitleFromFrontmatter: true },
  { documentRootPath: 'docs', scanStartPath: 'guide/agent', resolvePath: '/guide/agent/', sortMenusByName: true, useTitleFromFrontmatter: true },
  { documentRootPath: 'docs', scanStartPath: 'guide/git', resolvePath: '/guide/git/', sortMenusByName: true, useTitleFromFrontmatter: true },
  { documentRootPath: 'docs', scanStartPath: 'guide/md', resolvePath: '/guide/md/', sortMenusByName: true, useTitleFromFrontmatter: true }
]

export default defineConfig(withSidebar(vitePressConfig, sidebarOptions))