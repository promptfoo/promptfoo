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

function makeShell() {
  const created = Object.assign(new EventEmitter(), {
    stderr: new EventEmitter(),
    send: vi.fn(),
    kill: vi.fn(),
  });
  created.send.mockImplementation(() => {
    void Promise.resolve().then(() => created.emit('close'));
  });
  return created;
}

let shell: ReturnType<typeof makeShell>;

beforeEach(() => {
  vi.useFakeTimers();
  validatePythonPath.mockReset().mockResolvedValue('python3');
  shell = makeShell();
  createShell.mockReset().mockReturnValue(shell);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('Python worker startup cancellation', () => {
  it('settles cleanup after the only close event has already followed an import failure', async () => {
    const worker = new PythonWorker('fixture.py', 'call_api');
    const initialized = worker.initialize().catch((error: Error) => error.message);
    await Promise.resolve();
    shell.send.mockImplementation(() => {});
    shell.emit('pythonError', new Error('owned import failure'));
    shell.emit('close');
    expect(await initialized).toBe('owned import failure');

    let settled = false;
    const cleanup = worker.shutdown().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    try {
      expect(settled).toBe(true);
      expect(shell.send).not.toHaveBeenCalled();
      expect(shell.kill).not.toHaveBeenCalled();
    } finally {
      await vi.advanceTimersByTimeAsync(5000);
      await cleanup;
    }
  });

  it('recovers within the remaining crash budget when a replacement fails before READY', async () => {
    const second = makeShell();
    const third = makeShell();
    createShell
      .mockReset()
      .mockReturnValueOnce(shell)
      .mockReturnValueOnce(second)
      .mockReturnValue(third);
    const onReady = vi.fn();
    const worker = new PythonWorker('fixture.py', 'call_api', undefined, undefined, onReady);
    const initialized = worker.initialize();
    await Promise.resolve();
    shell.emit('message', 'READY');
    await initialized;
    shell.emit('close');
    await vi.advanceTimersByTimeAsync(0);
    second.emit('pythonError', new Error('owned transient replacement failure'));
    second.emit('close');
    await vi.advanceTimersByTimeAsync(0);
    try {
      expect(createShell).toHaveBeenCalledTimes(3);
      third.emit('message', 'READY');
      expect(worker.isReady()).toBe(true);
      expect(onReady).toHaveBeenCalledTimes(2);
      // A late event from the first child must not clear or restart its replacement.
      shell.emit('close');
      expect(worker.isReady()).toBe(true);
      expect(createShell).toHaveBeenCalledTimes(3);
    } finally {
      const cleanup = worker.shutdown();
      await vi.advanceTimersByTimeAsync(5000);
      await cleanup;
    }
  });

  it('does not exceed the crash budget when every replacement fails before READY', async () => {
    const second = makeShell();
    const third = makeShell();
    createShell
      .mockReset()
      .mockReturnValueOnce(shell)
      .mockReturnValueOnce(second)
      .mockReturnValue(third);
    const worker = new PythonWorker('fixture.py', 'call_api');
    const initialized = worker.initialize();
    await Promise.resolve();
    shell.emit('message', 'READY');
    await initialized;
    for (const child of [shell, second, third]) {
      child.emit('close');
      await vi.advanceTimersByTimeAsync(0);
    }
    try {
      expect(createShell).toHaveBeenCalledTimes(3);
      expect(worker.isReady()).toBe(false);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(createShell).toHaveBeenCalledTimes(3);
    } finally {
      const cleanup = worker.shutdown();
      await vi.advanceTimersByTimeAsync(5000);
      await cleanup;
    }
  });

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
      expect(shell.send).toHaveBeenCalledWith('SHUTDOWN');
      expect(shell.kill).not.toHaveBeenCalled();
    } finally {
      shell.emit('message', 'READY');
      await initialized;
    }
  });
});
