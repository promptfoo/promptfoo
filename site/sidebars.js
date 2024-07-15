/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

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
        { type: 'doc', id: 'red-team/index' },
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
      id: 'faq',
    },
  ],

  // But you can create a sidebar manually
  /*
  tutorialSidebar: [
    'intro',
    'hello',
    {
      type: 'category',
      label: 'Tutorial',
      items: ['tutorial-basics/create-a-document'],
    },
  ],
   */
};

module.exports = sidebars;
