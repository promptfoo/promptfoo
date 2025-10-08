const DEFAULT_BASE_URL = 'http://127.0.0.1:4100';

// biome-ignore lint/style/noRestrictedGlobals: example provider intentionally uses the global fetch
const fetchWithProxy = (...args) => fetch(...args);

/**
 * Example provider demonstrating the session lifecycle pattern for conversational AI.
 *
 * This provider implements the optional startSession and closeSession methods,
 * allowing promptfoo to manage server-side session state automatically.
 *
 * Session Flow:
 * 1. startSession() is called once before the first message in a conversation
 * 2. callApi() is called for each message with context.sessionId set
 * 3. closeSession() is called once after all messages complete
 */
class SessionProvider {
  constructor(config = {}) {
    this.config = config;
    this.label = config.label || 'session-provider';
  }

  id() {
    return 'session-provider';
  }

  /**
   * Called once when a new conversation begins.
   * Creates a server-side session and returns the session ID.
   *
   * @param {Object} context - Session context with conversationId, test, and vars
   * @returns {Promise<{sessionId: string, metadata?: object}>}
   */
  async startSession(context = {}) {
    const response = await fetchWithProxy(`${this.#baseUrl()}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: context.conversationId,
        vars: context.vars,
        test: context.test,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start session: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    return {
      sessionId: payload.sessionId,
      metadata: payload.metadata,
    };
  }

  /**
   * Called for each message in the conversation.
   * The sessionId from startSession is automatically passed in context.sessionId.
   *
   * @param {string} prompt - The message to send
   * @param {Object} context - Context including sessionId, vars, test, etc.
   * @param {Object} options - Options including abortSignal
   * @returns {Promise<{output: string, sessionId?: string, metadata?: object}>}
   */
  async callApi(prompt, context = {}, options = {}) {
    // If no session is active, this is a standalone call
    if (!context.sessionId) {
      throw new Error(
        'No active session. Ensure conversationId is set in test metadata for multi-turn conversations.',
      );
    }

    const response = await fetchWithProxy(
      `${this.#baseUrl()}/sessions/${context.sessionId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          vars: context.vars,
        }),
        signal: options.abortSignal,
      },
    );

    if (!response.ok) {
      return {
        error: `Failed to send message: ${response.status} ${response.statusText}`,
        output: '',
      };
    }

    const payload = await response.json();
    return {
      output: payload.reply,
      sessionId: context.sessionId,
      metadata: {
        sessionId: context.sessionId,
        raw: payload,
      },
    };
  }

  /**
   * Called once after all messages in the conversation are complete.
   * Cleans up server-side session state.
   *
   * @param {string} sessionId - The session ID returned from startSession
   * @returns {Promise<void>}
   */
  async closeSession(sessionId) {
    if (!sessionId) {
      return;
    }

    const response = await fetchWithProxy(`${this.#baseUrl()}/sessions/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(
        `Failed to close session ${sessionId}: ${response.status} ${response.statusText}`,
      );
    }
  }

  #baseUrl() {
    return this.config.baseUrl || DEFAULT_BASE_URL;
  }
}

module.exports = SessionProvider;
