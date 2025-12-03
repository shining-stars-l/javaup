import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default (function () {
  if (!ExecutionEnvironment.canUseDOM) {
    return null;
  }

  return {
    onRouteUpdate({ location, previousLocation }) {
      // 确保百度统计脚本已加载
      if (typeof window !== 'undefined' && window._hmt) {
        // 只有在路由真正变化时才发送统计
        if (previousLocation && location.pathname !== previousLocation.pathname) {
          // 发送页面访问统计
          window._hmt.push(['_trackPageview', location.pathname + location.search + location.hash]);
        }
      }
    },
  };
})();
