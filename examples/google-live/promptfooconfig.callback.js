module.exports = /** @type {import('promptfoo').TestSuiteConfig} */ ({
  description: 'Function calling and callback execution demonstration',
  prompts: [
    'Please add the following numbers together: {{a}} and {{b}}',
    'What is the sum of {{a}} and {{b}}?',
  ],
  providers: [
    {
      id: 'google:live:gemini-2.0-flash-exp',
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 10000,
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
            return { sum: a + b };
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
          type: 'is-valid-function-call',
        },
        {
          type: 'contains',
          value: '11',
          transform: 'output.text',
        },
      ],
    },
    {
      vars: { a: 10, b: 20 },
      assert: [
        {
          type: 'is-valid-function-call',
        },
        {
          type: 'javascript',
          value: "output.text.includes('30')",
        },
      ],
    },
  ],
});
