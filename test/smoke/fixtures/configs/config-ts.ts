/**
 * TypeScript config using export default (2.4.1)
 *
 * Uses inline type to avoid depcheck issues with 'promptfoo' import.
 * In real usage, you would import from 'promptfoo':
 * import type { UnifiedConfig } from 'promptfoo';
 */

interface UnifiedConfig {
  description?: string;
  providers: string[];
  prompts: string[];
  tests: Array<{
    vars: Record<string, string>;
    assert: Array<{ type: string; value: string }>;
  }>;
}

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
