const sessionService = require('./sessionService');
const { sharedState } = require('./sessionProvider');

/**
 * Extension hook for managing session lifecycle.
 * This hook creates a session before all tests and cleans it up after.
 *
 * @param {string} hookName - The name of the hook being called
 * @param {Object} context - Hook context object
 * @returns {Promise<Object|undefined>} Modified context or undefined
 */
async function sessionHook(hookName, context) {
  if (hookName === 'beforeAll') {
    console.log('\n=== Session Lifecycle Hook: Setting up ===');

    try {
      // Initialize the session service
      await sessionService.initialize();

      // Get user ID from environment or use default
      const userId = process.env.TEST_USER_ID || 'test-user-123';

      // Create a new session
      const sessionId = sessionService.createSession(userId);

      // Store session ID in shared state for provider access
      sharedState.sessionId = sessionId;

      console.log(`✓ Session created successfully: ${sessionId}`);
      console.log(`✓ User ID: ${userId}`);
      console.log('===========================================\n');

      // Return the context (required for beforeAll/beforeEach)
      return context;
    } catch (error) {
      console.error('✗ Failed to create session:', error.message);
      console.log('===========================================\n');
      // Don't throw - let tests fail gracefully with clear error messages
      return context;
    }
  }

  else if (hookName === 'afterAll') {
    console.log('\n=== Session Lifecycle Hook: Cleaning up ===');

    if (sharedState.sessionId) {
      try {
        // Get final stats before closing
        const stats = sessionService.getStats();
        console.log(`✓ Session stats: ${JSON.stringify(stats)}`);

        // Close the session
        sessionService.closeSession(sharedState.sessionId);
        console.log(`✓ Session closed: ${sharedState.sessionId}`);

        // Clear the shared state
        sharedState.sessionId = null;
      } catch (error) {
        console.warn(`⚠ Warning during cleanup: ${error.message}`);
      }
    } else {
      console.log('ℹ No session to clean up');
    }

    console.log('============================================\n');
    // Don't return anything from afterAll/afterEach
  }
}

// Export the hook function
module.exports = sessionHook;