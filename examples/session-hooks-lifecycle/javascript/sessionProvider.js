const sessionService = require('./sessionService');

/**
 * Shared state object for session management.
 * This is accessed by both the provider and the hooks.
 */
const sharedState = {
  sessionId: null,
};

/**
 * Custom provider that uses a managed session.
 * The session is created in the beforeAll hook and cleaned up in afterAll.
 */
class SessionProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'session-provider';
    this.config = options.config || {};
  }

  /**
   * Get the provider ID
   * @returns {string} Provider identifier
   */
  id() {
    return this.providerId;
  }

  /**
   * Call the API using the session context
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Provider context
   * @returns {Promise<Object>} Provider response
   */
  async callApi(prompt, context) {
    // Check if session is available
    if (!sharedState.sessionId) {
      throw new Error(
        'No active session found. Make sure beforeAll hook ran successfully. ' +
        'The session should be created before any provider calls.'
      );
    }

    try {
      // Make request using the session
      const response = await sessionService.makeRequest(
        sharedState.sessionId,
        prompt
      );

      // Return in ProviderResponse format
      return {
        output: response.text,
        metadata: {
          sessionId: sharedState.sessionId,
          requestCount: response.requestCount,
          contextUsed: response.contextUsed,
          provider: this.providerId,
        },
      };
    } catch (error) {
      // Handle errors gracefully
      return {
        error: `Session provider error: ${error.message}`,
        metadata: {
          sessionId: sharedState.sessionId,
          provider: this.providerId,
          errorType: error.constructor.name,
        },
      };
    }
  }
}

// Export the provider class
module.exports = SessionProvider;

// Also export the shared state so hooks can access it
module.exports.sharedState = sharedState;