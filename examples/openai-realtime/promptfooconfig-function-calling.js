module.exports = /** @type {import('promptfoo').TestSuiteConfig} */ ({
  description: 'OpenAI Realtime API function-calling demonstration',
  prompts: ['file://realtime-input.json'],
  providers: [
    {
      id: 'openai:realtime:gpt-realtime-1.5',
      config: {
        modalities: ['text'],
        instructions: 'You are a helpful assistant. Use the weather tool when asked about weather.',
        websocketTimeout: 60000,
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the current weather for a location',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The city and state, e.g. San Francisco, CA',
                },
              },
              required: ['location'],
            },
          },
        ],
        tool_choice: 'auto',
        functionCallHandler: async (name, args) => {
          if (name !== 'get_weather') {
            return JSON.stringify({ error: `Unknown function: ${name}` });
          }

          const { location } = JSON.parse(args);
          return JSON.stringify({
            location,
            temperature: '72 F',
            condition: 'sunny',
          });
        },
      },
    },
  ],
  tests: [
    {
      vars: {
        question: "What's the weather like in San Francisco?",
      },
      assert: [
        {
          type: 'icontains',
          value: 'sunny',
        },
      ],
    },
  ],
});
