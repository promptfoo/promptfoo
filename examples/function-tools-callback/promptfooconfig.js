module.exports = /** @type {import('promptfoo').TestSuiteConfig} */ ({
  prompts: [
    'Please add the following numbers together: {{a}} and {{b}}',
    'What is the sum of {{a}} and {{b}}?',
    'Perform a mathematical operation on these numbers: {{numbers}}',
  ],
  providers: [
    {
      id: 'openai:gpt-4o-mini',
      config: {
        model: 'gpt-4o-mini',
        temperature: 0,
        tools: [
          {
            type: 'function',
            function: {
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
          },
        ],
        tool_choice: 'auto',
        functionToolCallbacks: {
          addNumbers: (parametersJsonString) => {
            const { a, b } = JSON.parse(parametersJsonString);
            return JSON.stringify(a + b);
          },
        },
      },
    },
    {
      id: 'openai:gpt-4',
      config: {
        functions: [
          {
            name: 'calculate',
            parameters: '{{ mathSchema | dump | safe }}',
          },
        ],
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
    {
      vars: {
        mathSchema: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['add', 'subtract'] },
            numbers: { type: 'array', items: { type: 'number' } },
          },
        },
        numbers: [1, 2, 3],
      },
      assert: [
        {
          type: 'is-valid-openai-function-call',
        },
      ],
    },
  ],
});
