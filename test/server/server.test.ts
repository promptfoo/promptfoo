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
  },
  getEvalSummaries: vi.fn().mockResolvedValue([]),
}));

import { setupSignalWatcher } from '../../src/database/signal';
import logger from '../../src/logger';
// Import after mocks are set up
import { ServerError } from '../../src/server/errors';
import { handleServerError, startServer } from '../../src/server/server';

describe('server', () => {
  describe('handleServerError', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should log specific message for EADDRINUSE error', () => {
      const error = new Error('Address in use') as NodeJS.ErrnoException;
      error.code = 'EADDRINUSE';

      const startupError = handleServerError(error, 3000);

      expect(logger.error).toHaveBeenCalledWith(
        'Port 3000 is already in use. Do you have another Promptfoo instance running?',
      );
      expect(startupError).toBeInstanceOf(ServerError);
      expect(startupError).toMatchObject({
        code: 'EADDRINUSE',
        phase: 'startup',
        message: 'Port 3000 is already in use. Do you have another Promptfoo instance running?',
        port: 3000,
      });
    });

    it('should log generic message for other errors', () => {
      const error = new Error('Some other error') as NodeJS.ErrnoException;
      error.code = 'ENOENT';

      const startupError = handleServerError(error, 3000);

      expect(logger.error).toHaveBeenCalledWith('Failed to start server: Some other error');
      expect(startupError).toBeInstanceOf(ServerError);
      expect(startupError).toMatchObject({
        code: 'ENOENT',
        phase: 'startup',
        message: 'Failed to start server: Some other error',
        port: 3000,
      });
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

    it('should reject startup errors without exiting the process', async () => {
      const startupError = new Error('Address in use') as NodeJS.ErrnoException;
      startupError.code = 'EADDRINUSE';
      const mockWatcher = { close: vi.fn(), on: vi.fn() };
      vi.mocked(setupSignalWatcher).mockReturnValueOnce(mockWatcher as never);

      mockHttpServer.listen = vi.fn().mockImplementation(function (this: MockHttpServer) {
        setImmediate(() => this.emit('error', startupError));
        return this;
      });

      await expect(startServer(3000)).rejects.toMatchObject({
        name: 'ServerError',
        code: 'EADDRINUSE',
        phase: 'startup',
        message: 'Port 3000 is already in use. Do you have another Promptfoo instance running?',
        port: 3000,
      });

      expect(mockWatcher.close).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Port 3000 is already in use. Do you have another Promptfoo instance running?',
      );
    });

    it('should close the live server before rejecting runtime server errors', async () => {
      const runtimeError = new Error('Unexpected runtime failure') as NodeJS.ErrnoException;
      const mockWatcher = { close: vi.fn(), on: vi.fn() };
      vi.mocked(setupSignalWatcher).mockReturnValueOnce(mockWatcher as never);

      const serverPromise = startServer(0);

      await vi.waitFor(() =>
        expect(logger.info).toHaveBeenCalledWith(
          'Server running at http://localhost:0 and monitoring for new evals.',
        ),
      );
      mockHttpServer.emit('error', runtimeError);

      await expect(serverPromise).rejects.toMatchObject({
        name: 'ServerError',
        phase: 'runtime',
        message: 'Server error: Unexpected runtime failure',
        port: 0,
      });
      expect(mockWatcher.close).toHaveBeenCalled();
      expect(mockHttpServer.close).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Server error: Unexpected runtime failure');
    });

    it('should close file watcher on shutdown', async () => {
      const mockWatcher = { close: vi.fn(), on: vi.fn() };
      vi.mocked(setupSignalWatcher).mockReturnValueOnce(mockWatcher as never);

      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      // Trigger SIGINT
      triggerSignal('SIGINT');
      await serverPromise;

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should not deadlock the shutdown promise if watcher.close throws', async () => {
      const mockWatcher = {
        close: vi.fn().mockImplementation(() => {
          throw new Error('watcher already closed');
        }),
        on: vi.fn(),
      };
      vi.mocked(setupSignalWatcher).mockReturnValueOnce(mockWatcher as never);

      const serverPromise = startServer(0);
      await new Promise((resolve) => setImmediate(resolve));

      triggerSignal('SIGINT');
      await expect(serverPromise).resolves.toBeUndefined();

      expect(mockWatcher.close).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error closing file watcher'),
      );
    });

    it('should not deadlock startup-error rejection if watcher.close throws', async () => {
      const startupError = new Error('Address in use') as NodeJS.ErrnoException;
      startupError.code = 'EADDRINUSE';
      const mockWatcher = {
        close: vi.fn().mockImplementation(() => {
          throw new Error('watcher unhappy');
        }),
        on: vi.fn(),
      };
      vi.mocked(setupSignalWatcher).mockReturnValueOnce(mockWatcher as never);

      mockHttpServer.listen = vi.fn().mockImplementation(function (this: MockHttpServer) {
        setImmediate(() => this.emit('error', startupError));
        return this;
      });

      await expect(startServer(3000)).rejects.toMatchObject({
        name: 'ServerError',
        phase: 'startup',
      });
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
});
