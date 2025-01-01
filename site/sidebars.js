/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

const { amber } = require('@mui/material/colors');

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  promptfoo: [
    {
      type: 'doc',
      id: 'intro',
    },
    {
      type: 'doc',
      id: 'installation',
    },
    {
      type: 'doc',
      id: 'getting-started',
    },
    /*
    {
      type: 'doc',
      id: 'key-concepts',
    },
    */
    {
      type: 'doc',
      id: 'cloud/index',
    },
    {
      type: 'category',
      label: 'Configuration',
      link: {
        type: 'generated-index',
      },
      items: [
        { type: 'doc', id: 'configuration/guide' },
        { type: 'doc', id: 'configuration/reference' },
        { type: 'doc', id: 'configuration/parameters' },
        { type: 'doc', id: 'configuration/chat' },
        { type: 'doc', id: 'configuration/datasets' },
        { type: 'doc', id: 'configuration/scenarios' },
        { type: 'doc', id: 'configuration/caching' },
        { type: 'doc', id: 'configuration/telemetry' },
      ],
    },
    {
      type: 'category',
      label: 'Usage',
      link: {
        type: 'generated-index',
      },
      items: [{ type: 'autogenerated', dirName: 'usage' }],
    },
    {
      type: 'category',
      label: 'Assertions & metrics',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'configuration/expected-outputs/index',
      },
      items: [{ type: 'autogenerated', dirName: 'configuration/expected-outputs' }],
    },
    {
      type: 'category',
      label: 'Providers',
      link: {
        type: 'generated-index',
        slug: '/providers',
      },
      collapsed: true,
      items: [{ type: 'autogenerated', dirName: 'providers' }],
    },
    {
      type: 'category',
      label: 'Integrations',
      link: {
        type: 'generated-index',
      },
      collapsed: true,
      items: [{ type: 'autogenerated', dirName: 'integrations' }],
    },
    {
      type: 'category',
      label: 'Red teaming',
      link: {
        type: 'generated-index',
      },
      items: [
        { type: 'autogenerated', dirName: 'red-team' },
        { type: 'doc', id: 'guides/llm-redteaming' },
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      link: {
        type: 'generated-index',
      },
      items: [{ type: 'autogenerated', dirName: 'guides' }],
    },
    {
      type: 'doc',
      id: 'contributing',
    },
    {
      type: 'doc',
      id: 'faq',
    },
  ],
  redTeamSidebar: [
    {
      type: 'doc',
      id: 'red-team/index',
    },
    {
      type: 'doc',
      id: 'red-team/quickstart',
    },
    {
      type: 'doc',
      id: 'red-team/configuration',
    },
    {
      type: 'doc',
      id: 'red-team/architecture',
    },
    {
      type: 'doc',
      id: 'red-team/guardrails',
    },
    {
      type: 'doc',
      id: 'red-team/llm-vulnerability-types',
    },
    {
      type: 'doc',
      id: 'red-team/owasp-llm-top-10',
    },
    {
      type: 'category',
      label: 'Plugins',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'red-team/plugins/index',
      },
      items: [
        {
          type: 'category',
          label: 'Security & Access Control',
          collapsed: true,
          items: [
            'red-team/plugins/bola',
            'red-team/plugins/bfla',
            'red-team/plugins/rbac',
            'red-team/plugins/debug-access',
            'red-team/plugins/shell-injection',
            'red-team/plugins/sql-injection',
            'red-team/plugins/ssrf',
            'red-team/plugins/indirect-prompt-injection',
            'red-team/plugins/ascii-smuggling',
            'red-team/plugins/hijacking',
            'red-team/plugins/pii',
            'red-team/plugins/cross-session-leak',
            'red-team/plugins/prompt-extraction',
            'red-team/plugins/divergent-repetition',
          ],
        },
        {
          type: 'category',
          label: 'Compliance & Legal',
          collapsed: true,
          items: ['red-team/plugins/harmful', 'red-team/plugins/contracts'],
        },
        {
          type: 'category',
          label: 'Trust & Safety',
          collapsed: true,
          items: [
            'red-team/plugins/pliny',
            'red-team/plugins/beavertails',
            'red-team/plugins/politics',
            'red-team/plugins/religion',
          ],
        },
        {
          type: 'category',
          label: 'Brand',
          collapsed: true,
          items: [
            'red-team/plugins/competitors',
            'red-team/plugins/hallucination',
            'red-team/plugins/overreliance',
            'red-team/plugins/excessive-agency',
            'red-team/plugins/imitation',
          ],
        },
        {
          type: 'category',
          label: 'Custom',
          collapsed: true,
          items: ['red-team/plugins/custom', 'red-team/plugins/intent'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Strategies',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'red-team/strategies/index',
      },
      items: [{ type: 'autogenerated', dirName: 'red-team/strategies' }],
    },
    {
      type: 'category',
      label: 'Troubleshooting',
      collapsed: true,
      items: [{ type: 'autogenerated', dirName: 'red-team/troubleshooting' }],
    },
    {
      type: 'doc',
      id: 'guides/llm-redteaming',
    },
    {
      type: 'doc',
      id: 'red-team/rag',
    },
    {
      type: 'doc',
      id: 'red-team/agents',
    },
  ],
};

module.exports = sidebars;
