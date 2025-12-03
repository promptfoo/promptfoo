import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { EventEmitter } from 'node:events';

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

// Import after mocks are set up
import { startServer, handleServerError } from '../../src/server/server';
import { setupSignalWatcher } from '../../src/database/signal';
import logger from '../../src/logger';

describe('server', () => {
  describe('handleServerError', () => {
    const originalExit = process.exit;

    beforeEach(() => {
      process.exit = vi.fn() as any;
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
    let mockHttpServer: EventEmitter & {
      listen: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
    let mockSocketIo: EventEmitter & {
      close: ReturnType<typeof vi.fn>;
    };
    let originalCreateServer: typeof http.createServer;
    let signalHandlers: { SIGINT?: () => void; SIGTERM?: () => void };

    beforeEach(() => {
      vi.clearAllMocks();

      // Track signal handlers
      signalHandlers = {};
      vi.spyOn(process, 'on').mockImplementation((event: string, handler: any) => {
        if (event === 'SIGINT' || event === 'SIGTERM') {
          signalHandlers[event] = handler;
        }
        return process;
      });
      vi.spyOn(process, 'off').mockImplementation(() => process);

      // Create mock HTTP server
      mockHttpServer = Object.assign(new EventEmitter(), {
        listen: vi.fn().mockImplementation(function (
          this: any,
          _port: number,
          callback: () => void,
        ) {
          // Simulate async listen
          setImmediate(() => callback());
          return this;
        }),
        close: vi.fn().mockImplementation(function (callback?: (err?: Error) => void) {
          setImmediate(() => callback?.());
        }),
      });

      // Create mock Socket.io server
      mockSocketIo = Object.assign(new EventEmitter(), {
        close: vi.fn().mockImplementation(function (callback?: () => void) {
          setImmediate(() => callback?.());
        }),
      });

      // Mock http.createServer
      originalCreateServer = http.createServer;
      (http.createServer as any) = vi.fn().mockReturnValue(mockHttpServer);

      // Mock socket.io Server constructor
      vi.doMock('socket.io', () => ({
        Server: vi.fn().mockImplementation(() => mockSocketIo),
      }));
    });

    afterEach(() => {
      http.createServer = originalCreateServer;
      vi.restoreAllMocks();
    });

    it('should register SIGINT and SIGTERM handlers', async () => {
      // Start server and immediately trigger shutdown
      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      expect(signalHandlers.SIGINT).toBeDefined();
      expect(signalHandlers.SIGTERM).toBeDefined();

      // Trigger shutdown to complete the promise
      signalHandlers.SIGINT?.();
      await serverPromise;
    });

    it('should close file watcher on shutdown', async () => {
      const mockWatcher = { close: vi.fn(), on: vi.fn() };
      vi.mocked(setupSignalWatcher).mockReturnValue(mockWatcher as any);

      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      // Trigger SIGINT
      signalHandlers.SIGINT?.();
      await serverPromise;

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should only shutdown once even if multiple signals received', async () => {
      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      // Trigger multiple signals
      signalHandlers.SIGINT?.();
      signalHandlers.SIGINT?.();
      signalHandlers.SIGTERM?.();

      await serverPromise;

      // logger.info for 'Shutting down server...' should only be called once
      const shutdownCalls = vi
        .mocked(logger.info)
        .mock.calls.filter((call) => call[0] === 'Shutting down server...');
      expect(shutdownCalls).toHaveLength(1);
    });

    it('should remove signal handlers after shutdown starts', async () => {
      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      // Trigger SIGINT
      signalHandlers.SIGINT?.();
      await serverPromise;

      // process.off should have been called for both signals
      expect(process.off).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.off).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should log server closure', async () => {
      const serverPromise = startServer(0);

      // Wait for server to start
      await new Promise((resolve) => setImmediate(resolve));

      // Trigger SIGINT
      signalHandlers.SIGINT?.();
      await serverPromise;

      expect(logger.info).toHaveBeenCalledWith('Shutting down server...');
      expect(logger.info).toHaveBeenCalledWith('Server closed');
    });
  });
});
