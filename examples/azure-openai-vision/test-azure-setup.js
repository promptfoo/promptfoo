#!/usr/bin/env node

/**
 * Quick test script to verify your Azure OpenAI vision setup
 * Usage: node test-azure-setup.js
 */

const https = require('https');

// Configuration - Update these values
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY || 'your-api-key';
const AZURE_RESOURCE_NAME = process.env.AZURE_RESOURCE_NAME || 'your-resource-name';
const DEPLOYMENT_NAME = 'promptfoo'; // Your deployment name
const API_VERSION = '2024-08-06'; // Matching your model version

// Test image URL (small cat image)
const TEST_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/320px-Cat03.jpg';

async function testAzureVision() {
  console.log('🔍 Testing Azure OpenAI Vision Setup...\n');
  console.log(`Resource: ${AZURE_RESOURCE_NAME}.openai.azure.com`);
  console.log(`Deployment: ${DEPLOYMENT_NAME}`);
  console.log(`API Version: ${API_VERSION}\n`);

  const requestBody = {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What do you see in this image? Please describe it in one sentence.'
          },
          {
            type: 'image_url',
            image_url: {
              url: TEST_IMAGE_URL
            }
          }
        ]
      }
    ],
    max_tokens: 100,
    temperature: 0.1
  };

  const options = {
    hostname: `${AZURE_RESOURCE_NAME}.openai.azure.com`,
    path: `/openai/deployments/${DEPLOYMENT_NAME}/chat/completions?api-version=${API_VERSION}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (res.statusCode === 200) {
            console.log('✅ Success! Vision API is working.\n');
            console.log('Response:', response.choices[0].message.content);
            console.log('\nTokens used:', response.usage.total_tokens);
            resolve(response);
          } else {
            console.error('❌ Error:', res.statusCode, res.statusMessage);
            console.error('Response:', JSON.stringify(response, null, 2));
            
            // Provide helpful error messages
            if (res.statusCode === 404) {
              console.error('\n💡 Hint: Check that your deployment name is correct: "promptfoo"');
            } else if (res.statusCode === 401) {
              console.error('\n💡 Hint: Check your API key is correct and set as AZURE_OPENAI_API_KEY');
            } else if (response.error?.code === 'model_not_found') {
              console.error('\n💡 Hint: The deployment might not support vision. Ensure it uses GPT-4o or GPT-4 Turbo with Vision.');
            }
            reject(new Error(`API returned ${res.statusCode}`));
          }
        } catch (e) {
          console.error('Failed to parse response:', e);
          console.error('Raw response:', data);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Request failed:', e.message);
      reject(e);
    });

    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

// Run the test
console.log('Azure OpenAI Vision Test Script');
console.log('================================\n');

if (!AZURE_API_KEY || AZURE_API_KEY === 'your-api-key') {
  console.error('❌ Please set your AZURE_OPENAI_API_KEY environment variable');
  process.exit(1);
}

if (!AZURE_RESOURCE_NAME || AZURE_RESOURCE_NAME === 'your-resource-name') {
  console.error('❌ Please set your AZURE_RESOURCE_NAME environment variable');
  console.error('   This is the first part of your Azure OpenAI endpoint');
  console.error('   (e.g., if your endpoint is "myresource.openai.azure.com", set AZURE_RESOURCE_NAME=myresource)');
  process.exit(1);
}

testAzureVision()
  .then(() => {
    console.log('\n✅ Your Azure OpenAI vision setup is working correctly!');
    console.log('\nNext steps:');
    console.log('1. Update the promptfoo config with your resource name');
    console.log('2. Run: npx promptfoo@latest eval -c test-config.yaml');
  })
  .catch((error) => {
    console.error('\n❌ Test failed. Please check the error messages above.');
    process.exit(1);
  }); 