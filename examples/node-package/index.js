import promptfoo from '../../dist/src/index.js';

(async () => {
  const results = await promptfoo.evaluate(
    {
      prompts: [
        // Prompts can be raw text...
        'Rephrase this in French: {{body}}',
        'Rephrase this like a pirate: {{body}}',

        // Or OpenAI message objects...
        [
          {
            role: 'system',
            content: 'Pretend you are an Italian person and echo back any inputs',
          },
          {
            role: 'user',
            content: '{{body}}',
          },
        ],
      ],
      providers: [
        // Call the OpenAI API GPT 3.5
        'openai:gpt-3.5-turbo',

        // This function is a custom provider.
        // You can call an LLM API here, or do anything else you want.
        (prompt, context) => {
          console.log(`Prompt: ${prompt}, vars: ${JSON.stringify(context.vars)}`);
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
    },
    {
      // EvaluateOptions
      maxConcurrency: 2,
      progressCallback: (progress, total) => {
        console.log(`PROGRESS: ${progress} / ${total}`);
      },
    },
  );
  console.log('RESULTS:');
  console.log(JSON.stringify(results, null, 2));
})();
