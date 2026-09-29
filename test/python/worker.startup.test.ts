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
    childProcess: Object.assign(new EventEmitter(), {
      kill: vi.fn().mockReturnValue(true),
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      stdin: { destroy: vi.fn() },
      stdout: { destroy: vi.fn() },
      stderr: { destroy: vi.fn() },
    }),
    send: vi.fn(),
    kill: vi.fn(),
  });
  created.on('close', () => created.childProcess.emit('close'));
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
  it('waits for native close after forcing a worker that ignores graceful shutdown', async () => {
    const onReady = vi.fn();
    const worker = new PythonWorker('fixture.py', 'call_api', undefined, undefined, onReady);
    const initialized = worker.initialize().catch((error: Error) => error.message);
    await Promise.resolve();
    shell.send.mockImplementation(() => {});
    let settled = false;
    const cleanup = worker.shutdown().then(() => {
      settled = true;
    });
    const concurrent = worker.shutdown();
    try {
      await vi.advanceTimersByTimeAsync(5000);
      expect(shell.childProcess.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
      expect(settled).toBe(false);
      expect(shell.send).toHaveBeenCalledOnce();
      shell.emit('message', 'READY');
      expect(worker.isReady()).toBe(false);
      expect(onReady).not.toHaveBeenCalled();
      shell.childProcess.emit('close', null, 'SIGKILL');
      await cleanup;
      await concurrent;
      expect(settled).toBe(true);
      expect(await initialized).toContain('initialization cancelled');
    } finally {
      shell.childProcess.emit('close', null, 'SIGKILL');
      await cleanup;
      await concurrent;
    }
  });

  it('retires inherited pipes after forced termination while still waiting for native close', async () => {
    const worker = new PythonWorker('fixture.py', 'call_api');
    const initialized = worker.initialize().catch((error: Error) => error.message);
    await Promise.resolve();
    shell.send.mockImplementation(() => {});
    const order: string[] = [];
    shell.childProcess.kill.mockImplementation(() => {
      order.push('kill');
      return true;
    });
    for (const name of ['stdin', 'stdout', 'stderr'] as const) {
      shell.childProcess[name].destroy.mockImplementation(() => {
        order.push(name);
      });
    }
    let settled = false;
    const cleanup = worker.shutdown().then(() => {
      settled = true;
    });
    try {
      await vi.advanceTimersByTimeAsync(5000);
      expect(order).toEqual(['kill', 'stdin', 'stdout', 'stderr']);
      expect(settled).toBe(false);
      shell.childProcess.emit('close', null, 'SIGKILL');
      await cleanup;
      expect(await initialized).toContain('initialization cancelled');
    } finally {
      shell.childProcess.emit('close', null, 'SIGKILL');
      await cleanup;
    }
  });

  it('retires inherited pipes when the direct worker has already exited gracefully', async () => {
    const worker = new PythonWorker('fixture.py', 'call_api');
    const initialized = worker.initialize();
    await Promise.resolve();
    shell.emit('message', 'READY');
    await initialized;
    shell.send.mockImplementation(() => {
      shell.childProcess.exitCode = 0;
      shell.childProcess.emit('exit', 0, null);
    });
    shell.childProcess.kill.mockReturnValue(false);
    let outcome = 'pending';
    const cleanup = worker.shutdown().then(
      () => {
        outcome = 'resolved';
      },
      (error: Error) => {
        outcome = error.message;
      },
    );
    try {
      await vi.advanceTimersByTimeAsync(5000);
      expect(outcome).toBe('pending');
      expect(shell.childProcess.kill).not.toHaveBeenCalled();
      for (const name of ['stdin', 'stdout', 'stderr'] as const) {
        expect(shell.childProcess[name].destroy).toHaveBeenCalledOnce();
      }
      shell.childProcess.emit('close', 0, null);
      await cleanup;
      expect(outcome).toBe('resolved');
    } finally {
      shell.childProcess.emit('close', 0, null);
      await cleanup;
    }
  });

  it('retains a worker when forced termination fails so cleanup can be retried', async () => {
    const worker = new PythonWorker('fixture.py', 'call_api');
    const initialized = worker.initialize().catch((error: Error) => error.message);
    await Promise.resolve();
    shell.send.mockImplementation(() => {});
    shell.childProcess.kill.mockReturnValueOnce(false).mockReturnValue(true);
    const first = worker.shutdown().then(
      () => 'resolved',
      (error: Error) => error.message,
    );
    await vi.advanceTimersByTimeAsync(5000);
    try {
      expect(await first).toContain('Failed to terminate Python worker');
      for (const name of ['stdin', 'stdout', 'stderr'] as const) {
        expect(shell.childProcess[name].destroy).not.toHaveBeenCalled();
      }
      const second = worker.shutdown();
      await vi.advanceTimersByTimeAsync(5000);
      expect(shell.childProcess.kill).toHaveBeenCalledTimes(2);
      for (const name of ['stdin', 'stdout', 'stderr'] as const) {
        expect(shell.childProcess[name].destroy).toHaveBeenCalledOnce();
      }
      shell.childProcess.emit('close', null, 'SIGKILL');
      await second;
      expect(await initialized).toContain('initialization cancelled');
    } finally {
      shell.childProcess.emit('close', null, 'SIGKILL');
    }
  });

  it('forces a startup timeout without abandoning the child before native close', async () => {
    const worker = new PythonWorker('fixture.py', 'call_api');
    const initialized = worker.initialize().catch((error: Error) => error.message);
    await Promise.resolve();
    shell.send.mockImplementation(() => {});
    await vi.advanceTimersByTimeAsync(30000);
    expect(await initialized).toContain('failed to become ready');
    let settled = false;
    const cleanup = worker.shutdown().then(() => {
      settled = true;
    });
    try {
      await vi.advanceTimersByTimeAsync(5000);
      expect(shell.childProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(settled).toBe(false);
      expect(shell.send).toHaveBeenCalledOnce();
      shell.childProcess.emit('close', null, 'SIGKILL');
      await cleanup;
    } finally {
      shell.childProcess.emit('close', null, 'SIGKILL');
      await cleanup;
    }
  });

  it('still waits for native close when sending SHUTDOWN throws', async () => {
    const worker = new PythonWorker('fixture.py', 'call_api');
    const initialized = worker.initialize().catch((error: Error) => error.message);
    await Promise.resolve();
    shell.send.mockImplementation(() => {
      throw new Error('closed stdin');
    });
    let settled = false;
    const cleanup = worker.shutdown().then(() => {
      settled = true;
    });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(shell.childProcess.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
      expect(settled).toBe(false);
      shell.childProcess.emit('close', null, 'SIGKILL');
      await cleanup;
      expect(await initialized).toContain('initialization cancelled');
    } finally {
      shell.childProcess.emit('close', null, 'SIGKILL');
      await cleanup;
    }
  });

  it.each(['before cleanup', 'during cleanup'])(
    'settles a failed spawn whose native close occurs %s without a PythonShell close',
    async (timing) => {
      const worker = new PythonWorker('fixture.py', 'call_api');
      const initialized = worker.initialize().catch((error: Error) => error.message);
      await Promise.resolve();
      shell.send.mockImplementation(() => {});
      shell.emit('error', Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }));
      expect(await initialized).toBe('spawn python3 ENOENT');
      if (timing === 'before cleanup') {
        shell.childProcess.emit('close', -2, null);
      }
      let settled = false;
      const cleanup = worker.shutdown().then(() => {
        settled = true;
      });
      if (timing === 'during cleanup') {
        shell.childProcess.emit('close', -2, null);
      }
      await vi.advanceTimersByTimeAsync(0);
      try {
        expect(settled).toBe(true);
        expect(worker.isReady()).toBe(false);
        expect(createShell).toHaveBeenCalledOnce();
        expect(shell.kill).not.toHaveBeenCalled();
      } finally {
        await vi.advanceTimersByTimeAsync(5000);
        await cleanup;
      }
    },
  );

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

  it('keeps the startup watchdog armed when a failed replacement has not closed', async () => {
    const replacement = makeShell();
    replacement.send.mockImplementation(() => {});
    createShell.mockReturnValueOnce(shell).mockReturnValue(replacement);
    const worker = new PythonWorker('fixture.py', 'call_api');
    const initialized = worker.initialize();
    await Promise.resolve();
    shell.emit('message', 'READY');
    await initialized;
    shell.emit('close');
    await vi.advanceTimersByTimeAsync(0);
    replacement.emit('pythonError', new Error('replacement import failed'));

    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(replacement.send).toHaveBeenCalledExactlyOnceWith('SHUTDOWN');
      await vi.advanceTimersByTimeAsync(5000);
      expect(replacement.childProcess.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
      expect(worker.isReady()).toBe(false);
      for (const stream of ['stdin', 'stdout', 'stderr'] as const) {
        expect(replacement.childProcess[stream].destroy).toHaveBeenCalledOnce();
      }
    } finally {
      replacement.childProcess.emit('close', null, 'SIGKILL');
      await worker.shutdown();
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
