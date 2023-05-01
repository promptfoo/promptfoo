import promptfoo from '../../dist/index.js';

(async () => {
  const results = await promptfoo.evaluate('openai:chat', {
    prompt: ['Rephrase this in French: {{body}}', 'Rephrase this like a pirate: {{body}}'],
    vars: [{ body: 'Hello world' }, { body: "I'm hungry" }],
  });
  console.log('RESULTS:');
  console.log(results);
})();
