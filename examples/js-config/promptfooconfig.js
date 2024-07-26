module.exports = {
  description: 'A translator built with LLM',
  prompts: ['prompts.txt'],
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
