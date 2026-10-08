import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('provider registry signal cleanup', () => {
  it.each(['SIGINT', 'SIGTERM', 'beforeExit'] as const)(
    'waits for an already-closing worker on %s',
    async (signal) => {
      const { providerRegistry } = await import('../../src/providers/providerRegistry');
      const { default: logger } = await import('../../src/logger');
      const worker = spawn(process.execPath, ['-e', 'process.stdin.resume()'], {
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      const closed = once(worker, 'close');
      await once(worker, 'spawn');
      let release!: () => void;
      const closing = new Promise<void>((resolve) => {
        release = resolve;
      });
      const provider = {
        shutdown: vi.fn(async () => {
          await closing;
          worker.stdin.end();
          await closed;
        }),
      };
      const registerHandler = vi.spyOn(process, 'once');
      const debug = vi.spyOn(logger, 'debug');
      providerRegistry.register(provider);
      const handlers = registerHandler.mock.calls.filter(([event]) =>
        ['SIGINT', 'SIGTERM', 'beforeExit'].includes(String(event)),
      );
      const handler = handlers.find(([event]) => event === signal)?.[1];
      const stopping = providerRegistry.shutdownAll();

      try {
        expect(handler).toBeDefined();
        handler!();
        await Promise.resolve();
        await Promise.resolve();

        expect(worker.exitCode).toBeNull();
        expect(provider.shutdown).toHaveBeenCalledOnce();
        expect(debug).not.toHaveBeenCalledWith('Provider shutdown complete');

        release();
        await stopping;
        await vi.waitFor(() => {
          expect(debug).toHaveBeenCalledWith('Provider shutdown complete');
        });
        expect(worker.exitCode).toBe(0);
      } finally {
        release();
        worker.stdin.end();
        await stopping;
        if (worker.exitCode === null && worker.signalCode === null) {
          worker.kill();
        }
        await closed;
        await providerRegistry.shutdownAll();
        for (const [event, listener] of handlers) {
          process.removeListener(event, listener);
        }
      }
    },
  );
});
