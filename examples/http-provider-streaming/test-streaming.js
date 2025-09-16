#!/usr/bin/env node

/**
 * Simple test script to verify streaming functionality
 */

const http = require('http');

async function testStreamingEndpoint() {
  console.log('Testing streaming endpoint...');

  const postData = JSON.stringify({
    model: 'test-model',
    messages: [{ role: 'user', content: 'Hello' }],
    stream: true
  });

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      console.log(`Response status: ${res.statusCode}`);
      console.log(`Response headers:`, res.headers);

      let chunks = [];
      let chunkCount = 0;

      res.on('data', (chunk) => {
        const chunkText = chunk.toString();
        console.log(`Chunk ${++chunkCount}:`, chunkText);
        chunks.push(chunkText);
      });

      res.on('end', () => {
        console.log('Stream ended');
        console.log(`Total chunks received: ${chunkCount}`);
        resolve(chunks);
      });

      res.on('error', reject);
    });

    req.on('error', reject);

    req.write(postData);
    req.end();
  });
}

async function testHealthEndpoint() {
  console.log('\nTesting health endpoint...');

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/health',
    method: 'GET',
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('Health response:', JSON.parse(data));
        resolve(data);
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    await testHealthEndpoint();
    await testStreamingEndpoint();
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();