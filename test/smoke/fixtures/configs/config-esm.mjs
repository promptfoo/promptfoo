/**
 * ESM config using export default (2.3.5)
 */
export default {
  description: 'Smoke test - ESM config format',
  providers: ['echo'],
  prompts: ['Hello from ESM config: {{name}}'],
  tests: [
    {
      vars: { name: 'ESModule' },
      assert: [
        { type: 'contains', value: 'Hello from ESM' },
        { type: 'contains', value: 'ESModule' },
      ],
    },
  ],
};
