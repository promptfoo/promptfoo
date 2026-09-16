import fs from 'fs';
import path from 'path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PythonWorker } from '../../src/python/worker';
import { PythonWorkerPool } from '../../src/python/workerPool';
import type { PythonShell } from 'python-shell';

// Windows CI has severe filesystem delays (antivirus, etc.) - allow up to 90s
// Non-Windows CI can also have timing variance with Python IPC, so use 15s (matching windows-path.test.ts)
const TEST_TIMEOUT = process.platform === 'win32' ? 90000 : 15000;

// Skip on Windows CI due to aggressive file security policies blocking temp file IPC
// Works fine on local Windows and all other platforms
const describeOrSkip = process.platform === 'win32' && process.env.CI ? describe.skip : describe;

describeOrSkip('PythonWorkerPool', () => {
  let singleWorkerPool: PythonWorkerPool;
  let multiWorkerPool: PythonWorkerPool;
  let multiApiPool: PythonWorkerPool;
  const testScriptPath = path.join(__dirname, 'fixtures', 'counter_provider.py');
  const multiApiPath = path.join(__dirname, 'fixtures', 'pool_multi_api.py');
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeAll(async () => {
    // Create fixtures directory if it doesn't exist
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Create test fixture with global state
    fs.writeFileSync(
      testScriptPath,
      `
# Global counter - persists across calls within same worker
call_count = 0

def call_api(prompt, options, context):
    global call_count
    call_count += 1
    return {"output": f"Call #{call_count}: {prompt}", "count": call_count}

def reset_call_count():
    global call_count
    call_count = 0
    return {"count": call_count}
`,
    );

    fs.writeFileSync(
      multiApiPath,
      `
def call_api(prompt, options, context):
    return {"output": f"text: {prompt}", "type": "text"}

def call_embedding_api(prompt, options, context):
    return {"output": [0.1, 0.2], "type": "embedding"}
`,
    );

    singleWorkerPool = new PythonWorkerPool(testScriptPath, 'call_api', 1);
    multiWorkerPool = new PythonWorkerPool(testScriptPath, 'call_api', 2);
    multiApiPool = new PythonWorkerPool(multiApiPath, 'call_api', 2);

    await Promise.all([
      singleWorkerPool.initialize(),
      multiWorkerPool.initialize(),
      multiApiPool.initialize(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      singleWorkerPool.execute('reset_call_count', []),
      ...Array.from({ length: multiWorkerPool.getWorkerCount() }, () =>
        multiWorkerPool.execute('reset_call_count', []),
      ),
    ]);
  });

  afterAll(async () => {
    await Promise.all(
      [singleWorkerPool, multiWorkerPool, multiApiPool]
        .filter((pool): pool is PythonWorkerPool => Boolean(pool))
        .map((pool) => pool.shutdown()),
    );

    for (const fixturePath of [testScriptPath, multiApiPath]) {
      if (fs.existsSync(fixturePath)) {
        fs.unlinkSync(fixturePath);
      }
    }
  });

  it(
    'should initialize pool with specified worker count',
    async () => {
      expect(multiWorkerPool.getWorkerCount()).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it('should reject invalid worker counts', async () => {
    // Test zero workers
    const zeroWorkerPool = new PythonWorkerPool(testScriptPath, 'call_api', 0);
    await expect(zeroWorkerPool.initialize()).rejects.toThrow(
      'Invalid worker count: 0. Must be at least 1.',
    );

    // Test negative workers
    const negativeWorkerPool = new PythonWorkerPool(testScriptPath, 'call_api', -1);
    await expect(negativeWorkerPool.initialize()).rejects.toThrow(
      'Invalid worker count: -1. Must be at least 1.',
    );
  });

  it(
    'should execute calls sequentially with 1 worker',
    async () => {
      const result1 = await singleWorkerPool.execute('call_api', ['First', {}, {}]);
      const result2 = await singleWorkerPool.execute('call_api', ['Second', {}, {}]);
      const result3 = await singleWorkerPool.execute('call_api', ['Third', {}, {}]);

      // Same worker, counter increments
      expect(result1.count).toBe(1);
      expect(result2.count).toBe(2);
      expect(result3.count).toBe(3);
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle concurrent calls with multiple workers',
    async () => {
      // Execute 4 calls concurrently
      const promises = [
        multiWorkerPool.execute('call_api', ['Call 1', {}, {}]),
        multiWorkerPool.execute('call_api', ['Call 2', {}, {}]),
        multiWorkerPool.execute('call_api', ['Call 3', {}, {}]),
        multiWorkerPool.execute('call_api', ['Call 4', {}, {}]),
      ];

      const results = await Promise.all(promises);

      // Each worker maintains its own counter
      // With 2 workers, work should be distributed across both (not all to one worker)
      const counts = results.map((r) => r.count);
      const uniqueCounts = new Set(counts);

      // Verify multiple workers were used (at least 2 different counts)
      expect(uniqueCounts.size).toBeGreaterThan(1);

      // Verify all calls completed successfully
      expect(results.length).toBe(4);
    },
    TEST_TIMEOUT,
  );

  it(
    'should queue requests when all workers busy',
    async () => {
      // Start 3 concurrent calls with 1 worker - should queue
      const promises = [
        singleWorkerPool.execute('call_api', ['Q1', {}, {}]),
        singleWorkerPool.execute('call_api', ['Q2', {}, {}]),
        singleWorkerPool.execute('call_api', ['Q3', {}, {}]),
      ];

      const results = await Promise.all(promises);

      // All should complete (queued and executed)
      expect(results.length).toBe(3);
      expect(results[0].count).toBe(1);
      expect(results[1].count).toBe(2);
      expect(results[2].count).toBe(3);
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle different function names across pool',
    async () => {
      const results = await Promise.all([
        multiApiPool.execute('call_api', ['hello', {}, {}]),
        multiApiPool.execute('call_embedding_api', ['world', {}, {}]),
        multiApiPool.execute('call_api', ['again', {}, {}]),
      ]);

      expect(results[0].type).toBe('text');
      expect(results[1].type).toBe('embedding');
      expect(results[2].type).toBe('text');
    },
    TEST_TIMEOUT,
  );

  it(
    'should process queued requests after worker becomes available',
    async () => {
      // Fire off 5 requests - should queue and process sequentially
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(singleWorkerPool.execute('call_api', [`request-${i}`, {}, {}]));
      }

      const results = await Promise.all(promises);

      // All requests should complete
      expect(results.length).toBe(5);

      // Counter should increment sequentially (all in same worker)
      const counts = results.map((r) => r.count);
      expect(counts).toEqual([1, 2, 3, 4, 5]);
    },
    TEST_TIMEOUT,
  );
});

describeOrSkip('PythonWorkerPool crash recovery', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const crashScriptPath = path.join(fixturesDir, 'pool_crash_on_marker_provider.py');
  const brokenOnRestartPath = path.join(fixturesDir, 'pool_break_on_restart_provider.py');
  const slowScriptPath = path.join(fixturesDir, 'pool_slow_provider.py');
  const exitAfterReplyPath = path.join(fixturesDir, 'pool_exit_after_reply_provider.py');
  const exitHelperPidPath = `${exitAfterReplyPath}.helper.pid`;

  beforeAll(() => {
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    fs.writeFileSync(
      crashScriptPath,
      `
import os

def call_api(prompt, options, context):
    if "CRASH" in prompt:
        os._exit(1)
    return {"output": f"ok: {prompt}"}
`,
    );

    fs.writeFileSync(
      slowScriptPath,
      `
import time

def call_api(prompt, options, context):
    if prompt == "slow":
        time.sleep(10)
    return {"output": prompt}
`,
    );

    // Replies, then exits shortly afterwards while a helper still holds the worker's output
    // streams, so the worker only learns about the exit once they have drained.
    fs.writeFileSync(
      exitAfterReplyPath,
      `
import os
import subprocess
import sys
import threading

def call_api(prompt, options, context):
    if prompt == "exit soon":
        helper = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        with open(${JSON.stringify(exitHelperPidPath)}, "w") as pid_file:
            pid_file.write(str(helper.pid))
        threading.Timer(0.2, lambda: os._exit(3)).start()
    return {"output": prompt}
`,
    );
  });

  afterAll(() => {
    for (const fixturePath of [
      crashScriptPath,
      brokenOnRestartPath,
      slowScriptPath,
      exitAfterReplyPath,
    ]) {
      fs.rmSync(fixturePath, { force: true });
    }
  });

  it(
    'should reject queued and new requests once every worker has crashed instead of hanging',
    async () => {
      const pool = new PythonWorkerPool(crashScriptPath, 'call_api', 1);
      await pool.initialize();

      try {
        const results = await Promise.allSettled([
          pool.execute('call_api', ['CRASH 1', {}, {}]),
          pool.execute('call_api', ['CRASH 2', {}, {}]),
          pool.execute('call_api', ['CRASH 3', {}, {}]),
          // Queued behind three consecutive crashes; previously this never settled.
          pool.execute('call_api', ['queued after crashes', {}, {}]),
        ]);

        expect(results.map((result) => result.status)).toEqual([
          'rejected',
          'rejected',
          'rejected',
          'rejected',
        ]);
        const reasons = results.map((result) =>
          result.status === 'rejected' ? (result.reason as Error).message : '',
        );
        expect(reasons.slice(0, 3)).toEqual([
          'Worker crashed (exit code 1)',
          'Worker crashed (exit code 1)',
          'Worker crashed (exit code 1)',
        ]);
        expect(reasons[3]).toContain('crashed and could not be restarted');

        await expect(pool.execute('call_api', ['new request', {}, {}])).rejects.toThrow(
          'crashed and could not be restarted',
        );
      } finally {
        await pool.shutdown();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should reject queued requests when a crashed worker cannot restart',
    async () => {
      // Crashes and leaves the module unimportable, so every automatic restart fails.
      fs.writeFileSync(
        brokenOnRestartPath,
        `
import os

def call_api(prompt, options, context):
    with open(__file__, "w") as module_file:
        module_file.write('raise RuntimeError("module broken after crash")\\n')
    os._exit(1)
`,
      );
      const pool = new PythonWorkerPool(brokenOnRestartPath, 'call_api', 1);

      try {
        await pool.initialize();

        const [crashed, queued] = await Promise.allSettled([
          pool.execute('call_api', ['crash', {}, {}]),
          // Previously a failed restart was only logged, so this never settled. Failed
          // restarts now count toward the crash limit, so the worker gives up after three.
          pool.execute('call_api', ['queued behind failed restart', {}, {}]),
        ]);

        expect(crashed).toMatchObject({
          status: 'rejected',
          reason: expect.objectContaining({ message: 'Worker crashed (exit code 1)' }),
        });
        expect(queued).toMatchObject({
          status: 'rejected',
          reason: expect.objectContaining({
            message: expect.stringContaining('crashed and could not be restarted'),
          }),
        });
      } finally {
        await pool.shutdown();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should keep serving when crashes are separated by successful calls',
    async () => {
      const pool = new PythonWorkerPool(crashScriptPath, 'call_api', 1);
      await pool.initialize();

      try {
        // More total crashes than maxCrashes, but never consecutive.
        for (let attempt = 1; attempt <= 4; attempt++) {
          await expect(pool.execute('call_api', [`CRASH ${attempt}`, {}, {}])).rejects.toThrow(
            'Worker crashed',
          );
          await expect(pool.execute('call_api', [`healthy ${attempt}`, {}, {}])).resolves.toEqual({
            output: `ok: healthy ${attempt}`,
          });
        }
      } finally {
        await pool.shutdown();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should queue a request that arrives after the worker process exited',
    async () => {
      const isProcessAlive = (pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      const pool = new PythonWorkerPool(exitAfterReplyPath, 'call_api', 1);
      await pool.initialize();
      const worker = (pool as unknown as { workers: Array<{ process: PythonShell | null }> })
        .workers[0];
      const workerPid = worker.process?.childProcess.pid;
      expect(workerPid).toBeDefined();

      try {
        await expect(pool.execute('call_api', ['exit soon', {}, {}])).resolves.toEqual({
          output: 'exit soon',
        });
        await vi.waitFor(() => expect(isProcessAlive(workerPid!)).toBe(false), {
          timeout: 3_000,
        });

        // Previously this was sent to the exited process while its streams drained, and
        // failed with "Worker crashed" instead of waiting for the restart.
        await expect(pool.execute('call_api', ['after exit', {}, {}])).resolves.toEqual({
          output: 'after exit',
        });
      } finally {
        await pool.shutdown();
        if (fs.existsSync(exitHelperPidPath)) {
          try {
            process.kill(Number(fs.readFileSync(exitHelperPidPath, 'utf8')), 'SIGKILL');
          } catch {
            // Already exited
          }
          fs.rmSync(exitHelperPidPath, { force: true });
        }
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should serve a request queued behind a timed-out call from the restarted process',
    async () => {
      const pool = new PythonWorkerPool(slowScriptPath, 'call_api', 1, undefined, 1000);
      await pool.initialize();

      try {
        const [timedOut, queued] = await Promise.allSettled([
          pool.execute('call_api', ['slow', {}, {}]),
          // Previously this was sent to the process still running the slow call and timed out.
          pool.execute('call_api', ['fast', {}, {}]),
        ]);

        expect(timedOut).toMatchObject({
          status: 'rejected',
          reason: expect.objectContaining({ message: 'Python worker timed out after 1000ms' }),
        });
        expect(queued).toEqual({ status: 'fulfilled', value: { output: 'fast' } });
      } finally {
        await pool.shutdown();
      }
    },
    TEST_TIMEOUT,
  );
});

describe('PythonWorkerPool worker failures', () => {
  type FakeWorkerState = { ready: boolean; busy: boolean; dead: boolean };
  type TestablePool = {
    isInitialized: boolean;
    processQueue(): void;
    queue: unknown[];
    workers: unknown[];
  };

  const createFakeWorker = (state: FakeWorkerState) => ({
    isReady: () => state.ready,
    isBusy: () => state.busy,
    isDead: () => state.dead,
    call: vi.fn().mockResolvedValue({ output: 'served' }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  });

  const createPoolWithWorkers = (...workers: ReturnType<typeof createFakeWorker>[]) => {
    const pool = new PythonWorkerPool('/scripts/provider.py', 'call_api', workers.length);
    const testable = pool as unknown as TestablePool;
    testable.workers = workers;
    testable.isInitialized = true;
    return { pool, testable };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should keep a request queued while another worker can still recover', async () => {
    const recoveringState = { ready: false, busy: false, dead: false };
    const deadWorker = createFakeWorker({ ready: false, busy: false, dead: true });
    const recoveringWorker = createFakeWorker(recoveringState);
    const { pool, testable } = createPoolWithWorkers(deadWorker, recoveringWorker);

    const queued = pool.execute('call_api', ['hello', {}, {}]);
    expect(testable.queue).toHaveLength(1);

    recoveringState.ready = true;
    testable.processQueue();

    await expect(queued).resolves.toEqual({ output: 'served' });
    expect(recoveringWorker.call).toHaveBeenCalledWith('call_api', ['hello', {}, {}]);
    expect(deadWorker.call).not.toHaveBeenCalled();
  });

  it('should reject queued and new requests once the last worker dies', async () => {
    const lastState = { ready: false, busy: false, dead: false };
    const { pool, testable } = createPoolWithWorkers(
      createFakeWorker({ ready: false, busy: false, dead: true }),
      createFakeWorker(lastState),
    );

    const queued = pool.execute('call_api', ['hello', {}, {}]);
    expect(testable.queue).toHaveLength(1);

    lastState.dead = true;
    testable.processQueue();

    await expect(queued).rejects.toThrow(
      'All 2 Python worker(s) for /scripts/provider.py crashed and could not be restarted',
    );
    expect(testable.queue).toHaveLength(0);
    await expect(pool.execute('call_api', ['later', {}, {}])).rejects.toThrow(
      'crashed and could not be restarted',
    );
  });

  it('should reject new requests as soon as shutdown starts', async () => {
    let finishShutdown: () => void = () => {};
    const worker = createFakeWorker({ ready: true, busy: false, dead: false });
    worker.shutdown.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishShutdown = resolve;
        }),
    );
    const { pool } = createPoolWithWorkers(worker);

    const shutdown = pool.shutdown();
    await expect(pool.execute('call_api', ['during shutdown', {}, {}])).rejects.toThrow(
      'Worker pool not initialized',
    );
    expect(worker.call).not.toHaveBeenCalled();

    finishShutdown();
    await shutdown;
  });

  it('should shut down workers that started when another worker fails to start', async () => {
    const startupError = new Error('Python worker exited before becoming ready (exit code 1)');
    let startedWorkers = 0;
    const initializeSpy = vi
      .spyOn(PythonWorker.prototype, 'initialize')
      .mockImplementation(async () => {
        startedWorkers += 1;
        if (startedWorkers === 2) {
          throw startupError;
        }
      });
    const shutdownSpy = vi.spyOn(PythonWorker.prototype, 'shutdown').mockResolvedValue(undefined);
    const pool = new PythonWorkerPool('/scripts/provider.py', 'call_api', 3);

    await expect(pool.initialize()).rejects.toBe(startupError);

    expect(initializeSpy).toHaveBeenCalledTimes(3);
    expect(shutdownSpy).toHaveBeenCalledTimes(3);
    expect(pool.getWorkerCount()).toBe(0);
    await expect(pool.execute('call_api', ['hello', {}, {}])).rejects.toThrow(
      'Worker pool not initialized',
    );
  });
});
