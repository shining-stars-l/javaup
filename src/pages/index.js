import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';
import { useEffect, useRef, useState } from 'react';

// 项目数据配置
const projects = [
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

function AnimatedTitle() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const titleVariations = [
    { icon: '⚡', prefix: '掌握', highlight: '高并发技术', suffix: '轻松搞定项目难题' },
    { icon: '🤖', prefix: '构建', highlight: 'AI智能系统', suffix: '快速上手前沿技术' },
    { icon: '💫', prefix: '优化请求', highlight: '流量切换', suffix: '秒级部署生产环境' },
    { icon: '📊', prefix: '打造', highlight: '数据中台', suffix: '沉淀数据资产增长' },
    { icon: '💡', prefix: '提升', highlight: '架构能力', suffix: '事半功倍解决方案' }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % titleVariations.length);
        setIsTransitioning(false);
      }, 300);
      
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const currentVariation = titleVariations[currentIndex];

  return (
    <div className={styles.titleContainer}>
      <Heading as="h1" className={styles.heroTitle}>
        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>{currentVariation.icon}</div>
          <div className={styles.titleText}>
            <div className={styles.titleLine}>
              <span
                className={clsx(styles.titleAnimated, {
                  [styles.titleTransition]: isTransitioning,
                })}
              >
                {currentVariation.prefix}
              </span><span 
                className={clsx(styles.titleHighlight, {
                  [styles.titleTransition]: isTransitioning
                })}
              >
                {currentVariation.highlight}
              </span>
            </div>
            <div className={styles.titleLine}>
              <span 
                className={clsx(styles.titleAnimated, {
                  [styles.titleTransition]: isTransitioning
                })}
              >
                {currentVariation.suffix}
              </span>
            </div>
          </div>
        </div>
      </Heading>
    </div>
  );
}

function HeroSection() {
  const {siteConfig} = useDocusaurusContext();
  
  return (
    <section className={styles.hero}>
      <div className={styles.heroBackground}>
        <div className={styles.heroPattern}></div>
      </div>
      <div className="container">
        <div className={styles.heroContent}>
          <AnimatedTitle />
          <p className={styles.heroSubtitle}>
            <span className={styles.nowrap}>
              从 <span className={styles.subtitleHighlight}>高并发架构</span> 到 <span className={styles.subtitleHighlight}>数据中台</span> 与 <span className={styles.subtitleHighlight}>AI智能分析</span>
              <br/>
              从 <span className={styles.subtitleHighlight}>流量切换</span> 到 <span className={styles.subtitleHighlight}>微服务治理</span> 与 <span className={styles.subtitleHighlight}>可观测性</span>
            </span>
            <br/>
            每个项目都是 <span className={styles.subtitleHighlight}>生产级别</span> 的可落地开源方案
          </p>
          <div className={styles.heroButtons}>
            <Link
              className={clsx('button button--primary button--lg', styles.heroButton)}
              to="/how-to-study/intro/full-service">
              🎯 开始学习
            </Link>
          </div>
        </div>
      </div>
    </section>
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
      title="Java技术实战项目集合"
      description="高并发架构、AI智能分析、流量切换等生产级项目实战教程">
      <div className="home-page">
        <HeroSection />
        <main>
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