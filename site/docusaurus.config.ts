import * as fs from 'fs';
import * as path from 'path';

import { themes } from 'prism-react-renderer';
import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';

const lightCodeTheme = themes.github;
const darkCodeTheme = themes.duotoneDark;

const config: Config = {
  title: 'Promptfoo',
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
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/promptfoo/promptfoo/tree/main/site',
          sidebarCollapsed: false,
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
          exclude: [
            '**/CLAUDE.md', // Exclude Claude Code context files
            '**/AGENTS.md', // Exclude AI agent instruction files
          ],
        },
        blog: {
          showReadingTime: false,
          blogSidebarCount: 0,
          postsPerPage: 20,
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          //editUrl:
          //  'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        // gtag disabled in preset - added as standalone plugin below for production only
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/thumbnail.png',
    colorMode: {
      defaultMode: 'light',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'promptfoo',
      logo: {
        alt: 'promptfoo logo',
        src: 'img/logo-panda.svg',
      },
      items: [
        {
          type: 'custom-navMenuCard',
          label: 'Products',
          position: 'left',
          items: [
            {
              to: '/red-teaming/',
              label: 'Red Teaming',
              description: 'Proactively identify and fix vulnerabilities in your AI applications',
            },
            {
              to: '/guardrails/',
              label: 'Guardrails',
              description: 'Real-time protection against jailbreaks and adversarial attacks',
            },
            {
              to: '/model-security/',
              label: 'Model Security',
              description: 'Comprehensive security testing and monitoring for AI models',
            },
            {
              to: '/mcp/',
              label: 'MCP Proxy',
              description: 'Secure proxy for Model Context Protocol communications',
            },
            {
              to: '/code-scanning/',
              label: 'Code Scanning',
              description: 'Find LLM vulnerabilities in your IDE and CI/CD',
            },
            {
              to: '/docs/getting-started/',
              label: 'Evaluations',
              description: 'Test and evaluate your prompts, models, and RAG pipelines',
            },
          ],
        },
        {
          type: 'custom-navMenuCard',
          label: 'Solutions',
          position: 'left',
          items: [
            {
              type: 'section-header',
              label: 'By Industry',
            },
            {
              to: '/solutions/healthcare/',
              label: 'Healthcare',
              description: 'HIPAA-compliant medical AI security',
            },
            {
              to: '/solutions/finance/',
              label: 'Financial Services',
              description: 'FINRA-aligned security testing',
            },
            {
              to: '/solutions/insurance/',
              label: 'Insurance',
              description: 'PHI protection & compliance',
            },
            {
              to: '/solutions/telecom/',
              label: 'Telecommunications',
              description: 'Voice & text AI agent security',
            },
          ],
        },
        {
          type: 'custom-navMenuCard',
          label: 'Company',
          position: 'left',
          items: [
            {
              href: '/about/',
              label: 'About',
              description: 'Learn about our mission and team',
            },
            {
              href: '/press/',
              label: 'Press',
              description: 'Media coverage and press releases',
            },
            {
              href: '/events/',
              label: 'Events',
              description: 'Meet the team at conferences and events',
            },
            {
              href: '/careers/',
              label: 'Careers',
              description: 'Join our growing team',
            },
            {
              to: '/store/',
              label: 'Swag',
              description: 'Official Promptfoo merch and swag',
            },
          ],
        },
        { to: '/docs/intro/', label: 'Docs', position: 'left' },
        { to: '/blog/', label: 'Blog', position: 'left' },
        { to: '/pricing/', label: 'Pricing', position: 'left' },
        {
          to: '/contact/',
          position: 'right',
          'aria-label': 'Book a Demo',
          label: 'Book a Demo',
          className: 'header-book-demo-link',
        },
        {
          to: 'https://promptfoo.app',
          position: 'right',
          'aria-label': 'Promptfoo App',
          label: 'Log in',
        },
        {
          type: 'custom-githubStars',
          position: 'right',
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
              label: 'Red Teaming',
              to: '/red-teaming/',
            },
            {
              label: 'Guardrails',
              to: '/guardrails/',
            },
            {
              label: 'Model Security',
              to: '/model-security/',
            },
            {
              label: 'Evaluations',
              to: '/docs/getting-started/',
            },
            {
              label: 'Enterprise',
              href: '/pricing/',
            },
            {
              label: 'MCP Proxy',
              to: '/mcp/',
            },
            {
              label: 'Status',
              href: 'https://status.promptfoo.app/',
            },
          ],
        },
        {
          title: 'Solutions',
          items: [
            {
              label: 'Healthcare',
              to: '/solutions/healthcare/',
            },
            {
              label: 'Financial Services',
              to: '/solutions/finance/',
            },
            {
              label: 'Insurance',
              to: '/solutions/insurance/',
            },
            {
              label: 'Telecommunications',
              to: '/solutions/telecom/',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'API Reference',
              to: '/docs/api-reference/',
            },
            {
              label: 'LLM Red Teaming',
              to: '/docs/red-team',
            },
            {
              label: 'Foundation Model Reports',
              to: 'https://www.promptfoo.dev/models/',
            },
            {
              label: 'Language Model Security DB',
              to: 'https://www.promptfoo.dev/lm-security-db/',
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
              to: '/docs/guides/prevent-llm-hallucinations',
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
              label: 'Release Notes',
              to: '/docs/releases/',
            },
            {
              label: 'Press',
              to: '/press/',
            },
            {
              label: 'Events',
              to: '/events/',
            },
            {
              label: 'Contact',
              to: '/contact/',
            },
            {
              label: 'Careers',
              to: '/careers/',
            },
            {
              label: 'Swag',
              to: '/store/',
            },
            {
              label: 'Log in',
              to: 'https://promptfoo.app',
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
              label: 'Trust Center',
              href: 'https://trust.promptfoo.dev',
            },
            {
              html: `
                <div style="display: flex; gap: 16px; align-items: center; margin-top: 12px;">
                  <img loading="lazy" src="/img/badges/soc2.png" alt="SOC2 Certified" style="width:80px; height: auto"/>
                  <img loading="lazy" src="/img/badges/iso27001.png" alt="ISO 27001 Certified" style="width:80px; height: auto"/>
                  <img loading="lazy" src="/img/badges/hipaa.png" alt="HIPAA Compliant" style="width:80px; height: auto"/>
                </div>
                `,
            },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Promptfoo, Inc.`,
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
  } satisfies Preset.ThemeConfig,

  plugins: [
    require.resolve('docusaurus-plugin-image-zoom'),
    require.resolve('./src/plugins/docusaurus-plugin-og-image'),
    // Only load gtag in production to avoid "window.gtag is not a function" errors in dev
    ...(process.env.NODE_ENV === 'development'
      ? []
      : [
          [
            '@docusaurus/plugin-google-gtag',
            {
              trackingID: ['G-3TS8QLZQ93', 'G-3YM29CN26E', 'AW-17347444171'],
              anonymizeIP: true,
            },
          ],
        ]),
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
          {
            from: '/docs',
            to: '/docs/intro',
          },
          {
            from: '/vegas-contact',
            to: 'https://triangular-manchego-867.notion.site/2395ae153a138028a8bef35f6889f6e6?pvs=105',
          },
          {
            from: '/docs/guides/prevent-llm-hallucations',
            to: '/docs/guides/prevent-llm-hallucinations',
          },
        ],
      },
    ],
    // Define the llms.txt plugin inline similar to the Prisma example
    async function llmsTxtPlugin(context) {
      return {
        name: 'llms-txt-plugin',
        loadContent: async () => {
          const { siteDir } = context;
          const docsDir = path.join(siteDir, 'docs');
          const allMdx: string[] = [];

          // Recursive function to get all mdx/md files
          const getMdFiles = async (dir: string): Promise<void> => {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                await getMdFiles(fullPath);
              } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
                const content = await fs.promises.readFile(fullPath, 'utf8');
                allMdx.push(content);
              }
            }
          };

          await getMdFiles(docsDir);
          return { allMdx };
        },
        postBuild: async ({ content, routesPaths, outDir }) => {
          // Type assertion to handle TypeScript type checking
          const pluginContent = content as { allMdx: string[] };
          const { allMdx } = pluginContent;

          // Write concatenated MDX content
          const concatenatedPath = path.join(outDir, 'llms-full.txt');
          await fs.promises.writeFile(concatenatedPath, allMdx.join('\n\n---\n\n'));

          // Process routes - use routesPaths which is a string[] of all routes
          const docsRoutes: string[] = [];

          // Filter for docs paths and generate entries
          for (const routePath of routesPaths) {
            if (routePath.startsWith('/docs/')) {
              // Extract a title from the route path as fallback
              const pathParts = routePath.split('/').filter(Boolean);
              const lastPart = pathParts[pathParts.length - 1];
              const title = lastPart
                .split('-')
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ');

              docsRoutes.push(`- [${title}](${routePath})`);
            }
          }

          // Build up llms.txt file
          const llmsTxt = `# ${context.siteConfig.title}\n\n## Docs\n\n${docsRoutes.join('\n')}`;

          // Write llms.txt file
          const llmsTxtPath = path.join(outDir, 'llms.txt');
          try {
            fs.writeFileSync(llmsTxtPath, llmsTxt);
            console.log('Successfully created llms.txt and llms-full.txt files.');
          } catch (err) {
            console.error('Error writing llms.txt file:', err);
            throw err;
          }
        },
      };
    },
    [
      '@docusaurus/plugin-content-blog',
      {
        id: 'releases',
        routeBasePath: 'releases',
        path: './releases',
        authorsMapPath: '../blog/authors.yml',
        blogTitle: 'Release Notes',
        blogDescription: 'promptfoo release notes and updates',
        blogSidebarCount: 0,
        blogSidebarTitle: 'Recent Releases',
        postsPerPage: 10,
        showReadingTime: false,
        feedOptions: {
          type: 'all',
          title: 'promptfoo Release Notes',
          description: 'Stay updated with the latest promptfoo releases',
          copyright: `© ${new Date().getFullYear()} promptfoo`,
          language: 'en',
        },
        editUrl: 'https://github.com/promptfoo/promptfoo/tree/main/site',
      },
    ],
  ],

  // Mermaid diagram support
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  themes: ['@docusaurus/theme-mermaid'],
};

export default config;
