// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const { themes } = require('prism-react-renderer');
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.duotoneDark;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'promptfoo',
  tagline: 'Test your prompts',
  favicon: '/favicon.ico',

  // Set the production url of your site here
  url: 'https://www.promptfoo.dev',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  trailingSlash: true,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'promptfoo', // Usually your GitHub org/user name.
  projectName: 'promptfoo', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  onBrokenAnchors: 'throw',
  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: 'true',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap',
      },
    },
  ],

  scripts: [
    {
      src: '/js/scripts.js',
      async: true,
    },
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/promptfoo/promptfoo/tree/main/site',
          sidebarCollapsed: false,
        },
        blog: {
          showReadingTime: false,
          blogSidebarCount: 0,
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          //editUrl:
          //  'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        gtag:
          process.env.NODE_ENV === 'development'
            ? undefined
            : {
                trackingID: 'G-3TS8QLZQ93',
                anonymizeIP: true,
              },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/thumbnail.png',
      navbar: {
        title: 'promptfoo',
        logo: {
          alt: 'promptfoo logo',
          src: 'img/logo-panda.svg',
        },
        items: [
          /*
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Tutorial',
          },
          */
          {
            type: 'dropdown',
            label: 'Product',
            position: 'left',
            items: [
              {
                to: '/security/',
                label: 'Gen AI Security',
              },
              {
                to: '/llm-vulnerability-scanner/',
                label: 'Vulnerability Scanner',
              },
              {
                to: '/docs/getting-started/',
                label: 'LLM Evaluations',
              },
            ],
          },
          {
            type: 'dropdown',
            label: 'Company',
            position: 'left',
            items: [
              {
                href: '/about/',
                label: 'About',
              },
              {
                href: '/blog/',
                label: 'Blog',
              },
              {
                href: '/press/',
                label: 'Press',
              },
              {
                href: '/contact/',
                label: 'Contact',
              },
              {
                href: '/careers/',
                label: 'Careers',
              },
            ],
          },
          {
            type: 'dropdown',
            label: 'Resources',
            position: 'left',
            items: [
              {
                href: '/docs/intro/',
                label: 'Docs',
              },
              {
                href: 'https://github.com/promptfoo/promptfoo',
                label: 'GitHub',
              },
              {
                href: 'https://discord.gg/promptfoo',
                label: 'Discord',
              },
            ],
          },
          { to: '/pricing/', label: 'Enterprise', position: 'left' },
          {
            href: 'https://github.com/promptfoo/promptfoo',
            position: 'right',
            className: 'header-github-link',
            'aria-label': 'GitHub repository',
          },
          {
            href: 'https://discord.gg/promptfoo',
            position: 'right',
            className: 'header-discord-link',
            'aria-label': 'Discord community',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Product',
            items: [
              {
                label: 'Docs',
                to: '/docs/intro/',
              },
              {
                label: 'Command Line',
                to: '/docs/getting-started/',
              },
              {
                label: 'Node Package',
                to: '/docs/usage/node-package/',
              },
              {
                label: 'Enterprise',
                href: '/pricing/',
              },
              {
                label: 'Status',
                href: 'https://status.promptfoo.dev',
              },
            ],
          },
          {
            title: 'Resources',
            items: [
              {
                label: 'LLM Red Teaming',
                to: '/docs/red-team',
              },
              {
                label: 'Running Benchmarks',
                to: '/docs/guides/llama2-uncensored-benchmark-ollama',
              },
              {
                label: 'Evaluating Factuality',
                to: '/docs/guides/factuality-eval',
              },
              {
                label: 'Evaluating RAGs',
                to: '/docs/guides/evaluate-rag',
              },
              {
                label: 'Minimizing Hallucinations',
                to: '/docs/guides/prevent-llm-hallucations',
              },
              {
                label: 'Config Validator',
                to: '/validator',
              },
            ],
          },
          {
            title: 'Company',
            items: [
              {
                label: 'About',
                to: '/about/',
              },
              {
                label: 'Blog',
                to: '/blog/',
              },
              {
                label: 'Press',
                to: '/press/',
              },
              {
                label: 'Contact',
                to: '/contact/',
              },
              {
                label: 'Careers',
                to: '/careers/',
              },
            ],
          },
          {
            title: 'Legal & Social',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/promptfoo/promptfoo',
              },
              {
                label: 'Discord',
                href: 'https://discord.gg/promptfoo',
              },
              {
                label: 'LinkedIn',
                href: 'https://www.linkedin.com/company/promptfoo/',
              },
              {
                label: 'Privacy Policy',
                to: '/privacy/',
              },
              {
                label: 'Terms of Service',
                to: '/terms-of-service/',
              },
              {
                html: `
                <div style="position: relative; margin-top:8px">
                  <span style="position: absolute; left: 65px; top: 25px; font-size: 10px; font-weight: bold; background-color: #25842c; padding: 2px 4px; border-radius: 4px;">In Progress</span>
                  <img loading="lazy" src="/img/badges/soc2.png" alt="SOC2 Compliance in progress" style="width:80px; height: auto"/>
                </div>
                `,
              },
            ],
          },
        ],
        copyright: `© ${new Date().getFullYear()} promptfoo`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: [
          'bash',
          'javascript',
          'typescript',
          'python',
          'json',
          'yaml',
          'markup-templating',
          'liquid',
        ],
      },
      zoom: {
        selector: '.markdown :not(em) > img:not(.no-zoom)',
      },
      algolia: {
        // The application ID provided by Algolia
        appId: 'VPUDC1V4TA',

        // Public API key: it is safe to commit it
        apiKey: '0b4fcfd05976eb0aaf4b7c51ec4fcd23',

        indexName: 'promptfoo',
      },
    }),
  plugins: [
    require.resolve('docusaurus-plugin-image-zoom'),
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [
          {
            from: '/docs/category/troubleshooting',
            to: '/docs/usage/troubleshooting',
          },
          {
            from: '/docs/providers/palm',
            to: '/docs/providers/google',
          },
        ],
      },
    ],
  ],

  // Mermaid diagram support
  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],
};

module.exports = config;
