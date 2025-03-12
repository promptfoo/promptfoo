#!/usr/bin/env node

/**
 * Test script for SageMaker provider integration
 * 
 * This script performs a simple test using the SageMaker provider to validate
 * that your endpoint is working correctly with promptfoo.
 * 
 * Usage:
 *   node test-sagemaker-provider.js --endpoint=your-endpoint-name --region=us-east-1 --model-type=openai
 */

const { evaluate } = require('promptfoo');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  if (key && value) {
    acc[key.replace(/^--/, '')] = value;
  }
  return acc;
}, {});

// Validate required parameters
if (!args.endpoint) {
  console.error('ERROR: --endpoint parameter is required');
  printUsage();
  process.exit(1);
}

// Set defaults for optional parameters
const region = args.region || process.env.AWS_REGION || 'us-east-1';
const modelType = args['model-type'] || 'custom';
const isEmbedding = args.embedding === 'true';
const temperature = parseFloat(args.temperature || '0.7');
const maxTokens = parseInt(args['max-tokens'] || '256', 10);
const useTransform = args.transform === 'true';
const transformFile = args['transform-file'];

console.log(`\n🧪 Testing SageMaker provider with endpoint: ${args.endpoint}`);
console.log(`   Region: ${region}`);
console.log(`   Model type: ${modelType}`);
console.log(`   Embedding: ${isEmbedding}`);
console.log(`   Temperature: ${temperature}`);
console.log(`   Max tokens: ${maxTokens}`);
console.log(`   Using transform: ${useTransform}`);
if (transformFile) {
  console.log(`   Transform file: ${transformFile}`);
}

async function runTest() {
  try {
    // Configure the provider ID and config
    const providerId = isEmbedding 
      ? `sagemaker:embedding:${args.endpoint}` 
      : `sagemaker:${modelType}:${args.endpoint}`;

    console.log(`\n📝 Using provider ID: ${providerId}`);

    // Basic provider config
    const providerConfig = {
      region,
      temperature,
      maxTokens,
    };

    // Add transform if requested
    if (useTransform) {
      if (transformFile) {
        // Use file-based transform
        providerConfig.transform = `file://${transformFile}`;
      } else {
        // Use inline transform based on model type
        switch(modelType) {
          case 'llama':
            providerConfig.transform = "return `<s>[INST] ${prompt} [/INST]`;";
            break;
          case 'anthropic':
            providerConfig.transform = "return `\\n\\nHuman: ${prompt}\\n\\nAssistant:`;";
            break;
          case 'jumpstart':
            providerConfig.transform = `
              return {
                inputs: prompt,
                parameters: {
                  max_new_tokens: ${maxTokens},
                  temperature: ${temperature},
                  top_p: 0.9,
                  do_sample: true
                }
              };
            `;
            break;
          default:
            providerConfig.transform = "return `SYSTEM: Be helpful and concise.\\nUSER: ${prompt}`;";
        }
      }
    }

    // Add response format for JumpStart
    if (modelType === 'jumpstart') {
      providerConfig.responseFormat = {
        path: "$.generated_text"
      };
    }

    // Set up basic evaluation config
    const config = {
      providers: [
        {
          id: providerId,
          config: providerConfig
        }
      ],
      prompts: ["Generate a short response about the following topic: {{topic}}"],
      tests: [
        { vars: { topic: "artificial intelligence" } }
      ]
    };

    // Special config for embedding tests
    if (isEmbedding) {
      config.tests[0].assert = [
        {
          type: "similar",
          value: "AI is a branch of computer science that aims to create systems capable of performing tasks that would normally require human intelligence.",
          threshold: 0.5
        }
      ];
    }

    console.log('\n🚀 Running evaluation...');
    
    // Run the evaluation
    const result = await evaluate(config);

    // Display the result
    if (result.results && result.results.length > 0) {
      console.log('\n✅ Test successful!');
      
      const firstResult = result.results[0];
      
      if (isEmbedding) {
        console.log('\n📊 Embedding similarity test result:');
        console.log(`   Score: ${firstResult.score}`);
        console.log(`   Passed: ${firstResult.pass ? 'Yes' : 'No'}`);
      } else {
        console.log('\n📝 Response from SageMaker endpoint:');
        console.log('───────────────────────────────────────────────────');
        console.log(firstResult.outputs[0].output);
        console.log('───────────────────────────────────────────────────');
      }
      
      // Show the transformed prompt if available in metadata
      if (firstResult.outputs[0].metadata?.transformApplied) {
        console.log('\n🔄 Transform was applied:');
        
        if (typeof firstResult.outputs[0].metadata.originalPrompt === 'string') {
          console.log('\n   Original prompt:');
          console.log('   ───────────────────────────────────────────────────');
          console.log('   ' + firstResult.outputs[0].metadata.originalPrompt);
          console.log('   ───────────────────────────────────────────────────');
        }
        
        if (firstResult.outputs[0].metadata.transformedPrompt) {
          console.log('\n   Transformed prompt:');
          console.log('   ───────────────────────────────────────────────────');
          
          const transformedPrompt = firstResult.outputs[0].metadata.transformedPrompt;
          if (typeof transformedPrompt === 'string') {
            console.log('   ' + transformedPrompt);
          } else {
            console.log('   ' + JSON.stringify(transformedPrompt, null, 2).replace(/\n/g, '\n   '));
          }
          
          console.log('   ───────────────────────────────────────────────────');
        }
      }
      
      if (firstResult.outputs[0].tokenUsage) {
        console.log('\n📊 Token usage:');
        console.log(`   Prompt tokens: ${firstResult.outputs[0].tokenUsage.prompt || 'unknown'}`);
        console.log(`   Completion tokens: ${firstResult.outputs[0].tokenUsage.completion || 'unknown'}`);
        console.log(`   Total tokens: ${firstResult.outputs[0].tokenUsage.total || 'unknown'}`);
      }
    } else {
      console.log('\n❌ Test failed: No results returned');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

function printUsage() {
  console.log(`
Usage:
  node test-sagemaker-provider.js --endpoint=your-endpoint-name [options]

Required:
  --endpoint=ENDPOINT_NAME      Name of your SageMaker endpoint

Options:
  --region=REGION              AWS region (default: from env or 'us-east-1')
  --model-type=TYPE            Model type: openai, anthropic, llama, huggingface, custom (default: 'custom')
  --embedding=true|false       Test as embedding endpoint (default: false)
  --temperature=VALUE          Temperature setting (default: 0.7)
  --max-tokens=VALUE           Max tokens to generate (default: 256)
  --transform=true|false       Use a transform function (default: false)
  --transform-file=PATH        Path to a custom transform file (e.g., transform.js)

Examples:
  node test-sagemaker-provider.js --endpoint=my-openai-endpoint --model-type=openai
  node test-sagemaker-provider.js --endpoint=my-embedding-endpoint --embedding=true
  node test-sagemaker-provider.js --endpoint=my-llama-endpoint --model-type=llama --transform=true
  node test-sagemaker-provider.js --endpoint=my-endpoint --transform=true --transform-file=transform.js
  `);
}

// Run the test
runTest();