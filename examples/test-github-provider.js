#!/usr/bin/env node

/**
 * Test script for GitHub Models provider
 * 
 * Usage: 
 *   export GITHUB_TOKEN=your_token_here
 *   npx promptfoo eval examples/github-models-test.yaml
 *
 * This demonstrates how to use GitHub Models with promptfoo.
 * For a simple test, you can also use:
 *   npx promptfoo eval --providers github:openai/gpt-4.1-mini --prompts "Write a haiku about {{topic}}" --tests '[{"vars": {"topic": "coding"}}]'
 */

console.log('GitHub Models Provider Test\n');
console.log('To test the GitHub Models provider, run:');
console.log('  export GITHUB_TOKEN=your_github_token');
console.log('  npx promptfoo eval examples/github-models-test.yaml\n');
console.log('Or for a quick test:');
console.log('  npx promptfoo eval --providers github:openai/gpt-4.1-mini --prompts "Say hello" --tests \'[{"vars": {}}]\'\n');

if (!process.env.GITHUB_TOKEN) {
  console.log('⚠️  Warning: GITHUB_TOKEN not set. API calls will fail.');
  console.log('Get a token from: https://github.com/settings/tokens');
  console.log('Required scope: models:read (for fine-grained PATs)');
}