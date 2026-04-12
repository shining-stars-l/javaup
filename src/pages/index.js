import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';
import { useEffect, useRef } from 'react';

// 超级八股文知识模块配置
const baguModules = [
  { icon: '☕', title: 'Java核心', desc: '基础语法、集合、IO、并发、JVM', color: '#ff6b6b' },
  { icon: '🗄️', title: '数据库', desc: 'MySQL、Redis深度剖析', color: '#4ecdc4' },
  { icon: '🌐', title: '框架中间件', desc: 'Spring、MQ、ES、Netty', color: '#45b7d1' },
  { icon: '🚀', title: '分布式架构', desc: '微服务、分库分表、事务', color: '#96ceb4' },
  { icon: '💻', title: '基础内功', desc: '操作系统、网络、数据结构', color: '#feca57' },
  { icon: '🎯', title: '方案设计', desc: '秒杀、缓存、限流熔断', color: '#ff9ff3' },
];

// 项目数据配置
const projects = [
  {
    id: 'super-agent',
    title: '🧠 超级智能体项目',
    subtitle: '深入剖析 AI 底层与工程化落地！',
    description: '面向企业级场景打造的 AI 智能体对话平台，完整覆盖 Agent 智能体、RAG 检索增强、MCP 工具协议、Skills 能力扩展、会话记忆管理与文档全生命周期治理，帮助你真正从“会调 API”进阶到“会做 AI 系统”。',
    features: [
      '🤖 ReAct Agent 智能体',
      '📚 RAG 检索增强生成',
      '🔌 MCP 工具协议集成',
      '🧩 Skills 能力扩展',
      '🧠 会话记忆管理',
      '🗂️ 文档全生命周期治理'
    ],
    image: '/img/super-agent/架构图/架构流程图.png',
    links: [
      { label: '🎯 点击查看项目详情', to: '/super-agent/overview/project-intro' }
    ]
  },
  {
    id: 'hmdp-plus',
    title: '🎟️ 黑马点评 Plus 项目',
    subtitle: '升级为生产级的实战版本！',
    description: '将黑马点评进行完全地重构升级，围绕优惠券秒杀与热点查询，补齐高并发稳定性、动态令牌、限流、消息可靠性与数据一致性闭环，并添加订阅通知、候补排队等新亮点功能，解决烂大街和亮点不足问题！并打造成真正企业级别实战项目，全面工程化落地。',
    features: [
      '🧰 令牌前置授权 + 令牌桶限流',
      '🧱 多层缓存与布隆过滤器',
      '🔒 分布式锁与幂等',
      '📬 Kafka可靠消息与延迟队列',
      '🧾 分库分表与全局ID',
      '🔍 可观测与故障闭环'
    ],
    image: '/img/hmdp-plus/秒杀优惠券_调整比例，首页使用.jpg',
    links: [
      { label: '🎯 点击查看项目详情', to: '/hmdp-plus/overview/project-intro' }
    ]
  },
  {
    id: 'damai',
    title: '⚡ 大麦网高并发项目',
    subtitle: '为高并发而生！',
    description: '应对海量并发的完整解决方案，如：分库分表、缓存策略、限流降级、分布式锁等。从中间件的深度定制到架构组件的精心设计，每一个细节都经过实战验证。',
    features: [
      '🚀 高并发架构设计',
      '💾 分库分表解决方案', 
      '🔒 各种锁优化策略',
      '⚡ 多级缓存的管理',
      '🛡️ 限流降级机制',
      '📊 性能监控体系'
    ],
    image: '/img/damai/项目架构图(动态优化).gif',
    links: [
      { label: '🎯 点击查看项目详情', to: '/damai/overview/project-intro' }
    ]
  },
  {
    id: 'damai-ai',
    title: '🤖 大麦AI智能项目',
    subtitle: '带你玩转各种AI！',
    description: '集成了目前最热的AI技术SpringAI、并结合Ollama、OpenAI、DeepSeek、通义千问等多个AI模型，并且完全开源，全体AI智能分析项目！',
    features: [
      '🧠 多AI模型集成',
      '💬 智能对话系统',
      '📚 RAG知识检索',
      '🔍 向量数据库应用',
      '⚙️ Function Calling',
      '📝 AI内容生成'
    ],
    image: '/img/damai-ai/大麦AI流程图.jpg',
    links: [
      { label: '🎯 点击查看项目详情', to: '/damai-ai/overview/project-intro' }
    ]
  },
  {
    id: 'link-flow',
    title: '💫 流量灵活切换项目',
    subtitle: '服务请求流量切换利器！',
    description: '能够实现的功能包括：蓝绿发布、灰度发布、流量切换功能，让你能够更优雅地进行系统发布和流量管理，作为功能组件，可以轻松集成到任何微服务项目中！',
    features: [
      '🔄 蓝绿发布',
      '🎯 灰度发布', 
      '⚡ 流量切换',
      '🎛️ 动态配置',
      '📊 实时监控',
      '🔧 组件化集成'
    ],
    image: '/img/link-flow/项目架构图(动态优化).gif',
    links: [
      { label: '🎯 点击查看项目详情', to: '/link-flow/business-intro/getting-started-overview' }
    ]
  },
  {
    id: 'dock-data-center',
    title: '📊 数据中台项目',
    subtitle: '沉淀数据，驱动业务！',
    description: '持续接入多源视频播放与互动事件，沉淀用户观看行为，通过规则化的指标计算引擎，内置动态数据源与 MQ 驱动的增量汇总！',
    features: [
      '📈 规则化指标计算引擎',
      '🧩 动态数据源治理',
      '🔄 MQ 驱动的增量汇总',
      '🔒 可靠消息与对账闭环',
      '🔭 可观测性',
    ],
    image: '/img/dock-data-center/数据中台流程图.png',
    links: [
      { label: '🎯 点击查看项目详情', to: '/dock-data-center/business-intro/info' }
    ]
  },
];

