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
  it('settles other started workers before reporting an initialization failure', async () => {
    let ready!: () => void;
    const secondReady = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const failed = { initialize: vi.fn().mockRejectedValue(new Error('startup failed')) };
    const pending = { initialize: vi.fn().mockReturnValue(secondReady) };
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
      expect(settled).toBe(false);
    } finally {
      ready();
    }
    expect(await result).toEqual({ error: new Error('startup failed') });
  });
});
