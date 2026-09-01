import DefaultTheme from 'vitepress/theme'
import { onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute()
    
    onMounted(() => {
      // 初始页面加载时跟踪
      trackPageView()
      
      // 监听路由变化
      watch(
        () => route.path,
        () => {
          // 路由变化时跟踪新页面
          trackPageView()
        }
      )
    })
    
    function trackPageView() {
      // 确保在浏览器环境中执行
      if (typeof window !== 'undefined' && typeof _hmt !== 'undefined') {
        // 使用百度统计的 _trackPageview 方法
        _hmt.push(['_trackPageview', window.location.pathname + window.location.search])
      }
    }
  }
}
