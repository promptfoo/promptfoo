import type { UnifiedConfig } from 'promptfoo';

const config: UnifiedConfig = {
  description: 'A translator built with LLM',
  prompts: [
    'Rephrase this in {{language}}: {{body}}',
    'Translate this to conversational {{language}}: {{body}}',
  ],
  providers: ['openai:gpt-4o-mini'],
  tests: [
    {
      vars: {
        language: 'French',
        body: 'Hello world',
      },
    },
    {
      vars: {
        language: 'French',
        body: "I'm hungry",
      },
    },
    {
      vars: {
        language: 'Pirate',
        body: 'Hello world',
      },
    },
    {
      vars: {
        language: 'Pirate',
        body: "I'm hungry",
      },
    },
  ],
};

export default config;
