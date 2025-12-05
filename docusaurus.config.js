// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'JavaUp 技术&实战',
  tagline: '亮点十足的实战项目，已经帮助超多的小伙伴在技术上实现了up！拿到了offer！',
  favicon: 'img/favicon.ico',
  // 激活 mermaid
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      /** @type {import("@easyops-cn/docusaurus-search-local").PluginOptions} */
      ({
        // 开发模式下也启用搜索
        hashed: true,
        // 搜索中文内容
        language: ['en', 'zh'],
        // 高亮搜索结果
        highlightSearchTermsOnTargetPage: true,
        // 搜索结果数量限制
        searchResultLimits: 10,
        // 索引文档
        indexDocs: true,
        // 索引博客
        indexBlog: true,
        // 索引页面
        indexPages: false,
        // 文档路由基础路径
        docsRouteBasePath: '/',
      }),
    ],
  ],

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://javuap.chat',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // Handle broken links
  onBrokenLinks: 'warn', // 'throw' | 'log' | 'warn' | 'ignore'

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'javaUp', // Usually your GitHub org/user name.
  projectName: 'javaUp', // Usually your repo name.


  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: "/",
          //文档页面顶部的"面包屑导航"（比如 首页 > 大麦 > 项目概要介绍 > 当前文档）。
          //默认打开
          breadcrumbs: true,
          //打开折叠功能（显示箭头）
          sidebarCollapsible: true,
          //第一次渲染时展开类别，而不是折叠
          sidebarCollapsed: false,
          sidebarPath: './sidebars.js',
          // 开启"编辑此页"链接，指向 GitHub 仓库
          editUrl: 'https://github.com/shining-stars-l/javaup/edit/dev/',
          // 自定义编辑链接文本（可选）
          editLocalizedFiles: false
        },
        blog: false, // 禁用博客功能（不使用博客目录）
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  plugins: [
    function baiduAnalyticsPlugin() {
      return {
        name: 'baidu-analytics-plugin',
        injectHtmlTags() {
          return {
            headTags: [
              {
                tagName: 'script',
                innerHTML: `
var _hmt = _hmt || [];
(function() {
  var hm = document.createElement("script");
  hm.src = "https://hm.baidu.com/hm.js?5caf2a5b30be867073f28af7ed2b3026";
  var s = document.getElementsByTagName("script")[0]; 
  s.parentNode.insertBefore(hm, s);
})();
                `,
              },
            ],
          };
        },
        getClientModules() {
          return [require.resolve('./src/baidu-analytics-client.js')];
        },
      };
    },
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/logo.png',
      navbar: {
        title: 'JavaUp 技术&实战',
        logo: {
          alt: 'JavaUP Logo',
          src: 'img/logo.png',
        },
        items: [
          // {
          //   type: 'docSidebar',
          //   sidebarId: 'techniqueSharingSidebar',
          //   position: 'left',
          //   label: '技术分享讲解',
          // },
          {
            type: 'docSidebar',
            sidebarId: 'Java相关',
            position: 'left',
            label: 'Java相关',
          },
          {
            type: 'docSidebar',
            sidebarId: '开发工具',
            position: 'left',
            label: '开发工具',
          },
          {
            type: 'docSidebar',
            sidebarId: '基础内功',
            position: 'left',
            label: '基础内功',
          },
          {
            type: 'docSidebar',
            sidebarId: '数据库',
            position: 'left',
            label: '数据库',
          },
          {
            type: 'docSidebar',
            sidebarId: '框架中间件',
            position: 'left',
            label: '框架中间件',
          },
          {
            type: 'docSidebar',
            sidebarId: '进阶设计与性能优化',
            position: 'left',
            label: '进阶设计与性能优化',
          },
          {
            type: 'dropdown',
            label: '👍 实战项目介绍',
            position: 'left',
            items: [
              {
                type: 'docSidebar',
                sidebarId: 'hmdpPlusSidebar',
                label: '黑马点评升级版 (解决各种疑难杂症)',
              },
              {
                type: 'docSidebar',
                sidebarId: 'daMaiSidebar',
                label: '大麦 (解决各种高并发问题)',
              },
              {
                type: 'docSidebar',
                sidebarId: 'daMaiAiSidebar',
                label: '大麦AI (带你玩转各种AI实战)',
              },
              {
                type: 'docSidebar',
                sidebarId: 'linkFlowSidebar',
                label: 'link-flow (灵活切换请求的流量)',
              },
              {
                type: 'docSidebar',
                sidebarId: 'dockDataCenterSidebar',
                label: 'dock-data-center (数据收集的灵活适配)',
              },
            ],
          },
          {
            type: 'docSidebar',
            sidebarId: 'howToStudySidebar',
            position: 'left',
            label: '📚️ 如何学习',
          },
          {
            type: 'doc',
            docId: '如何学习/学习介绍/领取优惠券提醒！',
            position: 'left',
            label: '💰 优惠券领取',
          },
          {
            type: 'dropdown',
            label: '仓库地址',
            position: 'right',
            items: [
              {
                label: 'Gitee',
                href: 'https://gitee.com/java-up-up/javaup',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/shining-stars-l/javaup',
              },
            ],
          },
          {
            type: 'dropdown',
            label: '视频学习',
            position: 'right',
            items: [
              {
                label: 'B站',
                href: 'https://space.bilibili.com/265605735',
              },
              {
                label: '抖音',
                href: 'https://v.douyin.com/GqOL-QOUVaE/ 1@8.com :7pm',
              },
            ],
          },
        ],
      },
      footer: {
        style: 'light',
        copyright: `Copyright © ${new Date().getFullYear()} 阿星不是程序员 <a href="https://beian.miit.gov.cn/" target="_blank">京ICP备2024068560号-1</a> <a href="https://beian.mps.gov.cn/#/query/webSearch" target="_blank">京公网安备11011402054112号</a>`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['java', 'properties', 'yaml', 'lua'],
      },
    }),
};

export default config;
