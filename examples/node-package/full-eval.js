import fs from 'node:fs';

import promptfoo from '../../dist/src/index.js';

const prompts = [
  // Prompts can be raw text...
  'Write a haiku about: {{body}}',

  // Or message arrays...
  [
    {
      role: 'system',
      content: 'You are speaking to a time traveler. Begin your conversation.',
    },
    {
      role: 'user',
      content: '{{body}}',
    },
  ],

  // Or files
  'file://prompt.txt',

  // Or functions
  (vars) => {
    const genres = ['fantasy', 'sci-fi', 'mystery', 'horror'];
    const characters = {
      fantasy: 'wizard',
      'sci-fi': 'alien',
      mystery: 'detective',
      horror: 'ghost',
    };
    const genre = genres[Math.floor(Math.random() * genres.length)];
    const character = characters[genre];
    return [
      {
        role: 'system',
        content: `You have encountered a ${character} in a ${genre} setting. Engage with the character using the knowledge typical for that genre.`,
      },
      {
        role: 'user',
        content: '{{body}}',
      },
    ];
  },
];

const customFunction = (prompt, context) => {
  // Call an LLM API in this function, or any other logic.
  console.log(`Prompt: ${prompt}, vars: ${JSON.stringify(context.vars)}`);
  return {
    output: '<LLM output>',
  };
};
customFunction.label = 'My custom function';

const providers = [
  // Call the OpenAI API GPT 3.5
  'openai:gpt-3.5-turbo',

  // Or use a custom function.
  customFunction,
];

const tests = [
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
          // Logic for checking LLM output goes here...
          const pass = output.includes('foo bar');
          return {
            pass,
            score: pass ? 1.0 : 0.0,
            reason: pass ? 'Output contained substring' : 'Output did not contain substring',
          };
        },
      },
    ],
  },
];

(async () => {
  const results = await promptfoo.evaluate({
    prompts,
    providers,
    tests,

    // Persist results locally so they are visible in the promptfoo viewer
    writeLatestResults: true,
  });

  console.log('RESULTS:');
  const resultsString = JSON.stringify(results, null, 2);
  console.log(resultsString);

  fs.writeFileSync('output.json', resultsString);
  console.log('Wrote output.json');
})();
