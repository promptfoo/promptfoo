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
        gtag: {
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
          { to: '/docs/intro/', label: 'Docs', position: 'left' },
          { to: '/pricing/', label: 'Enterprise', position: 'left' },
          {
            to: '/llm-vulnerability-scanner/',
            label: 'Vulnerability Scanner',
            position: 'left',
          },
          {
            to: '/docs/red-team/',
            label: 'Red Teaming',
            position: 'left',
          },
          {
            href: '/blog/',
            label: 'Blog',
            position: 'left',
          },
          {
            href: 'https://github.com/promptfoo/promptfoo',
            label: 'GitHub',
            position: 'right',
          },
          {
            href: 'https://discord.gg/gHPS9jjfbs',
            label: 'Discord',
            position: 'right',
          },
          {
            href: '/contact/',
            label: 'Contact',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Intro',
                to: '/docs/intro',
              },
              {
                label: 'Command Line',
                to: '/docs/getting-started',
              },
              {
                label: 'Node Package',
                to: '/docs/usage/node-package',
              },
              {
                label: 'Privacy Policy',
                to: '/privacy',
              },
              {
                html: `
                <div style="position: relative; margin-top:8px">
                  <span style="position: absolute; left: 65px; top: 25px; font-size: 10px; font-weight: bold; background-color: #25842c; padding: 2px 4px; border-radius: 4px;">In Progress</span>
                  <img src="/img/badges/soc2.png" alt="SOC2 Compliance in progress" style="width:80px; height: auto"/>
                </div>
                `,
              },
            ],
          },
          {
            title: 'Guides & Tools',
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
                label: 'Promptfoo Config Validator',
                to: '/validator',
              },
            ],
          },
          {
            title: 'About',
            items: [
              {
                label: 'Blog',
                href: '/blog',
              },
              {
                label: 'Enterprise',
                href: '/pricing/',
              },
              {
                label: 'Contact Us',
                href: '/contact/',
              },
              {
                label: 'Careers',
                href: '/careers/',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/promptfoo/promptfoo',
              },
              {
                label: 'Discord',
                href: 'https://discord.gg/gHPS9jjfbs',
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
  plugins: [require.resolve('docusaurus-plugin-image-zoom')],
};

module.exports = config;
