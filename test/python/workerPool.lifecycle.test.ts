import { afterEach, describe, expect, it, vi } from 'vitest';
import { PythonWorkerPool } from '../../src/python/workerPool';

const { createWorker } = vi.hoisted(() => ({ createWorker: vi.fn() }));
vi.mock('../../src/python/worker', () => ({
  PythonWorker: vi.fn(function () {
    return createWorker();
  }),
}));

afterEach(() => {
  vi.resetAllMocks();
});

describe('Python worker pool startup ownership', () => {
  it.each([false, true])(
    'rejects late requests while shutdown is pending (cleanup failure: %s)',
    async (cleanupFails) => {
      let ready = true;
      let finish!: () => void;
      const cleanupError = new Error('owned cleanup failure');
      const closing = new Promise<void>((resolve, reject) => {
        finish = () => (cleanupFails ? reject(cleanupError) : resolve());
      });
      const worker = {
        initialize: vi.fn().mockResolvedValue(undefined),
        isReady: vi.fn(() => ready),
        isBusy: vi.fn().mockReturnValue(true),
        call: vi.fn(),
        shutdown: vi.fn(() => {
          ready = false;
          return closing;
        }),
      };
      createWorker.mockReturnValue(worker);
      const pool = new PythonWorkerPool('fixture.py', 'call_api', 1);
      await pool.initialize();
      const queued = pool.execute('call_api', ['queued']).catch((error: Error) => error);
      const shutdown = pool.shutdown().catch((error: Error) => error);
      let lateResult: unknown = 'pending';
      void pool.execute('call_api', ['resumed after I/O']).then(
        (result) => {
          lateResult = result;
        },
        (error: Error) => {
          lateResult = error;
        },
      );

      try {
        await Promise.resolve();
        await Promise.resolve();
        expect(await queued).toEqual(new Error('Worker pool shutting down'));
        expect(lateResult).toEqual(new Error('Worker pool not initialized'));
        expect(worker.call).not.toHaveBeenCalled();
      } finally {
        finish();
        expect(await shutdown).toEqual(cleanupFails ? cleanupError : undefined);
      }
      expect(pool.getWorkerCount()).toBe(cleanupFails ? 1 : 0);
      await expect(pool.execute('call_api', ['after shutdown'])).rejects.toThrow(
        'Worker pool not initialized',
      );
    },
  );

  it('reports a known startup failure promptly while retaining every worker for cleanup', async () => {
    let ready!: () => void;
    const secondReady = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const failed = {
      initialize: vi.fn().mockRejectedValue(new Error('startup failed')),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const pending = {
      initialize: vi.fn().mockReturnValue(secondReady),
      shutdown: vi.fn(async () => ready()),
    };
    createWorker.mockReturnValueOnce(failed).mockReturnValueOnce(pending);
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 2);
    let settled = false;
    const result = pool.initialize().then(
      () => ({ success: true }),
      (error: Error) => {
        settled = true;
        return { error };
      },
    );

    try {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(true);
      await pool.shutdown();
      expect(failed.shutdown).toHaveBeenCalledOnce();
      expect(pending.shutdown).toHaveBeenCalledOnce();
    } finally {
      ready();
    }
    expect(await result).toEqual({ error: new Error('startup failed') });
  });
});
