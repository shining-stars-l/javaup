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
            ：100万+字全栈技术知识库，涵盖数据库、中间件、分布式等核心知识
          </li>
          <li>
            <span className={styles.highlight}>讲解文档</span>
            ：黑马点评Plus、大麦、大麦pro、大麦AI、流量切换、数据中台等 550+ 详细文档
          </li>
          <li>
            <span className={styles.highlight}>讲解视频</span>
            ：项目从 0 到 1 的业务拆解与源码级讲解
          </li>
          <li>
            <span className={styles.highlight}>1 对 1 解答</span>
            ：不限于项目的技术问题都可以提问
          </li>
          <li>
            <span className={styles.highlight}>针对性服务</span>
            ：不理解的地方、尚未覆盖的内容可以反馈补充
          </li>
          <li>
            <span className={styles.highlight}>面试与简历指导</span>
            ：如何把项目写出亮点、以及面试答题思路
          </li>
          <li>
            <span className={styles.highlight}>中间件环境</span>
            ：项目所需中间件可以直接使用提供的云环境
          </li>
          <li>
            <span className={styles.highlight}>面试复盘与远程协助</span>
            ：面试被问住、项目启动遇到问题都可远程协助解决
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

