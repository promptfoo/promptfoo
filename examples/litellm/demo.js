#!/usr/bin/env node

/**
 * Demo script showing how LiteLLM providers work in promptfoo
 * Run with: node examples/litellm/demo.js
 */

const { createLiteLLMProvider } = require('../../dist/src/providers/litellm');

console.log('LiteLLM Provider Demo\n');

// Create different types of providers
const providers = [
  {
    path: 'litellm:gpt-4',
    description: 'Default (chat) provider',
  },
  {
    path: 'litellm:chat:claude-3',
    description: 'Explicit chat provider',
  },
  {
    path: 'litellm:completion:text-davinci-003',
    description: 'Completion provider',
  },
  {
    path: 'litellm:embedding:text-embedding-3-small',
    description: 'Embedding provider',
  },
];

console.log('Creating LiteLLM providers...\n');

providers.forEach(({ path, description }) => {
  try {
    const provider = createLiteLLMProvider(path, {
      config: {
        config: {
          apiBaseUrl: 'http://localhost:4000',
        },
      },
    });
    
    console.log(`✓ ${description}`);
    console.log(`  Path: ${path}`);
    console.log(`  ID: ${provider.id()}`);
    console.log(`  Type: ${provider.constructor.name}`);
    console.log(`  Base URL: ${provider.config.apiBaseUrl}`);
    console.log('');
  } catch (error) {
    console.error(`✗ Failed to create provider for ${path}: ${error.message}`);
  }
});

console.log('\nDemo complete! These providers can be used in your promptfooconfig.yaml');
console.log('\nExample configuration:');
console.log(`
providers:
  # Chat completions
  - id: litellm:chat:gpt-4o-mini
    config:
      apiBaseUrl: http://localhost:4000
      
  # Embeddings for similarity checks  
  - id: litellm:embedding:text-embedding-3-small
    config:
      apiBaseUrl: http://localhost:4000
`); 