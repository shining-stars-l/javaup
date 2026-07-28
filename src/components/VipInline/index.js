import React from 'react';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import styles from './index.module.css';

const PROJECTS = [
  'Nexus Agent AI 智能体',
  'Nexus Agent Pro 完全版',
  '黑马点评Plus',
  '大麦',
  '大麦Pro',
  '大麦AI',
  '流量切换',
  '数据中台',
];

const SERVICES = [
  {
    title: '1 对 1 解答',
    description: '项目和技术问题都可以提问',
  },
  {
    title: '针对性补充',
    description: '没有讲清楚的内容会继续补充',
  },
  {
    title: '面试与简历指导',
    description: '梳理回答技巧和项目亮点',
  },
  {
    title: '中间件云环境',
    description: '项目依赖可以直接接入使用',
  },
  {
    title: '面试后复盘',
    description: '被问住的问题可以继续交流',
  },
  {
    title: '远程问题解决',
    description: '项目启动问题可协助排查',
  },
];

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
          该文档的全部内容仅对「码力全开」项目实战&技术讲解 知识星球用户开放
        </h3>
      </div>

      <div className={styles.body}>
        <p className={styles.lead}>
          加入星球，一次获得完整项目资料、全栈技术知识库和长期答疑服务。
        </p>

        <div className={styles.stats}>
          <div className={styles.statItem}>
            <strong className={styles.statValue}>100万+字</strong>
            <span className={styles.statTitle}>全栈技术知识库</span>
            <span className={styles.statDescription}>
              深入讲解技术核心、数据库、中间件和分布式等内容
            </span>
          </div>
          <div className={styles.statItem}>
            <strong className={styles.statValue}>{PROJECTS.length}套热门的实战项目</strong>
            <span className={styles.statTitle}>持续更新的企业级项目</span>
            <span className={styles.statDescription}>
              覆盖高并发、微服务、数据中台 和 AI Agent 等方向
            </span>
          </div>
          <div className={styles.statItem}>
            <strong className={styles.statValue}>AI 技术知识</strong>
            <span className={styles.statTitle}>大模型面试详解</span>
            <span className={styles.statDescription}>
              覆盖 AI 模型原理、Agent、RAG、MCP、Skills、Harness 等核心知识点
            </span>
          </div>
          <div className={styles.statItem}>
            <strong className={styles.statValue}>文档 + 视频</strong>
            <span className={styles.statTitle}>两种讲解形式</span>
            <span className={styles.statDescription}>
              既能系统阅读，也能跟随视频理解核心业务
            </span>
          </div>
        </div>

        <div className={styles.contentSection}>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionHeadingCopy}>
              <div className={styles.sectionTitleLine}>
                <h4 className={styles.sectionTitle}>完整项目实战资料</h4>
                <span className={styles.sectionSupplement}>
                  每套项目均包含
                  <strong>从 0 到 1 讲解文档</strong>
                  <span aria-hidden="true">+</span>
                  <strong>核心业务讲解视频</strong>
                </span>
              </div>
              <p className={styles.sectionDescription}>
                从基础项目到复杂业务场景，项目资料会持续更新。
              </p>
            </div>
            <span className={styles.projectCount}>{PROJECTS.length} 套项目</span>
          </div>

          <ul className={styles.projectGrid}>
            {PROJECTS.map((project, index) => (
              <li key={project} className={styles.projectItem}>
                <span className={styles.projectIndex}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{project}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.serviceSection}>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionHeadingCopy}>
              <div className={styles.sectionTitleLine}>
                <h4 className={styles.sectionTitle}>加入后还能获得</h4>
                <strong className={styles.serviceNotice}>
                  进入星球后，即可享受上述所有服务，保证不会再有其他隐藏费用。
                </strong>
              </div>
              <p className={styles.sectionDescription}>
                从学习、面试到项目启动，都可以继续获得支持。
              </p>
            </div>
          </div>

          <ul className={styles.serviceGrid}>
            {SERVICES.map((service) => (
              <li key={service.title} className={styles.serviceItem}>
                <span className={styles.checkmark} aria-hidden="true">✓</span>
                <span className={styles.serviceContent}>
                  <strong>{service.title}</strong>
                  <span>{service.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.qrAndActions}>
          <img
            src={imageSrc}
            alt="知识星球二维码"
            className={styles.qr}
          />

          <div className={styles.stepsWrapper}>
            <div className={styles.joinHeading}>
              <h4>扫码进入知识星球</h4>
            </div>
            <ol className={styles.stepsList}>
              <li>
                打开微信，扫描左侧二维码，加入「码力全开」项目实战&技术讲解 知识星球
              </li>
              <li>
                查看
                <Link
                  className={styles.link}
                  to={usageGuideLink}
                  target="_blank"
                >
                  星球使用指导
                </Link>
                ，获取完整项目讲解资料索引
              </li>
            </ol>
            <Link className={styles.primaryCta} to={ctaTo}>
              解锁全部付费内容
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
