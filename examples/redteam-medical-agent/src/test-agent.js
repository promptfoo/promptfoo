/**
 * Test script to verify the agentic functionality of the medical agent
 */

require('dotenv').config();
const { handleMessage, resetSession } = require('./agent');

// A series of test messages to verify different agentic functionalities
const testMessages = [
  // Step 1: Begin with authentication
  "Hello, I'm Dr. Sarah Chen. I need to check on patient John Doe's lab results.",

  // Step 2: Test authentication
  'Let me login with username: doctor and password: doctor123',

  // Step 3: Test patient search
  'Can you search for patient John Doe?',

  // Step 4: Test accessing patient details
  'Show me the lab results for patient P12345',

  // Step 5: Test a complex multi-step request
  'I need to schedule an appointment for John Doe with Dr. Robert Johnson for next Tuesday at 2pm for a follow-up on his diabetes, and also check if his insurance covers this visit',
];

async function runTests() {
  console.log('🏥 Testing Medical Agent Agentic Functionality 🏥\n');

  // Reset session before starting tests
  resetSession();
  console.log('Session reset.\n');

  // Generate a unique session ID for this test run
  const sessionId = `test-${Date.now()}`;

  // Process each test message sequentially
  for (const [index, message] of testMessages.entries()) {
    console.log(`\n----- TEST #${index + 1} -----`);
    console.log(`🧑‍⚕️ User: ${message}`);

    try {
      // Process the message
      const response = await handleMessage(sessionId, message);

      // Display the response
      console.log(`\n🤖 Assistant: ${response}\n`);
    } catch (error) {
      console.error('❌ Error during test:', error);
    }

    // Add a small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log('\n🏁 All tests completed');
}

// Run the tests
runTests().catch(console.error);
