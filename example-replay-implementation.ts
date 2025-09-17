/**
 * Example implementation of conversation replay from logs
 * This demonstrates how to replay multi-turn conversations stored in promptfoo evaluation results
 */

import { ConversationReplayProvider } from './src/providers/conversationReplay';
import { ConversationLoader } from './src/util/conversationLoader';
import type { Message } from './src/providers/simulatedUser';

// Example 1: Basic conversation replay
async function exampleBasicReplay() {
  console.log('=== Example 1: Basic Conversation Replay ===\n');

  // Load conversation from evaluation logs
  const conversation = await ConversationLoader.loadFromEvalResult('eval-abc123', 5);

  if (!conversation) {
    console.log('No conversation found');
    return;
  }

  console.log(`Loaded conversation: ${conversation.id}`);
  console.log(`Total turns: ${conversation.messages.length}`);
  console.log(`Original test case: ${JSON.stringify(conversation.testCase.vars, null, 2)}\n`);

  // Create replay provider
  const replayProvider = new ConversationReplayProvider({
    source: conversation.id,
    messages: conversation.messages,
    mode: 'full'
  });

  // Replay the conversation
  const result = await replayProvider.callApi('');

  console.log('Replayed conversation:');
  console.log(result.output);
  console.log('\nMetadata:', result.metadata);
}

// Example 2: Step-by-step replay
async function exampleStepReplay() {
  console.log('\n=== Example 2: Step-by-Step Replay ===\n');

  const conversation = await ConversationLoader.loadFromEvalResult('eval-def456', 3);

  if (!conversation) return;

  const replayProvider = new ConversationReplayProvider({
    source: conversation.id,
    messages: conversation.messages,
    mode: 'step'
  });

  // Replay each step
  for (let i = 0; i < conversation.messages.length; i++) {
    const result = await replayProvider.callApi('');

    console.log(`Step ${i + 1}:`);
    console.log(result.output);
    console.log(`Complete: ${result.metadata?.isComplete}\n`);
  }
}

// Example 3: Replay from specific turn
async function exampleReplayFromTurn() {
  console.log('\n=== Example 3: Replay from Specific Turn ===\n');

  const conversation = await ConversationLoader.loadFromEvalResult('eval-ghi789', 7);

  if (!conversation) return;

  // Start replay from turn 3 onwards
  const replayProvider = new ConversationReplayProvider({
    source: conversation.id,
    messages: conversation.messages,
    mode: 'from-turn',
    startFromTurn: 3
  });

  const result = await replayProvider.callApi('');

  console.log('Conversation from turn 3:');
  console.log(result.output);
  console.log(`\nStarted from turn: ${result.metadata?.startTurn}`);
  console.log(`Total turns in original: ${result.metadata?.totalTurns}`);
}

// Example 4: Search and replay conversations
async function exampleSearchAndReplay() {
  console.log('\n=== Example 4: Search and Replay ===\n');

  // Search for conversations containing specific content
  const searchResults = await ConversationLoader.searchConversations('password reset', 5);

  console.log(`Found ${searchResults.length} conversations about password reset:\n`);

  for (const result of searchResults) {
    console.log(`- ${result.id} (relevance: ${result.matchScore.toFixed(2)})`);
    console.log(`  Preview: ${result.preview}\n`);
  }

  if (searchResults.length > 0) {
    // Replay the most relevant conversation
    const bestMatch = searchResults[0];
    const conversation = await ConversationLoader.loadFromEvalResult(bestMatch.evalId, bestMatch.testIdx);

    if (conversation) {
      const replayProvider = new ConversationReplayProvider({
        source: conversation.id,
        messages: conversation.messages,
        mode: 'full'
      });

      const result = await replayProvider.callApi('');
      console.log('Most relevant conversation replay:');
      console.log(result.output);
    }
  }
}

// Example 5: Using replayed conversation in new evaluation
async function exampleReplayInEvaluation() {
  console.log('\n=== Example 5: Using Replay in New Evaluation ===\n');

  // This shows how you could use a replayed conversation as context for a new test
  const conversation = await ConversationLoader.loadFromEvalResult('eval-jkl012', 2);

  if (!conversation) return;

  // Extract conversation context
  const conversationContext = conversation.messages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  console.log('Original conversation context:');
  console.log(conversationContext);

  // Simulate using this context in a new evaluation
  const newTestPrompt = `
Given this previous conversation between a user and assistant:

${conversationContext}

Now, how would you handle this new user request: "I want to change my order to express shipping"
  `;

  console.log('\nNew test prompt with conversation context:');
  console.log(newTestPrompt);
}

