import promptfoo from '../../dist/src/index.js';

(async () => {
  const results = await promptfoo.evaluate({
    prompts: ['Rephrase this in French: {{body}}', 'Rephrase this like a pirate: {{body}}'],
    providers: ['openai:gpt-3.5-turbo'],
    tests: [
      {
        vars: {
          body: 'Hello world',
        },
      },
      {
        vars: {
          body: "I'm hungry",
        },
      },
    ],
  });
  console.log('RESULTS:');
  console.log(results);
})();
