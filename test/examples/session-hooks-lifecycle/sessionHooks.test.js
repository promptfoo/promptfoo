const sessionHook = require('../../../examples/session-hooks-lifecycle/javascript/sessionHooks');
const sessionService = require('../../../examples/session-hooks-lifecycle/javascript/sessionService');
const { sharedState } = require('../../../examples/session-hooks-lifecycle/javascript/sessionProvider');

describe('SessionHooks', () => {
  let originalSharedState;
  let originalEnv;
  let consoleSpy;

  beforeEach(() => {
    // Save original state
    originalSharedState = { ...sharedState };
    originalEnv = process.env.TEST_USER_ID;

    // Reset shared state
    sharedState.sessionId = null;

    // Reset session service
    sessionService.sessions.clear();
    sessionService.isInitialized = false;

    // Spy on console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
    };
  });

  afterEach(() => {
    // Restore original state
    Object.assign(sharedState, originalSharedState);
    process.env.TEST_USER_ID = originalEnv;

    // Restore console
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
    consoleSpy.warn.mockRestore();
  });

  describe('beforeAll Hook', () => {
    it('should initialize service and create session', async () => {
      const context = { testContext: 'value' };

      const result = await sessionHook('beforeAll', context);

      // Should return the context
      expect(result).toBe(context);

      // Should have initialized the service
      expect(sessionService.isInitialized).toBe(true);

      // Should have created a session
      expect(sharedState.sessionId).toBeDefined();
      expect(typeof sharedState.sessionId).toBe('string');

      // Should log success messages
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Session Lifecycle Hook: Setting up')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining(`✓ Session created successfully: ${sharedState.sessionId}`)
      );
    });

    it('should use TEST_USER_ID from environment', async () => {
      process.env.TEST_USER_ID = 'custom-test-user';

      await sessionHook('beforeAll', {});

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ User ID: custom-test-user')
      );

      // Verify the session was created with correct user ID
      const session = sessionService.getSession(sharedState.sessionId);
      expect(session.userId).toBe('custom-test-user');
    });

    it('should use default user ID when env var not set', async () => {
      delete process.env.TEST_USER_ID;

      await sessionHook('beforeAll', {});

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ User ID: test-user-123')
      );

      const session = sessionService.getSession(sharedState.sessionId);
      expect(session.userId).toBe('test-user-123');
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock initialize to throw error
      const originalInitialize = sessionService.initialize;
      sessionService.initialize = jest.fn().mockRejectedValue(
        new Error('Initialization failed')
      );

      const context = { test: 'context' };
      const result = await sessionHook('beforeAll', context);

      // Should still return context
      expect(result).toBe(context);

      // Should log error
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '✗ Failed to create session:',
        'Initialization failed'
      );

      // Should not set session ID
      expect(sharedState.sessionId).toBeNull();

      // Restore original method
      sessionService.initialize = originalInitialize;
    });

    it('should handle session creation errors gracefully', async () => {
      // Mock createSession to throw error after initialization
      const originalCreateSession = sessionService.createSession;
      await sessionService.initialize();
      sessionService.createSession = jest.fn().mockImplementation(() => {
        throw new Error('Session creation failed');
      });

      const context = { test: 'context' };
      const result = await sessionHook('beforeAll', context);

      // Should still return context
      expect(result).toBe(context);

      // Should log error
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '✗ Failed to create session:',
        'Session creation failed'
      );

      // Should not set session ID
      expect(sharedState.sessionId).toBeNull();

      // Restore original method
      sessionService.createSession = originalCreateSession;
    });

    it('should not modify context object', async () => {
      const originalContext = {
        key: 'value',
        nested: { prop: 'data' },
      };
      const contextCopy = JSON.parse(JSON.stringify(originalContext));

      const result = await sessionHook('beforeAll', originalContext);

      expect(result).toBe(originalContext);
      expect(originalContext).toEqual(contextCopy);
    });
  });

  describe('afterAll Hook', () => {
    beforeEach(async () => {
      // Initialize service for afterAll tests
      await sessionService.initialize();
    });

    it('should close session and clear shared state', async () => {
      // Create a session first
      const sessionId = sessionService.createSession('cleanup-user');
      sharedState.sessionId = sessionId;

      // Make some requests to generate stats
      await sessionService.makeRequest(sessionId, 'Request 1');
      await sessionService.makeRequest(sessionId, 'Request 2');

      // Call afterAll hook
      await sessionHook('afterAll', {});

      // Should log cleanup messages
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Session Lifecycle Hook: Cleaning up')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Session stats:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining(`✓ Session closed: ${sessionId}`)
      );

      // Should clear shared state
      expect(sharedState.sessionId).toBeNull();

      // Session should be closed
      expect(sessionService.getSession(sessionId)).toBeNull();
    });

    it('should log statistics before closing', async () => {
      const sessionId = sessionService.createSession('stats-user');
      sharedState.sessionId = sessionId;

      // Make requests
      await sessionService.makeRequest(sessionId, 'Request 1');
      await sessionService.makeRequest(sessionId, 'Request 2');
      await sessionService.makeRequest(sessionId, 'Request 3');

      await sessionHook('afterAll', {});

      // Should log stats with correct values
      const statsCall = consoleSpy.log.mock.calls.find(
        call => call[0] && call[0].includes('Session stats:')
      );
      expect(statsCall).toBeDefined();
      expect(statsCall[0]).toContain('"activeSessions":1');
      expect(statsCall[0]).toContain('"totalRequests":3');
    });

    it('should handle missing session gracefully', async () => {
      // No session in shared state
      sharedState.sessionId = null;

      await sessionHook('afterAll', {});

      expect(consoleSpy.log).toHaveBeenCalledWith(
        'ℹ No session to clean up'
      );
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const sessionId = sessionService.createSession('error-user');
      sharedState.sessionId = sessionId;

      // Mock closeSession to throw error
      const originalCloseSession = sessionService.closeSession;
      sessionService.closeSession = jest.fn().mockImplementation(() => {
        throw new Error('Cleanup error');
      });

      await sessionHook('afterAll', {});

      // Should warn about error
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠ Warning during cleanup: Cleanup error')
      );

      // Shared state won't be cleared if there's an error in the try block
      expect(sharedState.sessionId).toBe(sessionId);

      // Restore original method
      sessionService.closeSession = originalCloseSession;
    });

    it('should not return anything from afterAll', async () => {
      const sessionId = sessionService.createSession('return-test-user');
      sharedState.sessionId = sessionId;

      const result = await sessionHook('afterAll', { context: 'value' });

      expect(result).toBeUndefined();
    });

    it('should handle invalid session ID in shared state', async () => {
      // Set an invalid session ID
      sharedState.sessionId = 'non-existent-session';

      await sessionHook('afterAll', {});

      // Should successfully clear state even with invalid session
      // (closeSession handles non-existent sessions gracefully)
      expect(sharedState.sessionId).toBeNull();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });
  });

  describe('Other Hooks', () => {
    it('should ignore beforeEach hook', async () => {
      const context = { test: 'value' };
      const result = await sessionHook('beforeEach', context);

      expect(result).toBeUndefined();
      expect(sharedState.sessionId).toBeNull();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should ignore afterEach hook', async () => {
      const context = { test: 'value' };
      const result = await sessionHook('afterEach', context);

      expect(result).toBeUndefined();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should ignore unknown hooks', async () => {
      const result = await sessionHook('unknownHook', {});

      expect(result).toBeUndefined();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('Hook Lifecycle Integration', () => {
    it('should complete full lifecycle successfully', async () => {
      // Ensure service is initialized for this integration test
      await sessionService.initialize();

      // Simulate full test lifecycle
      const context = { testRun: 'integration' };

      // beforeAll - setup
      const beforeResult = await sessionHook('beforeAll', context);
      expect(beforeResult).toBe(context);
      expect(sharedState.sessionId).toBeDefined();

      const sessionId = sharedState.sessionId;

      // Simulate test execution
      await sessionService.makeRequest(sessionId, 'Test request 1');
      await sessionService.makeRequest(sessionId, 'Test request 2');

      // afterAll - cleanup
      const afterResult = await sessionHook('afterAll', context);
      expect(afterResult).toBeUndefined();
      expect(sharedState.sessionId).toBeNull();
      expect(sessionService.getSession(sessionId)).toBeNull();
    });

    it('should handle multiple lifecycle calls idempotently', async () => {
      // Ensure service is initialized
      await sessionService.initialize();

      // Call beforeAll multiple times
      await sessionHook('beforeAll', {});
      const firstSessionId = sharedState.sessionId;

      await sessionHook('beforeAll', {});
      const secondSessionId = sharedState.sessionId;

      // Should create new session each time
      expect(firstSessionId).not.toBe(secondSessionId);

      // Call afterAll multiple times
      await sessionHook('afterAll', {});
      expect(sharedState.sessionId).toBeNull();

      await sessionHook('afterAll', {});
      expect(consoleSpy.log).toHaveBeenCalledWith('ℹ No session to clean up');
    });
  });

  describe('Console Output', () => {
    it('should format setup output correctly', async () => {
      await sessionHook('beforeAll', {});

      const logCalls = consoleSpy.log.mock.calls.map(call => call[0]);

      expect(logCalls).toContain('\n=== Session Lifecycle Hook: Setting up ===');
      expect(logCalls).toContain('===========================================\n');
      expect(logCalls.some(msg => msg.includes('✓ Session created successfully:'))).toBe(true);
      expect(logCalls.some(msg => msg.includes('✓ User ID:'))).toBe(true);
    });

    it('should format cleanup output correctly', async () => {
      // Ensure service is initialized
      await sessionService.initialize();

      const sessionId = sessionService.createSession('format-user');
      sharedState.sessionId = sessionId;

      await sessionHook('afterAll', {});

      const logCalls = consoleSpy.log.mock.calls.map(call => call[0]);

      expect(logCalls).toContain('\n=== Session Lifecycle Hook: Cleaning up ===');
      expect(logCalls).toContain('============================================\n');
      expect(logCalls.some(msg => msg.includes('✓ Session stats:'))).toBe(true);
      expect(logCalls.some(msg => msg.includes('✓ Session closed:'))).toBe(true);
    });
  });
});