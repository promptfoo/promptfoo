import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PythonWorker } from '../../src/python/worker';

const { validatePythonPath, createShell } = vi.hoisted(() => ({
  validatePythonPath: vi.fn(),
  createShell: vi.fn(),
}));

vi.mock('../../src/python/pythonUtils', () => ({ validatePythonPath }));
vi.mock('python-shell', () => ({
  PythonShell: vi.fn(function () {
    return createShell();
  }),
}));

let shell: EventEmitter & {
  stderr: EventEmitter;
  send: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.useFakeTimers();
  validatePythonPath.mockReset().mockResolvedValue('python3');
  shell = Object.assign(new EventEmitter(), {
    stderr: new EventEmitter(),
    send: vi.fn(() => {
      void Promise.resolve().then(() => shell.emit('close'));
    }),
    kill: vi.fn(),
  });
  createShell.mockReset().mockReturnValue(shell);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('Python worker startup cancellation', () => {
  it('reports an import failure without restarting a worker that never became ready', async () => {
    const worker = new PythonWorker('fixture.py', 'call_api');
    let outcome = 'pending';
    const initialized = worker.initialize().then(
      () => {
        outcome = 'ready';
      },
      (error: Error) => {
        outcome = error.message;
      },
    );
    await Promise.resolve();
    shell.emit('pythonError', new Error('owned import failure'));
    shell.emit('close');
    await vi.advanceTimersByTimeAsync(0);
    try {
      expect(outcome).toBe('owned import failure');
      expect(createShell).toHaveBeenCalledOnce();
    } finally {
      shell.emit('message', 'READY');
      await initialized;
      await worker.shutdown();
    }
  });

  it('does not spawn after shutdown while Python path resolution is pending', async () => {
    let resolvePath!: (value: string) => void;
    validatePythonPath.mockReturnValue(
      new Promise<string>((resolve) => {
        resolvePath = resolve;
      }),
    );
    const worker = new PythonWorker('fixture.py', 'call_api');
    const initialized = worker.initialize().then(
      () => 'ready',
      (error: Error) => error.message,
    );

    await worker.shutdown();
    resolvePath('python3');
    await Promise.resolve();
    // Settle the pre-fix path too, so the regression never leaves a pending startup.
    shell.emit('message', 'READY');
    expect(await initialized).toContain('initialization cancelled');
    expect(createShell).not.toHaveBeenCalled();
  });

  it('settles and clears the READY wait when an initializing worker is shut down', async () => {
    const worker = new PythonWorker('fixture.py', 'call_api');
    let outcome = 'pending';
    const initialized = worker.initialize().then(
      () => {
        outcome = 'ready';
      },
      (error: Error) => {
        outcome = error.message;
      },
    );
    await Promise.resolve();
    expect(createShell).toHaveBeenCalledOnce();

    await worker.shutdown();
    await Promise.resolve();
    try {
      expect(outcome).toContain('initialization cancelled');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(shell.kill).toHaveBeenCalledOnce();
    } finally {
      shell.emit('message', 'READY');
      await initialized;
    }
  });
});
