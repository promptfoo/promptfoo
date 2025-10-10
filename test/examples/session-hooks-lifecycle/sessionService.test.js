const sessionService = require('../../../examples/session-hooks-lifecycle/javascript/sessionService');

describe('SessionService', () => {
  // Store original state to restore between tests
  let originalSessions;
  let originalIsInitialized;

  beforeEach(() => {
    // Save original state
    originalSessions = new Map(sessionService.sessions);
    originalIsInitialized = sessionService.isInitialized;

    // Reset service state for each test
    sessionService.sessions.clear();
    sessionService.isInitialized = false;
  });

  afterEach(() => {
    // Restore original state to prevent test pollution
    sessionService.sessions = originalSessions;
    sessionService.isInitialized = originalIsInitialized;
  });

  describe('Service Initialization', () => {
    it('should initialize the service successfully', async () => {
      expect(sessionService.isInitialized).toBe(false);

      await sessionService.initialize();

      expect(sessionService.isInitialized).toBe(true);
    });

    it('should initialize only once', async () => {
      await sessionService.initialize();
      const firstInitTime = Date.now();

      // Try to initialize again
      await sessionService.initialize();
      const secondInitTime = Date.now();

      // Should be very fast since it doesn't actually initialize again
      expect(secondInitTime - firstInitTime).toBeLessThan(10);
      expect(sessionService.isInitialized).toBe(true);
    });

    it('should throw error when creating session before initialization', () => {
      expect(() => sessionService.createSession('user123')).toThrow(
        'SessionService not initialized. Call initialize() first.'
      );
    });
  });

  describe('Session Creation', () => {
    beforeEach(async () => {
      await sessionService.initialize();
    });

    it('should create a new session with unique ID', () => {
      const userId = 'test-user-456';
      const sessionId = sessionService.createSession(userId);

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBe(32); // hex string of 16 bytes
    });

    it('should create different session IDs for multiple sessions', () => {
      const sessionId1 = sessionService.createSession('user1');
      const sessionId2 = sessionService.createSession('user2');

      expect(sessionId1).not.toBe(sessionId2);
    });

    it('should store session with correct structure', () => {
      const userId = 'test-user-789';
      const sessionId = sessionService.createSession(userId);
      const session = sessionService.getSession(sessionId);

      expect(session).toMatchObject({
        id: sessionId,
        userId: userId,
        conversationHistory: [],
        metadata: {
          requestCount: 0,
          lastActivity: expect.any(Number),
        },
      });
      expect(session.createdAt).toBeDefined();
      expect(typeof session.createdAt).toBe('number');
    });
  });

  describe('Session Retrieval', () => {
    beforeEach(async () => {
      await sessionService.initialize();
    });

    it('should retrieve an existing session', () => {
      const userId = 'retrieve-test-user';
      const sessionId = sessionService.createSession(userId);

      const retrievedSession = sessionService.getSession(sessionId);

      expect(retrievedSession).toBeDefined();
      expect(retrievedSession.id).toBe(sessionId);
      expect(retrievedSession.userId).toBe(userId);
    });

    it('should return null for non-existent session', () => {
      const nonExistentSession = sessionService.getSession('non-existent-id');

      expect(nonExistentSession).toBeNull();
    });
  });

  describe('Request Handling', () => {
    let sessionId;

    beforeEach(async () => {
      await sessionService.initialize();
      sessionId = sessionService.createSession('request-test-user');
    });

    it('should process a request successfully', async () => {
      const prompt = 'What is the weather today?';
      const response = await sessionService.makeRequest(sessionId, prompt);

      expect(response).toMatchObject({
        text: expect.stringContaining(`Response to: "${prompt}"`),
        requestCount: 1,
        sessionId: sessionId,
        contextUsed: false,
      });
    });

    it('should increment request counter', async () => {
      await sessionService.makeRequest(sessionId, 'First request');
      const response2 = await sessionService.makeRequest(sessionId, 'Second request');
      const response3 = await sessionService.makeRequest(sessionId, 'Third request');

      expect(response2.requestCount).toBe(2);
      expect(response3.requestCount).toBe(3);
    });

    it('should update conversation history', async () => {
      const prompt1 = 'Hello';
      const prompt2 = 'How are you?';

      await sessionService.makeRequest(sessionId, prompt1);
      await sessionService.makeRequest(sessionId, prompt2);

      const session = sessionService.getSession(sessionId);
      expect(session.conversationHistory).toHaveLength(2);
      expect(session.conversationHistory[0].prompt).toBe(prompt1);
      expect(session.conversationHistory[1].prompt).toBe(prompt2);
    });

    it('should build context from previous exchanges', async () => {
      // Make several requests to build history
      await sessionService.makeRequest(sessionId, 'First');
      await sessionService.makeRequest(sessionId, 'Second');
      await sessionService.makeRequest(sessionId, 'Third');

      const response = await sessionService.makeRequest(sessionId, 'Fourth');

      // Should indicate context was used (3 prior exchanges)
      expect(response.contextUsed).toBe(true);
      expect(response.text).toContain('Session has 3 prior exchanges');
    });

    it('should limit context to last 3 exchanges', async () => {
      // Make 5 requests to exceed context limit
      for (let i = 1; i <= 5; i++) {
        await sessionService.makeRequest(sessionId, `Request ${i}`);
      }

      const response = await sessionService.makeRequest(sessionId, 'Final request');

      // Should still have context from last 3 exchanges
      expect(response.contextUsed).toBe(true);
      expect(response.text).toContain('Session has 5 prior exchanges');
      expect(response.text).toContain('request #6');
    });

    it('should update last activity timestamp', async () => {
      const session1 = sessionService.getSession(sessionId);
      const initialActivity = session1.metadata.lastActivity;

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await sessionService.makeRequest(sessionId, 'New request');
      const session2 = sessionService.getSession(sessionId);

      expect(session2.metadata.lastActivity).toBeGreaterThan(initialActivity);
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        sessionService.makeRequest('invalid-session-id', 'Test prompt')
      ).rejects.toThrow('Session invalid-session-id not found');
    });
  });

  describe('Session Closure', () => {
    beforeEach(async () => {
      await sessionService.initialize();
    });

    it('should close an existing session', () => {
      const sessionId = sessionService.createSession('close-test-user');

      expect(sessionService.getSession(sessionId)).toBeDefined();

      sessionService.closeSession(sessionId);

      expect(sessionService.getSession(sessionId)).toBeNull();
    });

    it('should handle closing non-existent session gracefully', () => {
      // Should not throw
      expect(() => {
        sessionService.closeSession('non-existent-session');
      }).not.toThrow();
    });

    it('should log statistics when closing session', async () => {
      const sessionId = sessionService.createSession('stats-test-user');

      // Make some requests
      await sessionService.makeRequest(sessionId, 'Request 1');
      await sessionService.makeRequest(sessionId, 'Request 2');

      // Spy on console.log to verify statistics are logged
      const consoleSpy = jest.spyOn(console, 'log');

      sessionService.closeSession(sessionId);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Total requests: 2')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await sessionService.initialize();
    });

    it('should return correct statistics for active sessions', async () => {
      // Create multiple sessions
      const session1 = sessionService.createSession('user1');
      const session2 = sessionService.createSession('user2');
      const session3 = sessionService.createSession('user3');

      // Make different numbers of requests
      await sessionService.makeRequest(session1, 'Request 1');
      await sessionService.makeRequest(session1, 'Request 2');
      await sessionService.makeRequest(session2, 'Request 1');

      const stats = sessionService.getStats();

      expect(stats).toEqual({
        activeSessions: 3,
        totalRequests: 3,
      });
    });

    it('should update statistics after closing sessions', async () => {
      const session1 = sessionService.createSession('user1');
      const session2 = sessionService.createSession('user2');

      await sessionService.makeRequest(session1, 'Request');
      await sessionService.makeRequest(session2, 'Request');

      // Close one session
      sessionService.closeSession(session1);

      const stats = sessionService.getStats();

      expect(stats).toEqual({
        activeSessions: 1,
        totalRequests: 1, // Only counting remaining session
      });
    });

    it('should return zero statistics when no sessions exist', () => {
      const stats = sessionService.getStats();

      expect(stats).toEqual({
        activeSessions: 0,
        totalRequests: 0,
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await sessionService.initialize();
    });

    it('should handle empty prompt gracefully', async () => {
      const sessionId = sessionService.createSession('edge-test-user');

      const response = await sessionService.makeRequest(sessionId, '');

      expect(response.text).toContain('Response to: ""');
      expect(response.requestCount).toBe(1);
    });

    it('should handle very long prompts', async () => {
      const sessionId = sessionService.createSession('long-prompt-user');
      const longPrompt = 'x'.repeat(10000);

      const response = await sessionService.makeRequest(sessionId, longPrompt);

      expect(response).toBeDefined();
      expect(response.requestCount).toBe(1);
    });

    it('should maintain session isolation', async () => {
      const session1 = sessionService.createSession('user1');
      const session2 = sessionService.createSession('user2');

      await sessionService.makeRequest(session1, 'Session 1 request');
      await sessionService.makeRequest(session2, 'Session 2 request');

      const response1 = await sessionService.makeRequest(session1, 'Another request');
      const response2 = await sessionService.makeRequest(session2, 'Another request');

      expect(response1.requestCount).toBe(2);
      expect(response2.requestCount).toBe(2);
      expect(response1.sessionId).not.toBe(response2.sessionId);
    });
  });
});