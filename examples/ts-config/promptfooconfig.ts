import type { UnifiedConfig } from 'promptfoo';

const config: UnifiedConfig = {
  description: 'Creative translation experiments',
  prompts: [
    'Rephrase this in {{language}}: {{text}}',
    'Translate this to conversational {{language}}: {{text}}',
  ],
  providers: ['openai:gpt-4o-mini', 'anthropic:claude-3-5-sonnet-20241022', 'openai:o3-mini'],
  tests: [
    {
      vars: {
        language: 'Valley Girl speak',
        text: 'The weather is nice today',
      },
    },
    {
      vars: {
        language: 'Medieval knight',
        text: 'I need to go to the store',
      },
    },
    {
      vars: {
        language: 'Baby Yoda speak',
        text: 'This is very important',
      },
    },
    {
      vars: {
        language: 'Corporate buzzword',
        text: "Let's work together",
      },
    },
  ],
};

export default config;
