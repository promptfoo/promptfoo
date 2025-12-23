/**
 * CJS config using module.exports object (2.3.1)
 */
module.exports = {
  description: 'Smoke test - CJS config format',
  providers: ['echo'],
  prompts: ['Hello from CJS config: {{name}}'],
  tests: [
    {
      vars: { name: 'CommonJS' },
      assert: [
        { type: 'contains', value: 'Hello from CJS' },
        { type: 'contains', value: 'CommonJS' },
      ],
    },
  ],
};
