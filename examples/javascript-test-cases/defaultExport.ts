
// Array of test cases
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
];
