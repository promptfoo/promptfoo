import { EventEmitter } from 'node:events';
import http from 'node:http';

import { Server as SocketIOServer } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../src/migrate', () => ({
  runDbMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/database/signal', async () => {
  const actual = await vi.importActual('../../src/database/signal');
  return {
    // Keep the real (pure) signal classifiers so the watcher's emit decisions are exercised.
    ...actual,
    readSignalFile: vi.fn().mockReturnValue({ type: 'update' }),
    setupSignalWatcher: vi.fn().mockReturnValue({
      close: vi.fn(),
      on: vi.fn(),
    }),
  };
});

vi.mock('../../src/models/evalMutation', () => ({
  invalidateEvaluationCache: vi.fn(),
  invalidateEvaluationCaches: vi.fn(),
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
    findById: vi.fn().mockResolvedValue(null),
    latest: vi.fn().mockResolvedValue(null),
  },
  getEvalSummaries: vi.fn().mockResolvedValue([]),
}));

import { readSignalFile, setupSignalWatcher } from '../../src/database/signal';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import {
  invalidateEvaluationCache,
  invalidateEvaluationCaches,
} from '../../src/models/evalMutation';
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

    it('should invalidate process-local evaluation caches when the signal file changes', async () => {
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      expect(invalidateEvaluationCache).toHaveBeenCalledWith(undefined);

      await new Promise((resolve) => setImmediate(resolve));

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('should scope process-local evaluation cache invalidation to the signaled eval', async () => {
      vi.mocked(readSignalFile).mockReturnValueOnce({
        type: 'update',
        evalId: 'eval-12345-abcdef',
      });
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      expect(invalidateEvaluationCaches).toHaveBeenCalledWith(['eval-12345-abcdef']);

      await new Promise((resolve) => setImmediate(resolve));

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('should emit scoped updates for legacy evals without normalized result rows', async () => {
      const getResultsCount = vi.fn().mockResolvedValue(0);
      vi.mocked(readSignalFile).mockReturnValueOnce({ type: 'update', evalId: 'legacy-eval' });
      vi.mocked(Eval.findById).mockResolvedValueOnce({
        id: 'legacy-eval',
        config: {},
        getResultsCount,
      } as never);
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await vi.waitFor(() =>
        expect(logger.debug).toHaveBeenCalledWith('Emitting update for eval: legacy-eval'),
      );
      expect(getResultsCount).not.toHaveBeenCalled();

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('should emit an empty update when no evals remain after a mutation', async () => {
      const emitSpy = vi.spyOn(SocketIOServer.prototype, 'emit');
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await vi.waitFor(() => expect(emitSpy).toHaveBeenCalledWith('update', null));

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('should ignore scoped updates for evals that were not persisted', async () => {
      const emitSpy = vi.spyOn(SocketIOServer.prototype, 'emit');
      vi.mocked(readSignalFile).mockReturnValueOnce({ type: 'update', evalId: 'missing-eval' });
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await new Promise((resolve) => setImmediate(resolve));
      expect(emitSpy).not.toHaveBeenCalledWith('update', null);
      expect(emitSpy).not.toHaveBeenCalledWith('update', { evalId: 'missing-eval' });

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('should broadcast the latest eval for an unscoped mutation', async () => {
      const emitSpy = vi.spyOn(SocketIOServer.prototype, 'emit');
      vi.mocked(Eval.latest).mockResolvedValueOnce({ id: 'surviving-eval' } as never);
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await vi.waitFor(() =>
        expect(emitSpy).toHaveBeenCalledWith('update', { evalId: 'surviving-eval' }),
      );

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('should broadcast deleted eval IDs without selecting a surviving eval', async () => {
      const emitSpy = vi.spyOn(SocketIOServer.prototype, 'emit');
      vi.mocked(readSignalFile).mockReturnValueOnce({
        type: 'delete',
        deletedEvalIds: ['deleted-eval'],
      });
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await vi.waitFor(() =>
        expect(emitSpy).toHaveBeenCalledWith('update', { deletedEvalIds: ['deleted-eval'] }),
      );

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('should broadcast an empty id list when a delete signal omits ids (delete-all)', async () => {
      const emitSpy = vi.spyOn(SocketIOServer.prototype, 'emit');
      // delete-all writes `{type:'delete'}` with no deletedEvalIds; the watcher should still
      // broadcast a delete with an empty list so clients clear/reload.
      vi.mocked(readSignalFile).mockReturnValueOnce({ type: 'delete' });
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await vi.waitFor(() =>
        expect(emitSpy).toHaveBeenCalledWith('update', { deletedEvalIds: [] }),
      );

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('should emit both a delete and an update for a coalesced delete+update signal', async () => {
      const emitSpy = vi.spyOn(SocketIOServer.prototype, 'emit');
      // A delete that folded in a pending scoped update (two mutations coalesced in the window)
      // must broadcast the removed eval AND refresh clients to the surviving update.
      vi.mocked(readSignalFile).mockReturnValueOnce({
        type: 'delete',
        deletedEvalIds: ['deleted-eval'],
        evalId: 'surviving-eval',
      });
      vi.mocked(Eval.findById).mockResolvedValueOnce({
        id: 'surviving-eval',
        config: {},
      } as never);
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await vi.waitFor(() =>
        expect(emitSpy).toHaveBeenCalledWith('update', { deletedEvalIds: ['deleted-eval'] }),
      );
      await vi.waitFor(() =>
        expect(emitSpy).toHaveBeenCalledWith('update', { evalId: 'surviving-eval' }),
      );

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('emits an update per eval for a coalesced multi-update signal', async () => {
      const emitSpy = vi.spyOn(SocketIOServer.prototype, 'emit');
      // Two back-to-back scoped updates coalesced in the window must each refresh their clients.
      vi.mocked(readSignalFile).mockReturnValueOnce({
        type: 'update',
        evalId: 'eval-Z',
        updatedEvalIds: ['eval-Y', 'eval-Z'],
      });
      // The watcher resolves the ids in order; mockResolvedValueOnce avoids leaking a persistent
      // implementation into other (randomly-ordered) tests.
      vi.mocked(Eval.findById)
        .mockResolvedValueOnce({ id: 'eval-Y', config: {} } as never)
        .mockResolvedValueOnce({ id: 'eval-Z', config: {} } as never);
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await vi.waitFor(() => expect(emitSpy).toHaveBeenCalledWith('update', { evalId: 'eval-Y' }));
      await vi.waitFor(() => expect(emitSpy).toHaveBeenCalledWith('update', { evalId: 'eval-Z' }));
      // Every coalesced eval's process-local caches are invalidated, not just the latest.
      expect(invalidateEvaluationCaches).toHaveBeenCalledWith(['eval-Y', 'eval-Z']);

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('does not resurrect a deleted eval when a coalesced delete carries its own id', async () => {
      const emitSpy = vi.spyOn(SocketIOServer.prototype, 'emit');
      // Pathological coalescing: the carried update id is also in deletedEvalIds. The delete
      // must broadcast, but the update component must NOT emit (findById -> null) — and it must
      // not fall back to broadcasting the latest eval, since the signal was scoped.
      vi.mocked(readSignalFile).mockReturnValueOnce({
        type: 'delete',
        deletedEvalIds: ['doomed-eval'],
        evalId: 'doomed-eval',
      });
      vi.mocked(Eval.findById).mockResolvedValueOnce(undefined as never);
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await vi.waitFor(() =>
        expect(emitSpy).toHaveBeenCalledWith('update', { deletedEvalIds: ['doomed-eval'] }),
      );
      // Give the async update branch a chance to (not) emit.
      await new Promise((resolve) => setImmediate(resolve));
      expect(emitSpy).not.toHaveBeenCalledWith('update', { evalId: 'doomed-eval' });
      expect(emitSpy).not.toHaveBeenCalledWith('update', null);

      triggerSignal('SIGINT');
      await serverPromise;
    });

    it('keeps the server alive when a signal-triggered eval lookup rejects', async () => {
      // The watcher callback is fire-and-forget; a rejected DB lookup must be caught and logged
      // rather than becoming an unhandledRejection that tears down the long-running view server.
      vi.mocked(readSignalFile).mockReturnValueOnce({ type: 'update', evalId: 'boom-eval' });
      vi.mocked(Eval.findById).mockRejectedValueOnce(new Error('libsql exploded'));
      const serverPromise = startServer(0);

      await new Promise((resolve) => setImmediate(resolve));

      const onSignalChange = vi.mocked(setupSignalWatcher).mock.calls[0][0];
      onSignalChange();

      await vi.waitFor(() =>
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Failed to handle eval signal update'),
        ),
      );

      // The server is still running and shuts down cleanly.
      triggerSignal('SIGINT');
      await expect(serverPromise).resolves.toBeUndefined();
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
