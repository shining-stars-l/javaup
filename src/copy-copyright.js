/**
 * 复制内容时自动追加版权信息
 */
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

if (ExecutionEnvironment.canUseDOM) {
  // 配置项
  const config = {
    // 网站名称
    siteName: 'JavaUp',
    // 网站域名
    siteDomain: 'javaup.chat',
    // 协议类型
    license: 'MIT协议',
    // 最小触发字符数（复制内容超过这个长度才追加版权信息）
    minLength: 50,
  };

  document.addEventListener('copy', function (event) {
    const selection = window.getSelection();
    if (!selection) return;

    const selectedText = selection.toString();
    
    // 如果复制的内容太短，不追加版权信息
    if (selectedText.length < config.minLength) {
      return;
    }

    // 获取当前页面URL
    const pageUrl = window.location.href;

    // 构建版权信息
    const copyrightText = `

------
著作权归${config.siteName}(${config.siteDomain})所有
基于${config.license}
原文链接：${pageUrl}`;

    // 组合最终复制内容
    const finalText = selectedText + copyrightText;

    // 阻止默认复制行为，写入自定义内容
    event.preventDefault();
    event.clipboardData.setData('text/plain', finalText);
  });
}
