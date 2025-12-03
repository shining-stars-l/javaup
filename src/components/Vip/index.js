import React, { useEffect } from 'react';
import Link from '@docusaurus/Link';
import styles from './index.module.css';

export default function Vip({
  show = true,
  imageSrc = '/img/person/knowledge _planet_horizontal_version.jpg',
  usageGuideLink = 'https://articles.zsxq.com/id_5wwmxks5u358.html',
}) {
  // 锁定背景滚动
  useEffect(() => {
    if (!show || typeof window === 'undefined') return;
    const scrollY = window.scrollY || 0;
    const htmlStyle = document.documentElement.style;
    const bodyStyle = document.body.style;
    const prevHtmlOverflow = htmlStyle.overflow;
    const prevBodyOverflow = bodyStyle.overflow;
    const prevBodyPosition = bodyStyle.position;
    const prevBodyTop = bodyStyle.top;
    const prevBodyWidth = bodyStyle.width;

    htmlStyle.overflow = 'hidden';
    bodyStyle.overflow = 'hidden';
    bodyStyle.position = 'fixed';
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.width = '100%';

    return () => {
      htmlStyle.overflow = prevHtmlOverflow;
      bodyStyle.overflow = prevBodyOverflow;
      bodyStyle.position = prevBodyPosition;
      bodyStyle.top = prevBodyTop;
      bodyStyle.width = prevBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.wrapper} role="dialog" aria-modal="true">
        <p className={styles.title}>该文档仅对 “JavaUp项目实战&技术讲解” 星球用户可见</p>
        <div className={styles.content}>
          <p>JavaUp 项目实战&技术讲解的星球内容包括:</p>
          <p><span className={styles.highlight}>- 讲解的文档</span>: 黑马点评Plus、大麦、大麦pro、大麦AI、流量切换、数据中台的从0到1的550+详细文档</p>
          <p><span className={styles.highlight}>- 讲解的视频</span>: 黑马点评Plus、大麦、大麦pro、大麦AI、流量切换、数据中台的核心业务详细讲解</p>
          <p><span className={styles.highlight}>- 1对1的解答</span>: 可以对我进行1对1的问题提问，而不仅仅只限于项目</p>
          <p><span className={styles.highlight}>- 针对性服务</span>: 有没理解的地方，文档或者视频还没有讲到可以提出，本人会补充</p>
          <p><span className={styles.highlight}>- 面试和简历</span>: 提供面试回答技巧，项目怎样写才能在简历中具有独特的亮点</p>
          <p><span className={styles.highlight}>- 中间件环境</span>: 对于项目中需要使用的中间件，可直接替换成我提供的云环境</p>
          <p><span className={styles.highlight}>- 面试后复盘</span>: 小伙伴去面试后，如果哪里被面试官问住了，可以再找我解答</p>
          <p><span className={styles.highlight}>- 远程的解决</span>: 如果在启动项目遇到问题，本人可以帮你远程解决</p>

          <div className={styles.centerNotice}>
            <p><span className={styles.emphasis}>进入星球后，即可享受所有的服务内容，保证不会再有其他隐藏费用</span></p>
          </div>

          <img src={imageSrc} alt="知识星球二维码" className={styles.qr} />

          <div>
            <p><strong>1. [打开微信] -&gt; [扫描上方二维码] -&gt; [加入知识星球]</strong></p>
          </div>
          <div>
            <p>
              <strong>2. 查看星球的</strong>
              <Link className={styles.link} to={usageGuideLink} target="_blank">使用指导</Link>
              <strong>，来获取项目配套讲解的资料地址</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


