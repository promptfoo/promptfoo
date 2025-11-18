#!/usr/bin/env node

/**
 * Simple WebSocket test script to validate the chat server
 * Run with: node test-websocket.js
 */

const WebSocket = require('ws');

console.log('🧪 Testing WebSocket Chat Server...\n');

const ws = new WebSocket('ws://localhost:3000');
let messageCount = 0;
let streamBuffer = '';
let testsPassed = 0;
let testsFailed = 0;

ws.on('open', () => {
  console.log('✅ WebSocket connection established');
  testsPassed++;

  // Test 1: Send greeting
  console.log('\n📤 Test 1: Sending greeting message');
  ws.send(JSON.stringify({ message: 'Hello' }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'connected') {
    console.log(`✅ Session established: ${msg.sessionId}`);
    testsPassed++;
  } else if (msg.type === 'chunk') {
    streamBuffer += msg.content;
  } else if (msg.type === 'done') {
    messageCount++;
    console.log(`📥 Response ${messageCount}: "${streamBuffer}"`);

    if (messageCount === 1) {
      // Validate greeting response
      if (streamBuffer.toLowerCase().includes('help')) {
        console.log('✅ Greeting response correct');
        testsPassed++;
      } else {
        console.log('❌ Greeting response incorrect');
        testsFailed++;
      }

      // Test 2: Ask about weather
      console.log('\n📤 Test 2: Asking about weather');
      streamBuffer = '';
      ws.send(JSON.stringify({ message: 'What is the weather?' }));
    } else if (messageCount === 2) {
      // Validate weather response
      if (streamBuffer.toLowerCase().includes('sunny') && streamBuffer.includes('72')) {
        console.log('✅ Weather response correct');
        testsPassed++;
      } else {
        console.log('❌ Weather response incorrect');
        testsFailed++;
      }

      // Test 3: Context-aware follow-up
      console.log('\n📤 Test 3: Context-aware follow-up (critical!)');
      streamBuffer = '';
      ws.send(JSON.stringify({ message: 'What about tomorrow?' }));
    } else if (messageCount === 3) {
      // Validate context-aware response
      const hasContext =
        streamBuffer.toLowerCase().includes('tomorrow') &&
        (streamBuffer.toLowerCase().includes('cloudy') || streamBuffer.includes('68'));

      if (hasContext) {
        console.log('✅ Context preserved! Server remembers weather topic');
        testsPassed++;
      } else {
        console.log('❌ Context NOT preserved - response:', streamBuffer);
        testsFailed++;
      }

      // Test 4: Conversation count
      console.log('\n📤 Test 4: Checking conversation memory');
      streamBuffer = '';
      ws.send(JSON.stringify({ message: 'How many messages have we exchanged?' }));
    } else if (messageCount === 4) {
      // Check message count awareness
      const hasCount = /\d+/.test(streamBuffer);
      if (hasCount) {
        console.log('✅ Server tracks conversation count');
        testsPassed++;
      } else {
        console.log('❌ Server does not track conversation');
        testsFailed++;
      }

      // Done with tests
      console.log('\n' + '='.repeat(50));
      console.log(`✅ Passed: ${testsPassed}`);
      console.log(`❌ Failed: ${testsFailed}`);
      console.log('='.repeat(50));

      if (testsFailed === 0) {
        console.log('\n🎉 All tests passed! WebSocket chat is working correctly.');
        console.log('\nYou can now test with promptfoo:');
        console.log('  1. Start Chrome: chrome --remote-debugging-port=9222');
        console.log('  2. Navigate to http://localhost:3000');
        console.log('  3. Run: npx promptfoo eval');
      } else {
        console.log('\n⚠️  Some tests failed. Check server implementation.');
      }

      ws.close();
      process.exit(testsFailed > 0 ? 1 : 0);
    }

    streamBuffer = '';
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.log('\nMake sure the server is running:');
  console.log('  npm start');
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n🔌 WebSocket connection closed');
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('\n⏱️  Test timeout - server not responding');
  ws.close();
  process.exit(1);
}, 10000);
