import type { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { PythonWorkerPool } from '../../src/python/workerPool';
import type { Options } from 'python-shell';

const { execFileAsync, shells } = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
  shells: [] as Array<EventEmitter & { options: Options }>,
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
        queueMicrotask(() => this.emit('message', 'READY'));
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
  });

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.shutdown()));
    vi.restoreAllMocks();
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

  it('revalidates the executable when a worker restarts after a crash', async () => {
    const pool = new PythonWorkerPool('fixture.py', 'call_api', 2, 'fixture-python');
    pools.push(pool);
    await pool.initialize();
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    shells[0].emit('close');
    await vi.waitFor(() => expect(shells).toHaveLength(3));
    expect(execFileAsync).toHaveBeenCalledTimes(2);
  });
});
