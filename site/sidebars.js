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
      collapsed: true,
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
        type: 'doc',
        id: 'providers/index',
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
      collapsed: true,
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
          label: 'Privacy & Access Control',
          collapsed: true,
          items: [
            'red-team/plugins/ascii-smuggling',
            'red-team/plugins/bfla',
            'red-team/plugins/bola',
            'red-team/plugins/cross-session-leak',
            'red-team/plugins/debug-access',
            'red-team/plugins/divergent-repetition',
            'red-team/plugins/hijacking',
            'red-team/plugins/indirect-prompt-injection',
            'red-team/plugins/pii',
            'red-team/plugins/prompt-extraction',
            'red-team/plugins/rbac',
            'red-team/plugins/reasoning-dos',
            'red-team/plugins/shell-injection',
            'red-team/plugins/sql-injection',
            'red-team/plugins/ssrf',
            'red-team/plugins/system-prompt-override',
            'red-team/plugins/tool-discovery',
          ],
        },
        {
          type: 'category',
          label: 'Trust, Safety, & Compliance',
          collapsed: true,
          items: [
            'red-team/plugins/beavertails',
            'red-team/plugins/contracts',
            'red-team/plugins/cyberseceval',
            'red-team/plugins/harmbench',
            'red-team/plugins/harmful',
            'red-team/plugins/pliny',
            'red-team/plugins/politics',
            'red-team/plugins/religion',
          ],
        },
        {
          type: 'category',
          label: 'Brand & Reputation',
          collapsed: true,
          items: [
            'red-team/plugins/competitors',
            'red-team/plugins/excessive-agency',
            'red-team/plugins/hallucination',
            'red-team/plugins/imitation',
            'red-team/plugins/overreliance',
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
      items: [
        {
          type: 'category',
          label: 'Single-Turn',
          collapsed: true,
          items: [
            'red-team/strategies/base64',
            'red-team/strategies/basic',
            'red-team/strategies/best-of-n',
            'red-team/strategies/citation',
            'red-team/strategies/gcg',
            'red-team/strategies/leetspeak',
            'red-team/strategies/likert',
            'red-team/strategies/math-prompt',
            'red-team/strategies/multilingual',
            'red-team/strategies/prompt-injection',
            'red-team/strategies/rot13',
          ],
        },
        {
          type: 'category',
          label: 'Conversational',
          collapsed: true,
          items: ['red-team/strategies/multi-turn', 'red-team/strategies/goat'],
        },
        {
          type: 'category',
          label: 'Agentic',
          collapsed: true,
          items: [
            'red-team/strategies/iterative',
            'red-team/strategies/tree',
            'red-team/strategies/composite-jailbreaks',
          ],
        },
        {
          type: 'category',
          label: 'Multimodal',
          collapsed: true,
          items: ['red-team/strategies/image', 'red-team/strategies/audio'],
        },
        {
          type: 'category',
          label: 'Custom',
          collapsed: true,
          items: ['red-team/strategies/custom'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Tools',
      collapsed: true,
      items: [
        {
          type: 'doc',
          id: 'red-team/guardrails',
        },
        {
          type: 'category',
          label: 'Model Scanner',
          collapsed: true,
          items: [
            {
              type: 'doc',
              id: 'model-audit/index',
            },
            {
              type: 'doc',
              id: 'model-audit/usage',
            },
            {
              type: 'doc',
              id: 'model-audit/scanners',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Troubleshooting',
      collapsed: true,
      items: [{ type: 'autogenerated', dirName: 'red-team/troubleshooting' }],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: true,
      items: [
        {
          type: 'doc',
          label: 'Application Red Teaming',
          id: 'guides/llm-redteaming',
        },
        {
          type: 'doc',
          label: 'RAG Red Teaming',
          id: 'red-team/rag',
        },
        {
          type: 'doc',
          label: 'Agentic Red Teaming',
          id: 'red-team/agents',
        },
        {
          type: 'doc',
          label: 'Multi-Modal Red Teaming',
          id: 'guides/multimodal-red-team',
        },
        {
          type: 'doc',
          label: 'Working with Multi-Modal Models',
          id: 'guides/multimodal-red-team',
        },
        {
          type: 'doc',
          label: 'Foundation Model Red Teaming',
          id: 'red-team/foundation-models',
        },
        {
          type: 'doc',
          label: 'Testing Guardrails',
          id: 'guides/testing-guardrails',
        },
      ],
    },
  ],
};

module.exports = sidebars;
