module.exports = {
  providers: ['openai:chat:gpt-3.5-turbo'],
  prompts: ['./prompts.txt'],
  vars: './vars.csv',
  grader: 'openai:chat:gpt-4',
};
