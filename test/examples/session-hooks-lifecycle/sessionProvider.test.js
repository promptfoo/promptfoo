const SessionProvider = require('../../../examples/session-hooks-lifecycle/javascript/sessionProvider');
const { sharedState } = require('../../../examples/session-hooks-lifecycle/javascript/sessionProvider');
const sessionService = require('../../../examples/session-hooks-lifecycle/javascript/sessionService');

describe('SessionProvider', () => {
  let provider;
  let originalSharedState;

  beforeEach(async () => {
    // Initialize service
    await sessionService.initialize();

    // Save original shared state
    originalSharedState = { ...sharedState };

    // Clear shared state
    sharedState.sessionId = null;

    // Create provider instance
    provider = new SessionProvider({
      id: 'test-provider',
      config: { testOption: 'value' },
    });
  });

  afterEach(() => {
    // Restore shared state
    Object.assign(sharedState, originalSharedState);

    // Clean up any sessions created during tests
    if (sharedState.sessionId) {
      sessionService.closeSession(sharedState.sessionId);
    }
  });

  describe('Provider Identity', () => {
    it('should return correct provider ID', () => {
      expect(provider.id()).toBe('test-provider');
    });

    it('should use default ID when none provided', () => {
      const defaultProvider = new SessionProvider();
      expect(defaultProvider.id()).toBe('session-provider');
    });

    it('should store config options', () => {
      expect(provider.config).toEqual({ testOption: 'value' });
    });
  });

  describe('API Calls with Active Session', () => {
    beforeEach(() => {
      // Create a session and set it in shared state
      const sessionId = sessionService.createSession('test-user');
      sharedState.sessionId = sessionId;
    });

    it('should successfully call API with active session', async () => {
      const prompt = 'Test prompt';
      const context = { vars: { someVar: 'value' } };

      const response = await provider.callApi(prompt, context);

      expect(response).toMatchObject({
        output: expect.stringContaining(`Response to: "${prompt}"`),
        metadata: {
          sessionId: sharedState.sessionId,
          requestCount: 1,
          contextUsed: false,
          provider: 'test-provider',
        },
      });
    });

    it('should increment request count across multiple calls', async () => {
      const response1 = await provider.callApi('First prompt', {});
      const response2 = await provider.callApi('Second prompt', {});
      const response3 = await provider.callApi('Third prompt', {});

      expect(response1.metadata.requestCount).toBe(1);
      expect(response2.metadata.requestCount).toBe(2);
      expect(response3.metadata.requestCount).toBe(3);
    });

    it('should use context from previous exchanges', async () => {
      // Make several calls to build history
      await provider.callApi('First message', {});
      await provider.callApi('Second message', {});
      await provider.callApi('Third message', {});

      const response = await provider.callApi('Fourth message', {});

      expect(response.metadata.contextUsed).toBe(true);
      expect(response.output).toContain('Session has 3 prior exchanges');
    });

    it('should maintain session ID in metadata', async () => {
      const expectedSessionId = sharedState.sessionId;

      const response1 = await provider.callApi('Test 1', {});
      const response2 = await provider.callApi('Test 2', {});

      expect(response1.metadata.sessionId).toBe(expectedSessionId);
      expect(response2.metadata.sessionId).toBe(expectedSessionId);
    });

    it('should handle empty prompts', async () => {
      const response = await provider.callApi('', {});

      expect(response.output).toContain('Response to: ""');
      expect(response.metadata.requestCount).toBe(1);
    });
  });

  describe('API Calls without Session', () => {
    it('should throw error when no session is available', async () => {
      // Ensure no session in shared state
      sharedState.sessionId = null;

      await expect(provider.callApi('Test prompt', {})).rejects.toThrow(
        'No active session found'
      );
    });

    it('should include helpful error message', async () => {
      sharedState.sessionId = null;

      await expect(provider.callApi('Test', {})).rejects.toThrow(
        /Make sure beforeAll hook ran successfully.*The session should be created before any provider calls/
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session ID gracefully', async () => {
      // Set an invalid session ID that doesn't exist
      sharedState.sessionId = 'invalid-session-id';

      const response = await provider.callApi('Test prompt', {});

      expect(response).toMatchObject({
        error: expect.stringContaining('Session provider error'),
        metadata: {
          sessionId: 'invalid-session-id',
          provider: 'test-provider',
          errorType: expect.any(String),
        },
      });
    });

    it('should preserve session ID in error metadata', async () => {
      const invalidId = 'non-existent-session';
      sharedState.sessionId = invalidId;

      const response = await provider.callApi('Test', {});

      expect(response.metadata.sessionId).toBe(invalidId);
    });

    it('should handle service errors gracefully', async () => {
      // Create a valid session
      const sessionId = sessionService.createSession('test-user');
      sharedState.sessionId = sessionId;

      // Mock makeRequest to throw an error
      const originalMakeRequest = sessionService.makeRequest;
      sessionService.makeRequest = jest.fn().mockRejectedValue(
        new TypeError('Simulated service error')
      );

      const response = await provider.callApi('Test prompt', {});

      expect(response).toMatchObject({
        error: 'Session provider error: Simulated service error',
        metadata: {
          errorType: 'TypeError',
        },
      });

      // Restore original method
      sessionService.makeRequest = originalMakeRequest;
    });
  });

  describe('Shared State Integration', () => {
    it('should use the same shared state across multiple provider instances', async () => {
      const provider1 = new SessionProvider({ id: 'provider-1' });
      const provider2 = new SessionProvider({ id: 'provider-2' });

      // Create session and set in shared state
      const sessionId = sessionService.createSession('shared-user');
      sharedState.sessionId = sessionId;

      const response1 = await provider1.callApi('From provider 1', {});
      const response2 = await provider2.callApi('From provider 2', {});

      // Both should use the same session
      expect(response1.metadata.sessionId).toBe(sessionId);
      expect(response2.metadata.sessionId).toBe(sessionId);

      // Request counts should increment across providers
      expect(response1.metadata.requestCount).toBe(1);
      expect(response2.metadata.requestCount).toBe(2);
    });

    it('should reflect changes in shared state immediately', async () => {
      // Initially no session
      sharedState.sessionId = null;

      await expect(provider.callApi('Before session', {})).rejects.toThrow(
        'No active session found'
      );

      // Create session
      sharedState.sessionId = sessionService.createSession('dynamic-user');

      const response2 = await provider.callApi('After session', {});
      expect(response2.output).toBeDefined();
      expect(response2.error).toBeUndefined();
    });
  });

  describe('Provider Configuration', () => {
    it('should handle provider with no options', () => {
      const bareProvider = new SessionProvider();

      expect(bareProvider.id()).toBe('session-provider');
      expect(bareProvider.config).toEqual({});
    });

    it('should handle provider with partial options', () => {
      const partialProvider = new SessionProvider({ id: 'custom-id' });

      expect(partialProvider.id()).toBe('custom-id');
      expect(partialProvider.config).toEqual({});
    });

    it('should preserve config throughout lifecycle', async () => {
      const configProvider = new SessionProvider({
        id: 'config-test',
        config: {
          option1: 'value1',
          option2: 123,
          nested: { key: 'value' },
        },
      });

      // Create session for testing
      sharedState.sessionId = sessionService.createSession('config-user');

      await configProvider.callApi('Test', {});

      // Config should remain unchanged
      expect(configProvider.config).toEqual({
        option1: 'value1',
        option2: 123,
        nested: { key: 'value' },
      });
    });
  });

  describe('Context Handling', () => {
    beforeEach(() => {
      sharedState.sessionId = sessionService.createSession('context-user');
    });

    it('should handle various context structures', async () => {
      const contexts = [
        {},
        { vars: {} },
        { vars: { key: 'value' } },
        { options: { setting: true } },
        null,
        undefined,
      ];

      for (const context of contexts) {
        const response = await provider.callApi('Test', context);
        expect(response.output).toBeDefined();
      }
    });

    it('should not modify the original context', async () => {
      const originalContext = {
        vars: { key: 'value' },
        options: { setting: true },
      };
      const contextCopy = JSON.parse(JSON.stringify(originalContext));

      await provider.callApi('Test', originalContext);

      expect(originalContext).toEqual(contextCopy);
    });
  });
});