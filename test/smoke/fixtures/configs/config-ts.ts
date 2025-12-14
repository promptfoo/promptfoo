/**
 * TypeScript config using export default (2.4.1)
 */
import type { UnifiedConfig } from 'promptfoo';

const config: UnifiedConfig = {
  description: 'Smoke test - TypeScript config format',
  providers: ['echo'],
  prompts: ['Hello from TypeScript config: {{name}}'],
  tests: [
    {
      vars: { name: 'TypeScript' },
      assert: [
        { type: 'contains', value: 'Hello from TypeScript' },
        { type: 'contains', value: 'TypeScript' },
      ],
    },
  ],
};

export default config;
