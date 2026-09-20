import { spawn } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred } from '../util/utils';

describe('provider lifecycle registry', () => {
  afterEach(async () => {
    await providerRegistry.shutdownAll();
    vi.restoreAllMocks();
  });

  it('preserves providers first registered while an earlier shutdown is pending', async () => {
    const pending = createDeferred<void>();
    const current = { shutdown: vi.fn(() => pending.promise) };
    const next = { shutdown: vi.fn(async () => {}) };
    providerRegistry.register(current);

    const firstShutdown = providerRegistry.shutdownAll();
    providerRegistry.register(next);
    expect(current.shutdown).toHaveBeenCalledOnce();
    expect(next.shutdown).not.toHaveBeenCalled();
    pending.resolve();
    await firstShutdown;

    await providerRegistry.shutdownAll();
    await providerRegistry.shutdownAll();
    expect(current.shutdown).toHaveBeenCalledOnce();
    expect(next.shutdown).toHaveBeenCalledOnce();
  });

  it('preserves a provider that registers itself again while shutting down', async () => {
    const pending = createDeferred<void>();
    const provider = { shutdown: vi.fn<() => Promise<void>>() };
    provider.shutdown
      .mockImplementationOnce(async () => {
        providerRegistry.register(provider);
        await pending.promise;
      })
      .mockResolvedValue(undefined);
    providerRegistry.register(provider);

    const firstShutdown = providerRegistry.shutdownAll();
    expect(provider.shutdown).toHaveBeenCalledOnce();
    pending.resolve();
    await firstShutdown;

    await providerRegistry.shutdownAll();
    await providerRegistry.shutdownAll();
    expect(provider.shutdown).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a pending shutdown or run an explicitly unregistered provider', async () => {
    const pending = createDeferred<void>();
    const current = { shutdown: vi.fn(() => pending.promise) };
    const removed = { shutdown: vi.fn(async () => {}) };
    providerRegistry.register(current);
    providerRegistry.register(removed);
    providerRegistry.unregister(removed);

    const firstShutdown = providerRegistry.shutdownAll();
    await providerRegistry.shutdownAll();
    pending.resolve();
    await firstShutdown;

    expect(current.shutdown).toHaveBeenCalledOnce();
    expect(removed.shutdown).not.toHaveBeenCalled();
  });

  it('keeps an asynchronous evaluation owner alive while unrelated scopes still close legacy providers', async () => {
    const registered = createDeferred<void>();
    const continueEvaluation = createDeferred<void>();
    const scoped = { shutdown: vi.fn(async () => {}) };
    const legacy = { shutdown: vi.fn(async () => {}) };
    const owner = providerRegistry.withEvaluationScope(async () => {
      await Promise.resolve();
      providerRegistry.registerScoped(scoped);
      registered.resolve();
      await continueEvaluation.promise;
      providerRegistry.registerScoped(scoped);
    });
    await registered.promise;

    try {
      await providerRegistry.withEvaluationScope(async () => {
        providerRegistry.register(legacy);
      });
      expect(legacy.shutdown).toHaveBeenCalledOnce();
      expect(scoped.shutdown).not.toHaveBeenCalled();
    } finally {
      continueEvaluation.resolve();
      await owner;
    }

    expect(scoped.shutdown).toHaveBeenCalledOnce();
    expect(legacy.shutdown).toHaveBeenCalledOnce();
  });

  it('releases a shared provider only when the last concurrent evaluation completes', async () => {
    const registeredFirst = createDeferred<void>();
    const registeredSecond = createDeferred<void>();
    const continueFirst = createDeferred<void>();
    const continueSecond = createDeferred<void>();
    const shared = { shutdown: vi.fn(async () => {}) };
    const first = providerRegistry.withEvaluationScope(async () => {
      providerRegistry.registerScoped(shared);
      registeredFirst.resolve();
      await continueFirst.promise;
    });
    const second = providerRegistry.withEvaluationScope(async () => {
      providerRegistry.registerScoped(shared);
      registeredSecond.resolve();
      await continueSecond.promise;
    });
    await Promise.all([registeredFirst.promise, registeredSecond.promise]);

    try {
      continueFirst.resolve();
      await first;
      expect(shared.shutdown).not.toHaveBeenCalled();
      continueSecond.resolve();
      await second;
      expect(shared.shutdown).toHaveBeenCalledOnce();
    } finally {
      continueFirst.resolve();
      continueSecond.resolve();
      await Promise.all([first, second]);
    }
  });

  it('still lets an explicit global shutdown close a provider owned by an active evaluation', async () => {
    const provider = { shutdown: vi.fn(async () => {}) };

    await providerRegistry.withEvaluationScope(async () => {
      providerRegistry.registerScoped(provider);
      await providerRegistry.shutdownAll();
      expect(provider.shutdown).toHaveBeenCalledOnce();
      providerRegistry.registerScoped(provider);
    });

    expect(provider.shutdown).toHaveBeenCalledTimes(2);
  });

  it('keeps direct opted-in providers for manual cleanup even after scoped reuse', async () => {
    const direct = { shutdown: vi.fn(async () => {}) };
    const scoped = { shutdown: vi.fn(async () => {}) };
    const legacy = { shutdown: vi.fn(async () => {}) };
    providerRegistry.registerScoped(direct);

    await providerRegistry.withEvaluationScope(async () => {
      providerRegistry.registerScoped(direct);
      providerRegistry.registerScoped(scoped);
      providerRegistry.register(legacy);
    });

    expect(direct.shutdown).not.toHaveBeenCalled();
    expect(scoped.shutdown).toHaveBeenCalledExactlyOnceWith('evaluation');
    expect(legacy.shutdown).toHaveBeenCalledExactlyOnceWith('evaluation');
    await providerRegistry.shutdownAll();
    expect(direct.shutdown).toHaveBeenCalledExactlyOnceWith('manual');
  });

  it('passes forced process cleanup to both direct and scoped providers', async () => {
    const direct = { shutdown: vi.fn(async () => {}) };
    const scoped = { shutdown: vi.fn(async () => {}) };
    providerRegistry.registerScoped(direct);

    await providerRegistry.withEvaluationScope(async () => {
      providerRegistry.registerScoped(scoped);
      await providerRegistry.shutdownForProcess();
      expect(direct.shutdown).toHaveBeenCalledExactlyOnceWith('process');
      expect(scoped.shutdown).toHaveBeenCalledExactlyOnceWith('process');
    });

    expect(direct.shutdown).toHaveBeenCalledOnce();
    expect(scoped.shutdown).toHaveBeenCalledOnce();
    expect(providerRegistry.isProcessTerminating()).toBe(false);
  });

  it('refuses a fresh OpenCode provider after a native process signal begins termination', async () => {
    const script = `
      import { providerRegistry } from './src/providers/providerRegistry.ts';
      import { OpenCodeSDKProvider } from './src/providers/opencode-sdk.ts';

      providerRegistry.registerScoped({
        shutdown: async (reason) => console.log('shutdown:' + reason),
      });
      const keepAlive = setInterval(() => {}, 1_000);
      process.on('message', (message) => {
        if (message === 'terminate') process.emit('SIGTERM');
      });
      process.on('SIGTERM', () => {
        setImmediate(async () => {
          try {
            console.log('terminating:' + providerRegistry.isProcessTerminating());
            const fresh = new OpenCodeSDKProvider({
              config: { working_dir: '/definitely-not-a-real-opencode-signal-test-directory' },
            });
            const result = await fresh.callApi('must not begin work');
            console.log('fresh:' + result.error);
          } catch (error) {
            console.log('fresh-threw:' + String(error));
          } finally {
            clearInterval(keepAlive);
            process.disconnect?.();
          }
        });
      });
      console.log('ready');
    `;
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const ready = new Promise<void>((resolve, reject) => {
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
        if (stdout.includes('ready')) {
          resolve();
        }
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (!stdout.includes('ready')) {
          reject(new Error(`Signal child exited before startup (${code}): ${stderr}`));
        }
      });
    });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    void exited.catch(() => undefined);

    try {
      await ready;
      // Windows cannot deliver a catchable POSIX signal; the isolated child invokes the same
      // native event callback there. Unix sends SIGTERM to the actual child process.
      if (process.platform === 'win32') {
        child.send('terminate');
      } else {
        child.kill('SIGTERM');
      }
      expect(await exited, stderr).toBe(0);
      expect(stdout).toContain('shutdown:process');
      expect(stdout).toContain('terminating:true');
      expect(stdout).toContain('fresh:OpenCode SDK call aborted before it started');
      expect(stdout).not.toContain('fresh-threw:');
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });

  it('drops direct ownership when an instance explicitly unregisters before scoped reuse', async () => {
    const provider = { shutdown: vi.fn(async () => {}) };
    providerRegistry.registerScoped(provider);
    providerRegistry.unregister(provider);

    await providerRegistry.withEvaluationScope(async () => {
      providerRegistry.registerScoped(provider);
    });

    expect(provider.shutdown).toHaveBeenCalledExactlyOnceWith('evaluation');
  });

  it('releases scoped ownership when the evaluation exits early with an exception', async () => {
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const provider = {
      shutdown: vi.fn(() => {
        throw new Error('secondary synchronous cleanup error');
      }),
    };

    await expect(
      providerRegistry.withEvaluationScope(async () => {
        providerRegistry.registerScoped(provider);
        throw new Error('original evaluation error');
      }),
    ).rejects.toThrow('original evaluation error');

    expect(provider.shutdown).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      'Error shutting down provider: Error: secondary synchronous cleanup error',
    );
  });

  it('logs a failed provider without preventing another provider from shutting down', async () => {
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const failed = { shutdown: vi.fn().mockRejectedValue(new Error('expected shutdown failure')) };
    const other = { shutdown: vi.fn(async () => {}) };
    providerRegistry.register(failed);
    providerRegistry.register(other);

    await expect(providerRegistry.shutdownAll()).resolves.toBeUndefined();
    await providerRegistry.shutdownAll();

    expect(failed.shutdown).toHaveBeenCalledOnce();
    expect(other.shutdown).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      'Error shutting down provider: Error: expected shutdown failure',
    );
  });
});
