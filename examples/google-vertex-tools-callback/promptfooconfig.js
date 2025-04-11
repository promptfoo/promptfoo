module.exports = /** @type {import('promptfoo').TestSuiteConfig} */ ({
  description: 'Function calling and callback execution demonstration',
  prompts: [
    'Please add the following numbers together: {{a}} and {{b}}',
    'What is the sum of {{a}} and {{b}}?',
  ],
  providers: [
    {
      id: 'vertex:gemini-2.0-flash-001',
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'addNumbers',
                description: 'Add two numbers together',
                parameters: {
                  type: 'object',
                  properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                  },
                  required: ['a', 'b'],
                },
              },
            ],
          },
        ],
        functionToolCallbacks: {
          addNumbers: (parametersJsonString) => {
            const { a, b } = JSON.parse(parametersJsonString);
            return JSON.stringify(a + b);
          },
        },
      },
    },
  ],
  tests: [
    {
      vars: { a: 5, b: 6 },
      assert: [
        {
          type: 'equals',
          value: '11',
        },
      ],
    },
    {
      vars: { a: 10, b: 20 },
      assert: [
        {
          type: 'javascript',
          value: "output.includes('30')",
        },
      ],
    },
  ],
});
