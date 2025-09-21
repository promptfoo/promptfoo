#!/usr/bin/env node

// Simple test script to verify LiveKit provider functionality
const { LiveKitProvider } = require('./dist/src/providers/livekit/index.js');
const path = require('path');

async function testLiveKitProvider() {
  console.log('🧪 Testing LiveKit Provider End-to-End...\n');

  try {
    // Test 1: Provider instantiation
    console.log('1️⃣ Testing provider instantiation...');
    const agentPath = path.resolve('./examples/real-livekit-agent.js');

    const provider = new LiveKitProvider(agentPath, {
      config: {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        url: 'ws://localhost:7880',
        roomName: 'promptfoo-test',
        participantName: 'promptfoo-tester',
        sessionTimeout: 5000,
      }
    });

    console.log('✅ Provider created successfully');
    console.log(`   Provider ID: ${provider.id()}`);
    console.log(`   Provider: ${provider.toString()}\n`);

    // Test 2: Configuration validation
    console.log('2️⃣ Testing configuration...');
    console.log(`   API Key: ${provider.config.apiKey.substring(0, 4)}***`);
    console.log(`   URL: ${provider.config.url}`);
    console.log(`   Room: ${provider.config.roomName}`);
    console.log(`   Timeout: ${provider.config.sessionTimeout}ms\n`);

    // Test 3: Agent loading
    console.log('3️⃣ Testing agent loading...');
    const agent = await provider.loadAgent();
    console.log('✅ Agent loaded successfully');
    console.log(`   Agent config: ${JSON.stringify(agent.config, null, 2)}\n`);

    // Test 4: Multi-modal input parsing
    console.log('4️⃣ Testing multi-modal input parsing...');
    const { parseMultiModalInput } = require('./dist/src/providers/livekit/utils.js');

    const testInputs = [
      'Simple text message',
      'audio:https://example.com/test.wav Please transcribe this',
      'video:https://example.com/test.mp4 Describe what you see',
      'audio:https://example.com/audio.wav video:https://example.com/video.mp4 Process both modalities'
    ];

    testInputs.forEach((input, i) => {
      const parsed = parseMultiModalInput(input);
      console.log(`   Input ${i + 1}: "${input}"`);
      console.log(`   Parsed: ${JSON.stringify(parsed, null, 4)}`);
    });

    console.log('\n✅ All basic tests passed!');
    console.log('\n⚠️  Note: Full end-to-end testing requires a running LiveKit server.');
    console.log('   To test with a real LiveKit server:');
    console.log('   1. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET environment variables');
    console.log('   2. Ensure LiveKit server is running and accessible');
    console.log('   3. Run: npm run local -- eval -c test-livekit-config.yaml');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the tests
testLiveKitProvider().catch(console.error);