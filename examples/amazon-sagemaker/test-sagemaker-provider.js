#!/usr/bin/env node

/**
 * Test script for the SageMaker provider.
 * Shows how to use the provider with both Llama and Mistral models.
 */

// Import the SageMaker provider
const { SageMakerCompletionProvider } = require('../../src/providers/sagemaker');

// Define usage information
function printUsage() {
  console.log('Usage: node test-sagemaker-provider.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --model=<name>        Specify the model (llama or mistral, default: llama)');
  console.log('  --prompt=<text>       Specify the prompt text');
  console.log('  --max-tokens=<num>    Maximum tokens to generate (default: 256)');
  console.log('  --temperature=<num>   Temperature setting (default: 0.7)');
  console.log('');
}

// Process command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    model: 'llama',
    prompt: 'Generate a creative name for a coffee shop that specializes in caramel coffee.',
    maxTokens: 256,
    temperature: 0.7,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg.startsWith('--model=')) {
      options.model = arg.substring(8);
    } else if (arg.startsWith('--prompt=')) {
      options.prompt = arg.substring(9);
    } else if (arg.startsWith('--max-tokens=')) {
      options.maxTokens = Number.parseInt(arg.substring(13), 10);
    } else if (arg.startsWith('--temperature=')) {
      options.temperature = Number.parseFloat(arg.substring(14));
    }
  }

  return options;
}

async function testProvider() {
  try {
    const options = parseArgs();
    
    // Select the appropriate endpoint and configuration based on the model
    let endpointName;
    let modelType;
    let responsePath;
    
    if (options.model === 'mistral') {
      endpointName = 'jumpstart-dft-hf-llm-mistral-7b-v3-20250312-151238';
      modelType = 'huggingface';
      responsePath = '$[0].generated_text';
    } else {
      // Default to Llama
      endpointName = 'jumpstart-dft-llama-3-2-1b-instruct-20250312-032819';
      modelType = 'jumpstart';
      responsePath = '$.generated_text';
    }
    
    console.log(`Testing SageMaker provider with ${options.model} model`);
    console.log(`Endpoint: ${endpointName}`);
    console.log(`Prompt: ${options.prompt}`);
    
    // Create a provider instance
    const provider = new SageMakerCompletionProvider(
      endpointName,
      {
        config: {
          region: 'us-west-2',
          modelType,
          contentType: 'application/json',
          acceptType: 'application/json',
          maxTokens: options.maxTokens,
          temperature: options.temperature,
          responseFormat: {
            path: responsePath
          }
        }
      }
    );
    
    console.log('Provider ID:', provider.id());
    
    // Call the provider
    console.log('Calling provider...');
    const result = await provider.callApi(options.prompt);
    
    // Display the result
    console.log('Output:', result.output);
    console.log('Full result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error testing provider:', error);
    process.exit(1);
  }
}

// Run the test
testProvider();