// 顶部 Hero 区域
function HeroSection() {
  return (
    <section className={styles.heroSection}>
      <div className="container">
        <div className={styles.heroContent}>
          <Heading as="h1" className={styles.heroTitle}>
            JavaUp <span className={styles.heroTitleHighlight}>技术 & 实战</span>
          </Heading>
          <p className={styles.heroSubtitle}>
            用心整理的 <strong>Java 技术知识库</strong> + <strong>生产级实战项目</strong>
          </p>
          {/* Star 引导 - 简洁横向布局 */}
          <div className={styles.starBanner}>
            <span className={styles.starBannerText}>
              觉得有帮助？欢迎点个 Star 支持 ✨
            </span>
            <div className={styles.starBannerLinks}>
              <a href="https://github.com/shining-stars-l/javaup" target="_blank" rel="noopener noreferrer" className={styles.starLink}>
                <svg className={styles.starLinkIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                GitHub
              </a>
              <a href="https://gitee.com/java-up-up/javaup" target="_blank" rel="noopener noreferrer" className={styles.starLink}>
                <svg className={styles.starLinkIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.328 0 .593-.265.593-.593v-1.482a.594.594 0 0 0-.593-.592h-3.408a.43.43 0 0 1-.296-.124.41.41 0 0 1-.124-.295V8.814a.43.43 0 0 1 .42-.419h5.618c.329 0 .593.266.593.593v7.241a.593.593 0 0 1-.593.593H6.204a.593.593 0 0 1-.593-.593V6.741c0-.327.266-.593.593-.593h5.618z"/></svg>
                Gitee
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// 超级八股文介绍区块
function BaguSection() {
  const sectionRef = useRef(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
      el.classList.add(styles.isVisible);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add(styles.isVisible);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.15, root: null, rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className={styles.baguSection}>
      <div className="container">
        <div className={styles.baguHeader}>
          <Heading as="h2" className={styles.baguTitle}>
            📚 超级八股文系列
          </Heading>
          <p className={styles.baguSubtitle}>
            不只是概念背诵，更是<strong>深度原理剖析</strong> + <strong>代码示例</strong> + <strong>流程图解</strong>
          </p>
        </div>

        {/* 知识模块卡片 */}
        <div className={styles.baguModules}>
          {baguModules.map((mod, idx) => (
            <div key={idx} className={styles.baguModuleCard} style={{ '--accent-color': mod.color }}>
              <span className={styles.baguModuleIcon}>{mod.icon}</span>
              <h3 className={styles.baguModuleTitle}>{mod.title}</h3>
              <p className={styles.baguModuleDesc}>{mod.desc}</p>
            </div>
          ))}
        </div>

        {/* 功能按钮组和公众号卡片 */}
        <div className={styles.baguBottom}>
          <div className={styles.baguActions}>
            <Link className={clsx('button button--primary button--lg', styles.baguBtnPrimary)} to="/java/interview-skills/preparation-guide">
              🎯 开始学习
            </Link>
            <Link className={clsx('button button--outline button--lg', styles.baguBtnOutline)} to="/how-to-study/intro/super-baguwen">
              📖 查看全部目录
            </Link>
            <Link className={clsx('button button--lg', styles.baguBtnContribute)} to="/how-to-study/contribute/guide">
              🤝 参与项目贡献
            </Link>
            <Link className={clsx('button button--lg', styles.baguBtnStar)} to="/how-to-study/intro/full-service">
              ⭐ 加入知识星球
            </Link>
          </div>
          <div className={styles.wechatCard}>
            <img
              src="/img/person/gongZhongHao.jpg"
              alt="公众号二维码"
              className={styles.wechatCardImg}
            />
            <div className={styles.wechatCardInfo}>
              <span className={styles.wechatCardTitle}>📱 扫码关注公众号</span>
              <span className={styles.wechatCardName}>阿星不是程序员</span>
              <span className={styles.wechatCardDesc}>领取最新的学习路线以及简历模板和实战项目</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// 实战项目分隔区块
function ProjectsDivider() {
  return (
    <div className={styles.projectsDivider}>
      <div className="container">
        <Heading as="h2" className={styles.dividerTitle}>
          🛠️ 实战项目展示
        </Heading>
        <p className={styles.dividerDesc}>
          <span className={styles.dividerHighlight}>实战项目</span> 提供生产级别的可落地方案，理论与实践结合，助你 <span className={styles.dividerHighlight}>快速进阶</span>
        </p>
      </div>
    </div>
  );
}

// 全新 Showcase 布局（图片更大、独立样式，不复用旧样式）
function ShowcaseSection({ project, index }) {
  const isEven = index % 2 === 0;
  const sectionRef = useRef(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    // 兼容性：不支持 IntersectionObserver 时直接显示
    if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
      el.classList.add(styles.isVisible);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add(styles.isVisible);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.2, root: null, rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className={styles.showcaseSection}>
      <div className={clsx('container', styles.showcaseContainer)}>
        <div
          className={clsx(
            styles.showcaseRow,
            { [styles.showcaseRowReverse]: !isEven }
          )}
        >
          <div className={styles.showcaseMedia}>
            <img
              src={project.image}
              alt={project.title}
              className={styles.showcaseImage}
            />
          </div>
          <div className={styles.showcaseText}>
            <div className={styles.showcaseHeader}> 
              <Heading as="h2" className={styles.showcaseTitle}>
                {project.title}
              </Heading>
              {project.subtitle && (
                <span className={styles.showcaseKicker}>{project.subtitle}</span>
              )}
            </div>
            <p className={styles.showcaseDesc}>{project.description}</p>
            <div className={styles.showcaseTags}>
              {project.features.map((f, i) => (
                <span key={i} className={styles.showcaseTag}>{f}</span>
              ))}
            </div>
            <div className={styles.showcaseActions}>
              {project.links.map((link, i) => (
                <Link
                  key={i}
                  to={link.to}
                  className={clsx(
                    'button',
                    i === 0 ? 'button--primary' : 'button--outline',
                    styles.showcaseBtn
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProjectSection({ project, index }) {
  const sectionRef = useRef(null);
  const isEven = index % 2 === 0;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.animate);
          }
        });
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section 
      ref={sectionRef}
      className={clsx(styles.projectSection, {
        [styles.projectSectionReverse]: !isEven
      })}
    >
      <div className="container">
        <div className={styles.projectContent}>
          <div className={styles.projectText}>
            <div className={styles.projectHeader}>
              <div className={styles.titleWithSubtitle}>
                <Heading as="h2" className={styles.projectTitle}>
                  {project.title}
                </Heading>
                <span className={styles.projectSubtitle}>
                  {project.subtitle}
                </span>
              </div>
            </div>
            <p className={styles.projectDescription}>
              {project.description}
            </p>
            <div className={styles.projectFeatures}>
              {project.features.map((feature, idx) => (
                <span key={idx} className={styles.featureTag}>
                  {feature}
                </span>
              ))}
            </div>
            <div className={styles.projectLinks}>
              {project.links.map((link, idx) => (
                <Link
                  key={idx}
                  to={link.to}
                  className={clsx(
                    'button',
                    idx === 0 ? 'button--primary' : 'button--outline',
                    styles.projectButton
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className={styles.projectImage}>
            <img 
              src={project.image} 
              alt={project.title}
              className={styles.projectImg}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  
  return (
    <Layout
      title="Java技术知识库与实战项目"
      description="超级八股文知识体系 + 高并发架构、AI智能分析等生产级项目实战教程">
      <div className="home-page">
        <main>
          {/* 顶部 Hero 区域 */}
          <HeroSection />
          
          {/* 超级八股文介绍 */}
          <BaguSection />
          
          {/* 实战项目分隔 */}
          <ProjectsDivider />
          
          {/* 实战项目展示 */}
          {projects.map((project, index) => (
            <ShowcaseSection
              key={project.id}
              project={project}
              index={index}
            />
          ))}
        </main>
      </div>
    </Layout>
  );
}