// Example 6: Analyzing conversation patterns
async function exampleAnalyzePatterns() {
  console.log('\n=== Example 6: Analyze Conversation Patterns ===\n');

  // List all conversations from an evaluation
  const conversations = await ConversationLoader.listConversations('eval-mno345');

  console.log(`Found ${conversations.length} conversations in evaluation:\n`);

  const patterns = {
    successful: conversations.filter(c => c.success),
    failed: conversations.filter(c => !c.success),
    shortConversations: conversations.filter(c => c.turns <= 3),
    longConversations: conversations.filter(c => c.turns > 10),
    highScore: conversations.filter(c => c.score >= 0.8),
  };

  console.log('Conversation patterns:');
  console.log(`- Successful: ${patterns.successful.length}`);
  console.log(`- Failed: ${patterns.failed.length}`);
  console.log(`- Short (≤3 turns): ${patterns.shortConversations.length}`);
  console.log(`- Long (>10 turns): ${patterns.longConversations.length}`);
  console.log(`- High score (≥0.8): ${patterns.highScore.length}`);

  // Show example of a successful conversation
  if (patterns.successful.length > 0) {
    const successExample = patterns.successful[0];
    console.log(`\nExample successful conversation (Test ${successExample.testIdx}):`);
    console.log(successExample.preview);
  }
}

// Example 7: Mock multi-turn conversation data (for testing)
function createMockConversationData() {
  const mockMessages: Message[] = [
    { role: 'user', content: 'Hi, I need help with my password' },
    { role: 'assistant', content: 'I can help you reset your password. Can you provide your email address?' },
    { role: 'user', content: 'My email is john@example.com' },
    { role: 'assistant', content: 'Thanks! I found your account. For security, can you verify the last 4 digits of your phone number?' },
    { role: 'user', content: 'It ends in 1234' },
    { role: 'assistant', content: 'Perfect! I\'ve sent a password reset link to john@example.com. Please check your email and follow the instructions.' },
    { role: 'user', content: 'Great, I received it. Thank you for your help!' },
    { role: 'assistant', content: 'You\'re welcome! Is there anything else I can help you with today?' },
    { role: 'user', content: 'No, that\'s all. Thanks again!' },
    { role: 'assistant', content: 'Have a great day!' }
  ];

  return {
    id: 'mock-conversation-001',
    evalId: 'eval-mock-123',
    testIdx: 1,
    messages: mockMessages,
    metadata: {
      messages: mockMessages,
      conversationType: 'password-reset',
      resolution: 'successful'
    },
    testCase: {
      vars: {
        scenario: 'password reset',
        userType: 'returning customer'
      }
    },
    provider: { id: 'mock-agent', label: 'Mock Customer Service Agent' },
    createdAt: new Date()
  };
}

// Example 8: Using mock data for demonstration
async function exampleWithMockData() {
  console.log('\n=== Example 8: Mock Conversation Replay ===\n');

  const mockConversation = createMockConversationData();

  console.log(`Mock conversation: ${mockConversation.id}`);
  console.log(`Scenario: ${mockConversation.testCase.vars?.scenario}`);
  console.log(`Total turns: ${mockConversation.messages.length}\n`);

  // Replay the mock conversation
  const replayProvider = new ConversationReplayProvider({
    source: mockConversation.id,
    messages: mockConversation.messages,
    mode: 'full'
  });

  const result = await replayProvider.callApi('');

  console.log('Mock conversation replay:');
  console.log(result.output);

  // Show replay from turn 4 (middle of conversation)
  console.log('\n--- Replay from turn 4 ---');

  const partialReplayProvider = new ConversationReplayProvider({
    source: mockConversation.id,
    messages: mockConversation.messages,
    mode: 'from-turn',
    startFromTurn: 3 // 0-indexed, so this is turn 4
  });

  const partialResult = await partialReplayProvider.callApi('');
  console.log(partialResult.output);
}

// Run all examples
async function runAllExamples() {
  console.log('🎬 Conversation Replay Examples\n');
  console.log('This demonstrates replaying multi-turn agent conversations from evaluation logs.\n');

  try {
    // Note: These examples assume you have actual evaluation data
    // In practice, you would run these with real evalIds and testIdx values

    // await exampleBasicReplay();
    // await exampleStepReplay();
    // await exampleReplayFromTurn();
    // await exampleSearchAndReplay();
    // await exampleReplayInEvaluation();
    // await exampleAnalyzePatterns();

    // This one works with mock data
    await exampleWithMockData();

  } catch (error) {
    console.error('Example error (likely due to missing test data):', error.message);
    console.log('\nTo use these examples with real data:');
    console.log('1. Run some evaluations with multi-turn conversations');
    console.log('2. Replace evalIds in examples with your actual evaluation IDs');
    console.log('3. Ensure your evaluation results contain metadata.messages');
  }
}

// Export for use
export {
  exampleBasicReplay,
  exampleStepReplay,
  exampleReplayFromTurn,
  exampleSearchAndReplay,
  exampleReplayInEvaluation,
  exampleAnalyzePatterns,
  exampleWithMockData,
  createMockConversationData,
  runAllExamples
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}