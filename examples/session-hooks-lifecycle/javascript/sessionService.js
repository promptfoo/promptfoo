const crypto = require('crypto');

/**
 * Mock session service that simulates a stateful API or database connection
 * that requires session management.
 */
class SessionService {
  constructor() {
    this.sessions = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the service (simulated async operation)
   */
  async initialize() {
    if (!this.isInitialized) {
      // Simulate service startup delay
      await new Promise((resolve) => setTimeout(resolve, 100));
      this.isInitialized = true;
      console.log('SessionService initialized');
    }
  }

  /**
   * Create a new session for a user
   * @param {string} userId - The user ID to create a session for
   * @returns {string} The created session ID
   */
  createSession(userId) {
    if (!this.isInitialized) {
      throw new Error('SessionService not initialized. Call initialize() first.');
    }

    const sessionId = crypto.randomBytes(16).toString('hex');
    const session = {
      id: sessionId,
      userId,
      createdAt: Date.now(),
      conversationHistory: [],
      metadata: {
        requestCount: 0,
        lastActivity: Date.now(),
      },
    };

    this.sessions.set(sessionId, session);
    console.log(`Session created for user ${userId}: ${sessionId}`);
    return sessionId;
  }

  /**
   * Get a session by ID
   * @param {string} sessionId - The session ID to retrieve
   * @returns {Object|null} The session object or null if not found
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Make a request within a session context
   * @param {string} sessionId - The session ID
   * @param {string} prompt - The prompt/request to process
   * @returns {Object} The response object
   */
  async makeRequest(sessionId, prompt) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update activity timestamp
    session.metadata.lastActivity = Date.now();
    session.metadata.requestCount++;

    // Build context from conversation history (last 3 exchanges)
    const contextHistory = session.conversationHistory
      .slice(-3)
      .map((entry) => `User: ${entry.prompt}\nAssistant: ${entry.response}`)
      .join('\n\n');

    // Simulate an API call with session context
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Generate a mock response that shows session awareness
    const response = `Response to: "${prompt}"\n` +
      `(Session has ${session.conversationHistory.length} prior exchanges, ` +
      `request #${session.metadata.requestCount} for user ${session.userId})`;

    // Store in conversation history
    session.conversationHistory.push({
      prompt,
      response,
      timestamp: Date.now(),
    });

    return {
      text: response,
      requestCount: session.metadata.requestCount,
      sessionId,
      contextUsed: contextHistory.length > 0,
    };
  }

  /**
   * Close a session and clean up resources
   * @param {string} sessionId - The session ID to close
   */
  closeSession(sessionId) {
    const session = this.getSession(sessionId);
    if (session) {
      console.log(`Closing session ${sessionId} for user ${session.userId}`);
      console.log(`  Total requests: ${session.metadata.requestCount}`);
      console.log(`  Duration: ${Date.now() - session.createdAt}ms`);
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Get statistics about active sessions
   * @returns {Object} Session statistics
   */
  getStats() {
    return {
      activeSessions: this.sessions.size,
      totalRequests: Array.from(this.sessions.values()).reduce(
        (sum, session) => sum + session.metadata.requestCount,
        0
      ),
    };
  }
}

// Export singleton instance
module.exports = new SessionService();