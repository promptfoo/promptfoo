import fs from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import type { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { PythonWorker } from '../../src/python/worker';
import { PythonWorkerPool } from '../../src/python/workerPool';
import * as secureTempFiles from '../../src/util/secureTempFiles';
import { createDeferred } from '../util/utils';
import type { Options } from 'python-shell';
import type { MockInstance } from 'vitest';

const { execFileAsync, shells, signals } = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
  shells: [] as Array<EventEmitter & { options: Options; send(command: string): void }>,
  signals: { autoReady: true },
}));

vi.mock('child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: execFileAsync,
  }),
}));
vi.mock('python-shell', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    PythonShell: class extends EventEmitter {
      stderr = new EventEmitter();
      constructor(
        _script: string,
        public options: Options,
      ) {
        super();
        shells.push(this);
        if (signals.autoReady) {
          queueMicrotask(() => this.emit('message', 'READY'));
        }
      }
      send() {
        queueMicrotask(() => this.emit('close'));
      }
      kill() {}
    },
  };
});
vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Python pool executable validation', () => {
  const pools: PythonWorkerPool[] = [];

  beforeEach(() => {
    execFileAsync.mockReset();
    execFileAsync.mockResolvedValue({ stdout: 'Python 3.12.0', stderr: '' });
    shells.length = 0;
    signals.autoReady = true;
  });

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.shutdown()));
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('probes once before starting all workers in a pool', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 4, 'fixture-python');
    pools.push(pool);
    await pool.initialize();
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    expect(shells).toHaveLength(4);
    expect(shells.every((shell) => shell.options.pythonPath === 'fixture-python')).toBe(true);
  });

  it('keeps validation independent across concurrent pools with different file environments', async () => {
    await Promise.all(
      ['first', 'second'].map((label) =>
        cliState.withEnvFileOverrides({ PATH: `/fixture/${label}` }, async () => {
          const pool = new PythonWorkerPool('fixture.py', 'call_api', 3, 'fixture-python');
          pools.push(pool);
          await pool.initialize();
        }),
      ),
    );
    expect(execFileAsync).toHaveBeenCalledTimes(2);
    expect(execFileAsync.mock.calls.map((call) => call[2].env.PATH).sort()).toEqual([
      '/fixture/first',
      '/fixture/second',
    ]);
    expect(shells.map((shell) => shell.options.env?.PATH).sort()).toEqual([
      '/fixture/first',
      '/fixture/first',
      '/fixture/first',
      '/fixture/second',
      '/fixture/second',
      '/fixture/second',
    ]);
  });

  it('starts no workers when validation fails and retries after the executable is restored', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 3, 'fixture-python');
    pools.push(pool);
    execFileAsync.mockRejectedValue(new Error('fixture missing'));
    await expect(pool.initialize()).rejects.toThrow('Python 3 not found');
    expect(shells).toHaveLength(0);
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    execFileAsync.mockResolvedValue({ stdout: 'Python 3.12.0', stderr: '' });
    await pool.initialize();
    expect(pool.getWorkerCount()).toBe(3);
    expect(execFileAsync).toHaveBeenCalledTimes(2);
  });

  it.each(['starting', 'ready'] as const)(
    'cleans up a %s peer before retrying failed pool initialization',
    async (peerState) => {
      const pool = new PythonWorkerPool('fixture.py', 'call_api', 2, 'fixture-python');
      pools.push(pool);
      signals.autoReady = false;
      const initialized = pool.initialize().catch((error) => error);
      await setImmediate();
      expect(shells).toHaveLength(2);
      const peerSend = vi.spyOn(shells[1], 'send');
      if (peerState === 'ready') {
        shells[1].emit('message', 'READY');
      }
      shells[0].emit('close');
      expect(await initialized).toEqual(new Error('Worker exited before becoming ready'));
      expect(peerSend).toHaveBeenCalledWith('SHUTDOWN');
      expect(pool.getWorkerCount()).toBe(0);

      signals.autoReady = true;
      await pool.initialize();
      expect(pool.getWorkerCount()).toBe(2);
      expect(shells).toHaveLength(4);
      expect(execFileAsync).toHaveBeenCalledTimes(2);
    },
  );

  it('revalidates the executable when a worker restarts after a crash', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 2, 'fixture-python');
    pools.push(pool);
    await pool.initialize();
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    shells[0].emit('close');
    await vi.waitFor(() => expect(shells).toHaveLength(3));
    expect(execFileAsync).toHaveBeenCalledTimes(2);
  });

  it('rejects queued and new calls when restart validation fails', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 1, 'fixture-python');
    pools.push(pool);
    await pool.initialize();
    execFileAsync.mockRejectedValueOnce(new Error('fixture missing'));
    shells[0].emit('close');
    const queued = pool.execute('call_api', []).catch((error) => error);
    await setImmediate();
    const outcome = await Promise.race([queued, Promise.resolve('still queued')]);
    expect(outcome).toEqual(new Error('Python worker pool has no usable workers'));
    await expect(pool.execute('call_api', [])).rejects.toThrow('no usable workers');
    expect(shells).toHaveLength(1);
  });

  it('rejects queued calls after the crash limit is reached', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 1, 'fixture-python');
    pools.push(pool);
    await pool.initialize();
    for (let crash = 0; crash < 2; crash++) {
      shells[crash].emit('close');
      await setImmediate();
    }
    signals.autoReady = false;
    shells[2].emit('close');
    const queued = pool.execute('call_api', []).catch((error) => error);
    await setImmediate();
    expect(await Promise.race([queued, Promise.resolve('still queued')])).toEqual(
      new Error('Python worker pool has no usable workers'),
    );
    expect(execFileAsync).toHaveBeenCalledTimes(3);
    expect(shells).toHaveLength(3);
  });

  it.each(['close', 'timeout'] as const)(
    'rejects queued calls when replacement startup fails by %s',
    async (failure) => {
      const pool = new PythonWorkerPool('fixture.py', 'call_api', 1, 'fixture-python');
      pools.push(pool);
      await pool.initialize();
      vi.useFakeTimers();
      signals.autoReady = false;
      shells[0].emit('close');
      await setImmediate();
      const queued = pool.execute('call_api', []).catch((error) => error);
      if (failure === 'close') {
        shells[1].emit('close');
      } else {
        await vi.advanceTimersByTimeAsync(30000);
      }
      await setImmediate();
      expect(await Promise.race([queued, Promise.resolve('still queued')])).toEqual(
        new Error('Python worker pool has no usable workers'),
      );
      expect(vi.getTimerCount()).toBe(0);
      expect(shells).toHaveLength(2);
    },
  );

  it('drains queued calls after a successful restart', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 1, 'fixture-python');
    pools.push(pool);
    await pool.initialize();
    vi.spyOn(PythonWorker.prototype, 'call').mockResolvedValue({ output: 'recovered' });
    shells[0].emit('close');
    await expect(pool.execute('call_api', [])).resolves.toEqual({ output: 'recovered' });
    expect(shells).toHaveLength(2);
  });

  it('keeps serving queued calls with a healthy peer after one worker fails', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 2, 'fixture-python');
    pools.push(pool);
    await pool.initialize();
    let finishHealthyCall!: (value: unknown) => void;
    const call = vi.spyOn(PythonWorker.prototype, 'call');
    call.mockImplementationOnce(function (this: PythonWorker) {
      const busy = vi.spyOn(this, 'isBusy').mockReturnValue(true);
      return new Promise((resolve) => {
        finishHealthyCall = (value) => {
          busy.mockRestore();
          resolve(value);
        };
      });
    });
    call.mockResolvedValue({ output: 'healthy' });
    execFileAsync.mockRejectedValueOnce(new Error('fixture missing'));
    shells[0].emit('close');
    const active = pool.execute('call_api', []);
    const queued = pool.execute('call_api', []);
    await setImmediate();
    finishHealthyCall({ output: 'active' });
    await expect(active).resolves.toEqual({ output: 'active' });
    await expect(queued).resolves.toEqual({ output: 'healthy' });
    await expect(pool.execute('call_api', [])).resolves.toEqual({ output: 'healthy' });
  });

  it.each(['revalidating', 'starting', 'ready', 'shutdown'] as const)(
    'does not dispatch a prepared request after its worker changes (%s)',
    async (state) => {
      const preparation = createDeferred<string>();
      const validation = createDeferred<{ stdout: string; stderr: string }>();
      vi.spyOn(secureTempFiles, 'createSecureTempDirectory')
        .mockResolvedValue('/fixture/temporary')
        .mockReturnValueOnce(preparation.promise);
      vi.spyOn(secureTempFiles, 'writeSecureTempFile').mockImplementation(
        async (_directory, name) => `/fixture/${name}`,
      );
      const remove = vi.spyOn(secureTempFiles, 'removeSecureTempDirectory').mockResolvedValue();
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({ type: 'result', data: 'recovered' }),
      );
      const worker = new PythonWorker('fixture.py', 'call_api', 'fixture-python', 1000);
      await worker.initialize('fixture-python');
      const originalSend = vi.spyOn(shells[0], 'send');
      const result = worker.call('call_api', []).catch((error) => error);
      let replacementSend: MockInstance<(command: string) => void> | undefined;
      try {
        if (state === 'shutdown') {
          await worker.shutdown();
        } else {
          if (state === 'revalidating') {
            execFileAsync.mockReturnValueOnce(validation.promise);
          }
          signals.autoReady = state === 'ready';
          shells[0].emit('close');
          await setImmediate();
          if (state !== 'revalidating') {
            expect(shells).toHaveLength(2);
            replacementSend = vi.spyOn(shells[1], 'send').mockImplementation(() => {
              throw new Error('Unexpected stale dispatch');
            });
            expect(worker.isReady()).toBe(state === 'ready');
          }
        }
        preparation.resolve('/fixture/temporary');
        expect(await result).toEqual(
          new Error(
            state === 'shutdown'
              ? 'Worker shutting down'
              : 'Worker changed while preparing request',
          ),
        );
        expect(originalSend.mock.calls.some(([command]) => command.startsWith('CALL|'))).toBe(
          false,
        );
        if (replacementSend) {
          expect(replacementSend).not.toHaveBeenCalled();
        }
        expect(remove).toHaveBeenCalledExactlyOnceWith('/fixture/temporary');
        expect(worker.isBusy()).toBe(false);

        if (state === 'ready') {
          replacementSend!.mockRestore();
          replacementSend = vi.spyOn(shells[1], 'send').mockImplementation((command: string) => {
            queueMicrotask(() =>
              command === 'SHUTDOWN'
                ? shells[1].emit('close')
                : shells[1].emit('message', `DONE|${command.split('|').at(-1)}`),
            );
          });
          await expect(worker.call('call_api', [])).resolves.toBe('recovered');
          expect(replacementSend).toHaveBeenCalledOnce();
        }
      } finally {
        preparation.resolve('/fixture/temporary');
        replacementSend?.mockRestore();
        await worker.shutdown();
        validation.resolve({ stdout: 'Python 3.12.0', stderr: '' });
        await result;
        await setImmediate();
      }
    },
  );

  it.each(['directory', 'write'] as const)(
    'does not dispatch timed-out %s preparation over a later request',
    async (stage) => {
      const preparation = createDeferred<string>();
      const nextStarted = createDeferred<string>();
      const create = vi
        .spyOn(secureTempFiles, 'createSecureTempDirectory')
        .mockResolvedValue('/fixture/current');
      const write = vi
        .spyOn(secureTempFiles, 'writeSecureTempFile')
        .mockImplementation(async (directory, name) => `${directory}/${name}`);
      if (stage === 'directory') {
        create.mockReturnValueOnce(preparation.promise);
      } else {
        create.mockResolvedValueOnce('/fixture/stale');
        write.mockReturnValueOnce(preparation.promise);
      }
      const remove = vi.spyOn(secureTempFiles, 'removeSecureTempDirectory').mockResolvedValue();
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({ type: 'result', data: 'recovered' }),
      );
      const worker = new PythonWorker('fixture.py', 'call_api', 'fixture-python', 25);
      await worker.initialize('fixture-python');
      const send = vi.spyOn(shells[0], 'send').mockImplementation((command) => {
        if (command === 'SHUTDOWN') {
          queueMicrotask(() => shells[0].emit('close'));
        } else {
          nextStarted.resolve(command);
        }
      });
      vi.useFakeTimers();
      const timedOut = worker.call('call_api', ['stale']).catch((error) => error);
      try {
        await vi.advanceTimersByTimeAsync(25);
        expect(await timedOut).toEqual(new Error('Python worker timed out after 25ms'));
        expect(send).not.toHaveBeenCalled();
        expect(worker.isBusy()).toBe(false);
        const next = worker.call('call_api', ['current']).catch((error) => error);
        const command = await nextStarted.promise;
        preparation.resolve(
          stage === 'directory' ? '/fixture/stale' : '/fixture/stale/request.json',
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(send).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledExactlyOnceWith('/fixture/stale');
        shells[0].emit('message', `DONE|${command.split('|').at(-1)}`);
        await expect(next).resolves.toBe('recovered');
        expect(worker.isBusy()).toBe(false);
      } finally {
        preparation.resolve('/fixture/stale');
        await worker.shutdown();
        await timedOut;
      }
    },
  );

  it('does not restart after shutdown while executable validation is pending', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 1, 'fixture-python');
    pools.push(pool);
    await pool.initialize();
    let finishProbe!: (result: { stdout: string; stderr: string }) => void;
    execFileAsync.mockImplementationOnce(() => new Promise((resolve) => (finishProbe = resolve)));
    shells[0].emit('close');
    expect(execFileAsync).toHaveBeenCalledTimes(2);

    await pool.shutdown();
    finishProbe({ stdout: 'Python 3.12.0', stderr: '' });
    await setImmediate();

    expect(shells).toHaveLength(1);
    expect(pool.getWorkerCount()).toBe(0);
  });

  it('rejects queued and new calls when the pool shuts down', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 1, 'fixture-python');
    pools.push(pool);
    await pool.initialize();
    vi.spyOn(PythonWorker.prototype, 'isBusy').mockReturnValue(true);
    const queued = pool.execute('call_api', []).catch((error) => error);

    await pool.shutdown();

    expect(await queued).toEqual(new Error('Worker pool shutting down'));
    await expect(pool.execute('call_api', [])).rejects.toThrow('Worker pool not initialized');
    expect(pool.getWorkerCount()).toBe(0);
  });

  it('does not start a direct worker when shutdown interrupts its first validation', async () => {
    const onReady = vi.fn();
    const worker = new PythonWorker('fixture.py', 'call_api', 'fixture-python', 1000, onReady);
    let finishProbe!: (result: { stdout: string; stderr: string }) => void;
    execFileAsync.mockImplementationOnce(() => new Promise((resolve) => (finishProbe = resolve)));
    const initializing = worker.initialize();
    const rejected = expect(initializing).rejects.toThrow('Worker shutting down');
    await worker.shutdown();
    finishProbe({ stdout: 'Python 3.12.0', stderr: '' });
    await rejected;
    expect(shells).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('does not start a pool when shutdown interrupts its first validation', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 2, 'fixture-python');
    pools.push(pool);
    let finishProbe!: (result: { stdout: string; stderr: string }) => void;
    execFileAsync.mockImplementationOnce(() => new Promise((resolve) => (finishProbe = resolve)));
    const initializing = pool.initialize();
    const rejected = expect(initializing).rejects.toThrow('Worker pool shutting down');
    await pool.shutdown();
    finishProbe({ stdout: 'Python 3.12.0', stderr: '' });
    await rejected;
    expect(shells).toHaveLength(0);
    expect(pool.getWorkerCount()).toBe(0);
  });

  it('settles startup when shutdown closes a worker before its ready signal', async () => {
    signals.autoReady = false;
    const onReady = vi.fn();
    const worker = new PythonWorker('fixture.py', 'call_api', 'fixture-python', 1000, onReady);
    const initializing = worker.initialize('fixture-python');
    const rejected = expect(initializing).rejects.toThrow('Worker shutting down');
    await worker.shutdown();
    await rejected;
    expect(worker.isReady()).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
  });
});
