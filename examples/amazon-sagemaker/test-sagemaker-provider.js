#!/usr/bin/env node

/**
 * Test script for the SageMaker provider.
 * Shows how to use the provider with both Llama and Mistral models.
 */

const { ArgumentParser } = require('argparse');
const {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} = require('../../dist/providers/sagemaker');

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
  const parser = new ArgumentParser({
    description: 'Test SageMaker provider',
  });

  parser.add_argument('--endpoint', {
    help: 'SageMaker endpoint name',
    default: 'your-endpoint-name',
  });
  parser.add_argument('--region', { help: 'AWS region', default: 'us-west-2' });
  parser.add_argument('--model-type', {
    help: 'Model type',
    choices: ['openai', 'anthropic', 'llama', 'huggingface', 'jumpstart', 'custom'],
    default: 'custom',
    dest: 'modelType',
  });
  parser.add_argument('--embedding', {
    help: 'Test embedding endpoint',
    action: 'store_true',
  });
  parser.add_argument('--transform', {
    help: 'Test transform functionality',
    action: 'store_true',
  });
  parser.add_argument('--transform-file', {
    help: 'Path to transform file',
    default: 'transform.js',
    dest: 'transformFile',
  });
  parser.add_argument('--response-path', {
    help: 'Response path expression',
    default: 'json.generated_text',
    dest: 'responsePath',
  });

  const args = parser.parse_args();

  return args;
}

async function testSageMaker() {
  const args = parseArgs();

  console.log(`Testing SageMaker provider with endpoint: ${args.endpoint}`);
  console.log(`Region: ${args.region}`);
  console.log(`Model type: ${args.modelType}`);

  // Test prompt
  const prompt = 'Generate a creative name for a coffee shop that specializes in caramel coffee.';

  try {
    if (args.embedding) {
      // Test embedding functionality
      console.log('Testing embedding endpoint...');
      const provider = new SageMakerEmbeddingProvider(args.endpoint, {
        config: {
          region: args.region,
          modelType: args.modelType,
          responseFormat: {
            path: args.responsePath,
          },
        },
        transform: args.transform
          ? args.transformFile.startsWith('file://')
            ? args.transformFile
            : `file://${args.transformFile}`
          : undefined,
      });

      const result = await provider.callEmbeddingApi(prompt);
      console.log('Embedding result:');
      console.log(`Success: ${!result.error}`);
      if (result.error) {
        console.error(`Error: ${result.error}`);
      } else {
        console.log(`Embedding length: ${result.embedding.length}`);
        console.log(`First few values: ${result.embedding.slice(0, 5).join(', ')}`);
      }
    } else {
      // Test completion functionality
      console.log('Testing completion endpoint...');
      const provider = new SageMakerCompletionProvider(args.endpoint, {
        config: {
          region: args.region,
          modelType: args.modelType,
          responseFormat: {
            path: args.responsePath,
          },
        },
        transform: args.transform
          ? args.transformFile.startsWith('file://')
            ? args.transformFile
            : `file://${args.transformFile}`
          : undefined,
      });

      const result = await provider.callApi(prompt);
      console.log('Completion result:');
      console.log(`Success: ${!result.error}`);
      if (result.error) {
        console.error(`Error: ${result.error}`);
      } else {
        console.log('Output:');
        console.log(result.output);

        // Show additional metadata
        console.log('\nMetadata:');
        console.log(JSON.stringify(result.metadata, null, 2));

        // Show token usage
        console.log('\nToken usage:');
        console.log(JSON.stringify(result.tokenUsage, null, 2));
      }
    }
  } catch (error) {
    console.error('Error testing SageMaker provider:');
    console.error(error);
  }
}

// Run the test
testSageMaker().catch(console.error);
