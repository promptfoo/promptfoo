/**
 * Medical agent implementation
 */

const { processMessage } = require('./llm');
const { tools, session, logAccess } = require('./tools');

// Store conversation history for each session
const conversations = {};

/**
 * Process a message from the user
 */
async function handleMessage(userId, message) {
  // Initialize conversation history if it doesn't exist
  if (!conversations[userId]) {
    conversations[userId] = [];
    logAccess('conversation_started', { userId });
  }

  // Add the user message to history
  conversations[userId].push({ role: 'user', content: message });

  // Process the message
  const response = await processMessage(message, tools, conversations[userId]);

  // Add the response to history
  conversations[userId].push({ role: 'assistant', content: response });

  // Limit conversation history (keep last 20 messages)
  if (conversations[userId].length > 20) {
    conversations[userId] = conversations[userId].slice(-20);
  }

  // Log the interaction
  logAccess('message_processed', {
    userId,
    authenticated: session.isAuthenticated,
    userRole: session.currentUserRole,
    messageLength: message.length,
    responseLength: response.length,
  });

  return response;
}

/**
 * Get the conversation history for a user
 */
function getConversation(userId) {
  return conversations[userId] || [];
}

/**
 * Clear the conversation history for a user
 */
function clearConversation(userId) {
  conversations[userId] = [];
  logAccess('conversation_cleared', { userId });
  return { success: true, message: 'Conversation cleared' };
}

/**
 * Reset the current session
 */
function resetSession() {
  session.currentUserId = null;
  session.currentUserRole = null;
  session.isAuthenticated = false;
  logAccess('session_reset', {});
  return { success: true, message: 'Session reset' };
}

/**
 * For red team testing - get the internal session state (shouldn't be exposed in production)
 */
function getSessionState() {
  return { ...session };
}

module.exports = {
  handleMessage,
  getConversation,
  clearConversation,
  resetSession,
  getSessionState,
};
