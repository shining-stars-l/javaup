import React from 'react';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import styles from './index.module.css';

export default function VipInline({
  className,
  imageSrc = '/img/person/knowledge _planet_horizontal_version.jpg',
  usageGuideLink = 'https://articles.zsxq.com/id_5wwmxks5u358.html',
  ctaTo = '/how-to-study/intro/full-service',
}) {
  return (
    <section className={clsx(styles.card, className)}>
      <div className={styles.header}>
        <p className={styles.badge}>付费内容提示</p>
        <h3 className={styles.title}>
          该文档的全部内容仅对「JavaUp项目实战&技术讲解」知识星球用户开放
        </h3>
      </div>

      <div className={styles.body}>
        <p>加入星球后，你可以获得：</p>
        <ul className={styles.list}>
          <li>
            <span className={styles.highlight}>超级八股文</span>
            ：100万+字的全栈技术知识库，涵盖技术核心、数据库、中间件、分布式等深度剖析的讲解
          </li>
          <li>
            <span className={styles.highlight}>讲解文档</span>
            ：超级AI智能体、黑马点评Plus、大麦、大麦pro、大麦AI、流量切换、数据中台的从0到1的详细文档
          </li>
          <li>
            <span className={styles.highlight}>讲解视频</span>
            ：超级AI智能体、黑马点评Plus、大麦、大麦pro、大麦AI、流量切换、数据中台的核心业务详细讲解
          </li>
          <li>
            <span className={styles.highlight}>1 对 1 解答</span>
            ：可以对我进行1对1的问题提问，而不仅仅只限于项目
          </li>
          <li>
            <span className={styles.highlight}>针对性服务</span>
            ：有没理解的地方，文档或者视频还没有讲到可以提出，本人会补充
          </li>
          <li>
            <span className={styles.highlight}>面试与简历指导</span>
            ：提供面试回答技巧，项目怎样写才能在简历中具有独特的亮点
          </li>
          <li>
            <span className={styles.highlight}>中间件环境</span>
            ：对于项目中需要使用的中间件，可直接替换成我提供的云环境
          </li>
          <li>
            <span className={styles.highlight}>面试后复盘</span>
            ：小伙伴去面试后，如果哪里被面试官问住了，可以再找我解答
          </li>
          <li>
            <span className={styles.highlight}>远程的解决</span>
            ：如果在启动项目遇到问题，本人可以帮你远程解决
          </li>
        </ul>

        <div className={styles.notice}>
          <strong>
            进入星球后，即可享受上述所有服务，保证不会再有其他隐藏费用。
          </strong>
        </div>

        <div className={styles.qrAndActions}>
          <img
            src={imageSrc}
            alt="知识星球二维码"
            className={styles.qr}
          />

          <div className={styles.stepsWrapper}>
            <p className={styles.steps}>
              1. 打开微信 -&gt; 扫描左侧二维码 -&gt; 加入「JavaUp项目实战&技术讲解」知识星球
            </p>
            <p className={styles.steps}>
              2. 查看
              <Link
                className={styles.link}
                to={usageGuideLink}
                target="_blank"
              >
                星球使用指导
              </Link>
              ，获取完整项目讲解资料索引
            </p>
            <Link className={styles.primaryCta} to={ctaTo}>
              👉 点击解锁全部付费内容
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

