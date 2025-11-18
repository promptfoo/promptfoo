/**
 * Simple test script to debug the browser-chat-provider
 */

const BrowserChatProvider = require('./browser-chat-provider.js');

async function test() {
  const provider = new BrowserChatProvider();

  console.log('Provider ID:', provider.id());
  console.log('Calling provider...');

  const result = await provider.callApi('Hello, what is the weather?', {}, {
    vars: {
      serverUrl: 'http://localhost:3000',
      headless: false, // Run in non-headless to see what's happening
    }
  });

  console.log('Result:', JSON.stringify(result, null, 2));

  process.exit(0);
}

test().catch(console.error);
