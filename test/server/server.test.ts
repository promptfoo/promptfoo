import { EventEmitter } from 'node:events';
import http from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../src/migrate', () => ({
  runDbMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/database/signal', () => ({
  setupSignalWatcher: vi.fn().mockReturnValue({
    close: vi.fn(),
    on: vi.fn(),
  }),
  readSignalEvalId: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../src/util/server', () => ({
  BrowserBehavior: { OPEN: 0, SKIP: 1, ASK: 2 },
  BrowserBehaviorNames: { 0: 'OPEN', 1: 'SKIP', 2: 'ASK' },
  openBrowser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/models/eval', () => ({
  default: {
    latest: vi.fn().mockResolvedValue(null),
    latestId: vi.fn().mockResolvedValue(undefined),
  },
  getEvalSummaries: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/models/evalPerformance', () => ({
  getCachedResultsCount: vi.fn().mockResolvedValue(0),
}));

import { readSignalEvalId, setupSignalWatcher } from '../../src/database/signal';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { getCachedResultsCount } from '../../src/models/evalPerformance';
// Import after mocks are set up
import { handleServerError, startServer } from '../../src/server/server';

describe('server', () => {
  describe('handleServerError', () => {
    const originalExit = process.exit;

    beforeEach(() => {
      process.exit = vi.fn() as never;
      vi.clearAllMocks();
    });

    afterEach(() => {
      process.exit = originalExit;
    });

    it('should log specific message for EADDRINUSE error', () => {
      const error = new Error('Address in use') as NodeJS.ErrnoException;
      error.code = 'EADDRINUSE';

      handleServerError(error, 3000);

      expect(logger.error).toHaveBeenCalledWith(
        'Port 3000 is already in use. Do you have another Promptfoo instance running?',
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should log generic message for other errors', () => {
      const error = new Error('Some other error') as NodeJS.ErrnoException;
      error.code = 'ENOENT';

      handleServerError(error, 3000);

      expect(logger.error).toHaveBeenCalledWith('Failed to start server: Some other error');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('startServer shutdown behavior', () => {
    type MockHttpServer = EventEmitter & {
      listen: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      listening: boolean;
    };

    let mockHttpServer: MockHttpServer;
    let originalCreateServer: typeof http.createServer;
    let signalHandlers: Map<string | symbol, ((...args: unknown[]) => void)[]>;

    beforeEach(() => {
      vi.clearAllMocks();

      // Track signal handlers using a Map to support multiple handlers per event
      signalHandlers = new Map();

      vi.spyOn(process, 'once').mockImplementation(
        (event: string | symbol, handler: (...args: unknown[]) => void) => {
          if (event === 'SIGINT' || event === 'SIGTERM') {
            if (!signalHandlers.has(event)) {
              signalHandlers.set(event, []);
            }
            signalHandlers.get(event)!.push(handler);
          }
          return process;
        },
      );

      // Create mock HTTP server
      mockHttpServer = Object.assign(new EventEmitter(), {
        listening: false,
        listen: vi.fn().mockImplementation(function (
          this: MockHttpServer,
          _port: number,
          callback: () => void,
        ) {
          // Simulate async listen - server is now listening
          this.listening = true;
          setImmediate(() => callback());
          return this;
        }),
        close: vi.fn().mockImplementation(function (
          this: MockHttpServer,
          callback?: (err?: Error) => void,
        ) {
          this.listening = false;
          setImmediate(() => callback?.());
        }),
      });

      // Mock http.createServer
      originalCreateServer = http.createServer;
      (http.createServer as unknown) = vi.fn().mockReturnValue(mockHttpServer);
    });

    afterEach(() => {
      http.createServer = originalCreateServer;
      vi.restoreAllMocks();
    });

    const triggerSignal = (signal: 'SIGINT' | 'SIGTERM') => {
      const handlers = signalHandlers.get(signal);
      if (handlers) {
        for (const handler of handlers) {
          handler();
        }
      }
    };

    it('should register SIGINT and SIGTERM handlers', async () => {
      // Start server and immediately trigger shutdown
      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      expect(signalHandlers.has('SIGINT')).toBe(true);
      expect(signalHandlers.has('SIGTERM')).toBe(true);

      // Trigger shutdown to complete the promise
      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('should close file watcher on shutdown', async () => {
      const mockWatcher = { close: vi.fn(), on: vi.fn() };
      vi.mocked(setupSignalWatcher).mockReturnValue(mockWatcher as never);

      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      // Trigger SIGINT
      triggerSignal('SIGINT');
      await serverPromise;

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should log server closure', async () => {
      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      // Trigger SIGINT
      triggerSignal('SIGINT');
      await serverPromise;

      expect(logger.info).toHaveBeenCalledWith('Shutting down server...');
      expect(logger.info).toHaveBeenCalledWith('Server closed');
    });

    it('should handle httpServer.close error gracefully', async () => {
      // Mock close to call callback with error
      mockHttpServer.close = vi.fn().mockImplementation(function (
        callback?: (err?: Error) => void,
      ) {
        setImmediate(() => callback?.(new Error('Close failed')));
      });

      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      // Trigger SIGINT
      triggerSignal('SIGINT');
      await serverPromise;

      expect(logger.warn).toHaveBeenCalledWith('Error closing server: Close failed');
      expect(logger.info).toHaveBeenCalledWith('Server closed');
    });

    // Note: Testing the case where socket.io already closed the HTTP server would require
    // mocking socket.io at the module level. The fix (checking httpServer.listening) handles
    // this case in production where io.close() closes the underlying server.
    //
    // Note: Testing the 5-second force shutdown timeout requires mocking socket.io
    // at the module level, which is complex. The timeout exists as a safety measure
    // and the core shutdown logic is tested by the other tests.

    it('should handle SIGTERM the same as SIGINT', async () => {
      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      // Trigger SIGTERM instead of SIGINT
      triggerSignal('SIGTERM');
      await serverPromise;

      expect(logger.info).toHaveBeenCalledWith('Shutting down server...');
      expect(logger.info).toHaveBeenCalledWith('Server closed');
    });
  });

  describe('socket.io emission behavior', () => {
    let signalWatcherCallback: (() => void | Promise<void>) | null = null;

    beforeEach(() => {
      vi.clearAllMocks();
      signalWatcherCallback = null;

      // Reset mocks to default values
      vi.mocked(readSignalEvalId).mockReturnValue(undefined);
      vi.mocked(Eval.latestId).mockResolvedValue(undefined);
      vi.mocked(getCachedResultsCount).mockResolvedValue(0);

      // Capture the callback passed to setupSignalWatcher
      vi.mocked(setupSignalWatcher).mockImplementation((callback) => {
        signalWatcherCallback = callback as () => void | Promise<void>;
        return { close: vi.fn(), on: vi.fn() } as never;
      });
    });

    it('should use Eval.latestId() instead of Eval.latest() for lightweight queries', async () => {
      const mockEvalId = 'test-eval-123';
      vi.mocked(Eval.latestId).mockResolvedValue(mockEvalId);
      vi.mocked(getCachedResultsCount).mockResolvedValue(5);

      // Start server to register the signal watcher
      const serverPromise = startServer(0);
      await new Promise((resolve) => setImmediate(resolve));

      // Verify the callback was captured
      expect(signalWatcherCallback).not.toBeNull();

      // Trigger the signal watcher callback
      await signalWatcherCallback!();

      // Verify latestId was called (lightweight query)
      expect(Eval.latestId).toHaveBeenCalled();
      // Verify getCachedResultsCount was called with the eval ID
      expect(getCachedResultsCount).toHaveBeenCalledWith(mockEvalId);

      // Clean up
      process.emit('SIGINT', 'SIGINT');
      await serverPromise;
    });

    it('should not emit update when no eval ID is available', async () => {
      vi.mocked(Eval.latestId).mockResolvedValue(undefined);
      vi.mocked(readSignalEvalId).mockReturnValue(undefined);

      const serverPromise = startServer(0);
      await new Promise((resolve) => setImmediate(resolve));

      expect(signalWatcherCallback).not.toBeNull();
      await signalWatcherCallback!();

      // Should not call getCachedResultsCount when no eval ID
      expect(getCachedResultsCount).not.toHaveBeenCalled();

      process.emit('SIGINT', 'SIGINT');
      await serverPromise;
    });

    it('should not emit update when results count is zero', async () => {
      const mockEvalId = 'test-eval-456';
      vi.mocked(Eval.latestId).mockResolvedValue(mockEvalId);
      vi.mocked(getCachedResultsCount).mockResolvedValue(0);

      const serverPromise = startServer(0);
      await new Promise((resolve) => setImmediate(resolve));

      expect(signalWatcherCallback).not.toBeNull();
      await signalWatcherCallback!();

      // Should check results count
      expect(getCachedResultsCount).toHaveBeenCalledWith(mockEvalId);
      // But should not log emit message since count is 0
      expect(logger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('Emitting update for eval'),
      );

      process.emit('SIGINT', 'SIGINT');
      await serverPromise;
    });

    it('should emit update with evalId when results exist', async () => {
      const mockEvalId = 'test-eval-789';
      vi.mocked(Eval.latestId).mockResolvedValue(mockEvalId);
      vi.mocked(getCachedResultsCount).mockResolvedValue(10);

      const serverPromise = startServer(0);
      await new Promise((resolve) => setImmediate(resolve));

      expect(signalWatcherCallback).not.toBeNull();
      await signalWatcherCallback!();

      // Should log the emit message
      expect(logger.debug).toHaveBeenCalledWith(`Emitting update for eval: ${mockEvalId}`);

      process.emit('SIGINT', 'SIGINT');
      await serverPromise;
    });

    it('should prefer signal file eval ID over latest eval ID', async () => {
      const signalEvalId = 'signal-eval-id';
      const latestEvalId = 'latest-eval-id';
      vi.mocked(readSignalEvalId).mockReturnValue(signalEvalId);
      vi.mocked(Eval.latestId).mockResolvedValue(latestEvalId);
      vi.mocked(getCachedResultsCount).mockResolvedValue(5);

      const serverPromise = startServer(0);
      await new Promise((resolve) => setImmediate(resolve));

      expect(signalWatcherCallback).not.toBeNull();
      await signalWatcherCallback!();

      // Should use signal eval ID, not latest
      expect(getCachedResultsCount).toHaveBeenCalledWith(signalEvalId);
      expect(logger.debug).toHaveBeenCalledWith(`Emitting update for eval: ${signalEvalId}`);

      process.emit('SIGINT', 'SIGINT');
      await serverPromise;
    });
  });
});
