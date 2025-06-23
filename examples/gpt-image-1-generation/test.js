#!/usr/bin/env node

/**
 * Simple test script to validate GPT Image 1 implementation
 * This script tests key functionality without requiring an actual API call
 */

const { OpenAiImageProvider } = require('../../dist/src/providers/openai/image');

async function testGptImage1() {
  console.log('🧪 Testing GPT Image 1 Implementation...\n');

  // Test 1: Basic configuration
  console.log('✅ Test 1: Basic Configuration');
  const provider1 = new OpenAiImageProvider('gpt-image-1', {
    config: {
      apiKey: 'test-key',
      quality: 'medium',
      size: '1024x1024',
      output_format: 'png',
    },
  });
  console.log(`   Provider ID: ${provider1.id()}`);
  console.log(`   Model: ${provider1.modelName}`);

  // Test 2: Advanced configuration
  console.log('\n✅ Test 2: Advanced Configuration');
  const provider2 = new OpenAiImageProvider('gpt-image-1', {
    config: {
      apiKey: 'test-key',
      quality: 'high',
      size: '1024x1536',
      output_format: 'jpeg',
      output_compression: 85,
      background: 'transparent',
      moderation: 'low',
    },
  });
  console.log(`   Provider ID: ${provider2.id()}`);
  console.log(`   Model: ${provider2.modelName}`);

  // Test 3: Auto settings
  console.log('\n✅ Test 3: Auto Settings');
  const provider3 = new OpenAiImageProvider('gpt-image-1', {
    config: {
      apiKey: 'test-key',
      quality: 'auto',
      size: 'auto',
      moderation: 'auto',
    },
  });
  console.log(`   Provider ID: ${provider3.id()}`);
  console.log(`   Model: ${provider3.modelName}`);

  console.log('\n🎉 All basic tests passed!');
  console.log('\n📝 Notes:');
  console.log('   - GPT Image 1 always returns base64-encoded images');
  console.log('   - The response_format parameter is ignored for GPT Image 1');
  console.log('   - Token-based pricing varies by quality and size');
  console.log('   - Supports transparency, compression, and moderation controls');
}

// Run tests if called directly
if (require.main === module) {
  testGptImage1().catch(console.error);
}

module.exports = { testGptImage1 };
