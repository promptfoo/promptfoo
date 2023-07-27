import promptfoo from '../../dist/src/index.js';

(async () => {
  const results = await promptfoo.evaluate({
    prompts: ['Rephrase this in French: {{body}}', 'Rephrase this like a pirate: {{body}}'],
    providers: [
      'openai:gpt-3.5-turbo',
      (prompt) => {
        // Call LLM here...
        return {
          output: '<LLM output>',
        };
      },
    ],
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
        assert: [
          {
            type: 'javascript',
            value: (output) => {
              const pass = output.includes("J'ai faim");
              return {
                pass,
                score: pass ? 1.0 : 0.0,
                reason: pass ? 'Output contained substring' : 'Output did not contain substring',
              };
            },
          },
        ],
      },
    ],
  });
  console.log('RESULTS:');
  console.log(results);
})();
