// For TypeScript users:
// To get type checking, uncomment the following line and the satisfies clause below
// import type { TestCase } from 'promptfoo';
export default [
  {
    vars: {
      target_language: 'French',
      text: 'Hello world',
    },
    assert: [{ type: 'contains', value: 'Bonjour' }],
    description: 'Basic French translation',
  },
  {
    vars: {
      target_language: 'Spanish',
      text: 'Good morning',
    },
    assert: [{ type: 'contains', value: 'Buenos días' }],
    description: 'Basic Spanish translation',
  },
]; // satisfies TestCase[];
