import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntime, BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/node/evaluate';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { AwsBedrockAgentsProvider } from '../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../src/providers/bedrock/knowledgeBase';
import { NovaSonicProvider } from '../../src/providers/bedrock/nova-sonic';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { createEnvironmentScopedState } from '../../src/providers/scopedState';
import { createDeferred, mockProcessEnv } from '../util/utils';

vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv({
    AWS_ACCESS_KEY_ID: 'fixture-access',
    AWS_SECRET_ACCESS_KEY: 'fixture-secret',
    AWS_BEARER_TOKEN_BEDROCK: undefined,
    AWS_PROFILE: undefined,
  });
});
afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
  restore();
});

const withLifecycle = <T>(fn: () => Promise<T>) =>
  providerRegistry.withEvaluation(() => cliState.withEnv({}, fn));

const providers = [
  ['bedrock', () => new AwsBedrockCompletionProvider('fixture'), 'getBedrockInstance'],
  [
    'sagemaker',
    () => new SageMakerCompletionProvider('fixture', { config: { modelType: 'custom' } }),
    'getSageMakerRuntimeInstance',
  ],
  ['agent', () => new AwsBedrockAgentsProvider('fixture'), 'getAgentRuntimeClient'],
  [
    'knowledge-base',
    () =>
      new AwsBedrockKnowledgeBaseProvider('fixture', { config: { knowledgeBaseId: 'fixture' } }),
    'getKnowledgeBaseClient',
  ],
  ['sonic', () => new NovaSonicProvider(), 'getBedrockClient'],
] as const;

describe('SDK client lifecycle', () => {
  it.each([
    ['bedrock', providers[0][1], 'getBedrockInstance', BedrockRuntime.prototype],
    ['sagemaker', providers[1][1], 'getSageMakerRuntimeInstance', SageMakerRuntimeClient.prototype],
  ] as const)(
    'rejects new %s client acquisition after its evaluation finishes',
    async (_name, create, method, prototype) => {
      const provider = create();
      const release = createDeferred<void>();
      const destroy = vi.spyOn(prototype, 'destroy');
      let pending!: Promise<unknown>;
      await withLifecycle(async () => {
        pending = release.promise.then(() => Reflect.get(provider, method).call(provider));
      });
      expect(destroy).not.toHaveBeenCalled();
      release.resolve();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(destroy).not.toHaveBeenCalled();
      await withLifecycle(async () => {
        await Reflect.get(provider, method).call(provider);
        expect(destroy).not.toHaveBeenCalled();
      });
      expect(destroy).toHaveBeenCalledOnce();
    },
  );

  it('does not take over SIGTERM for standalone SDK-only consumers', () => {
    const source = pathToFileURL(path.resolve('src/providers/bedrock/index.ts')).href;
    const terminate = `
      writeSync(1, 'SIGNAL_READY\\n');
      process.kill(process.pid, 'SIGTERM');
    `;
    const run = (initialize: string) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          `
          import assert from 'node:assert/strict';
          import { writeSync } from 'node:fs';
          globalThis.fetch = async () => { throw new Error('Unexpected network access'); };
          const signals = ['SIGTERM', 'SIGINT'];
          const counts = () => signals.map(signal => process.listenerCount(signal));
          const before = counts();
          ${initialize}
          assert.deepEqual(counts(), before);
          ${terminate}
        `,
        ],
        { encoding: 'utf8', timeout: 15000 },
      );
    // Windows reports self-termination differently from POSIX. Compare the
    // native outcome and prove initialization succeeded without new listeners.
    const baseline = run('');
    const child = run(`
      const { AwsBedrockCompletionProvider } = await import(${JSON.stringify(source)});
      const beforeExit = process.listenerCount('beforeExit');
      await new AwsBedrockCompletionProvider('fixture').getBedrockInstance();
      assert.equal(process.listenerCount('beforeExit'), beforeExit);
    `);
    for (const result of [baseline, child]) {
      expect(result.error).toBeUndefined();
      expect(result.stdout, result.stderr).toContain('SIGNAL_READY');
      expect(result.status === 0 && result.signal === null).toBe(false);
    }
    expect({ status: child.status, signal: child.signal }).toEqual({
      status: baseline.status,
      signal: baseline.signal,
    });
  });

  const mutableClients = [
    ['bedrock', providers[0][1], 'getBedrockInstance', 'bedrock'],
    ['sagemaker', providers[1][1], 'getSageMakerRuntimeInstance', 'sagemakerRuntime'],
    ['knowledge-base', providers[3][1], 'getKnowledgeBaseClient', 'knowledgeBaseClient'],
  ] as const;

  const resetCases = mutableClients.flatMap(([name, create, method, field]) =>
    [undefined, null, false, 0, ''].map((value) => ({ name, create, method, field, value })),
  );

  it.each(resetCases)(
    'resets only the active $name client and cache for $value, retaining cleanup ownership',
    async ({ create, method, field, value }) => {
      const provider = create();
      const getClient = () => Reflect.get(provider, method).call(provider);
      const destroyed: ReturnType<typeof vi.spyOn>[] = [];
      const injected = { destroy: vi.fn() };
      await withLifecycle(async () => {
        const outer = await getClient();
        destroyed.push(vi.spyOn(outer, 'destroy'));
        await withLifecycle(async () => {
          const previous = await getClient();
          const namespace = Reflect.get(provider, 'responseCacheNamespace');
          destroyed.push(vi.spyOn(previous, 'destroy'));
          Reflect.set(provider, field, injected);
          expect(await getClient()).toBe(injected);
          Reflect.set(provider, field, value);
          expect(Reflect.get(provider, field)).toBeUndefined();
          const next = await getClient();
          destroyed.push(vi.spyOn(next, 'destroy'));
          expect(next).not.toBe(previous);
          expect(Reflect.get(provider, 'responseCacheNamespace')).toBe(namespace);
        });
        expect(await getClient()).toBe(outer);
        destroyed.forEach((destroy) => expect(destroy).not.toHaveBeenCalled());
      });
      destroyed.forEach((destroy) => expect(destroy).toHaveBeenCalledOnce());
      expect(injected.destroy).not.toHaveBeenCalled();
    },
  );

  it.each(resetCases)(
    'keeps a $name initialization cleared with $value from publishing over its replacement',
    async ({ create, method, field, value }) => {
      const provider = create();
      const credentials = createDeferred<{ accessKeyId: string; secretAccessKey: string }>();
      vi.spyOn(provider, 'getCredentials').mockReturnValueOnce(credentials.promise);
      const getClient = () => Reflect.get(provider, method).call(provider);
      await withLifecycle(async () => {
        const pending = getClient();
        const namespace = Reflect.get(provider, 'responseCacheNamespace');
        Reflect.set(provider, field, value);
        try {
          expect(Reflect.get(provider, 'responseCacheNamespace')).toBe(namespace);
          const next = await getClient();
          const nextDestroy = vi.spyOn(next, 'destroy');
          credentials.resolve({ accessKeyId: 'retired', secretAccessKey: 'retired' });
          const retired = await pending;
          const retiredDestroy = vi.spyOn(retired, 'destroy');
          expect(retired).not.toBe(next);
          expect(await getClient()).toBe(next);
          await providerRegistry.shutdownAll();
          expect(retiredDestroy).toHaveBeenCalledOnce();
          expect(nextDestroy).toHaveBeenCalledOnce();
        } finally {
          credentials.resolve({ accessKeyId: 'retired', secretAccessKey: 'retired' });
          await pending;
        }
      });
    },
  );

  it('does not let a retired cleanup owner remove its replacement state', async () => {
    const register = vi.spyOn(providerRegistry, 'register');
    const cleanup = vi.fn();
    const state = createEnvironmentScopedState(() => ({}), cleanup);
    await withLifecycle(async () => {
      const previous = state();
      const previousOwner = register.mock.calls.at(-1)![0];
      state.reset();
      const next = state();
      await previousOwner.shutdown();
      expect(cleanup).toHaveBeenCalledWith(previous);
      expect(state()).toBe(next);
      providerRegistry.unregister(previousOwner);
      await providerRegistry.shutdownAll();
      expect(cleanup).toHaveBeenCalledTimes(2);
      expect(cleanup).toHaveBeenLastCalledWith(next);
    });
  });

  it('does not let a rejected retired initialization clear its replacement', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const credentials = createDeferred<{ accessKeyId: string; secretAccessKey: string }>();
    vi.spyOn(provider, 'getCredentials').mockReturnValueOnce(credentials.promise);
    await withLifecycle(async () => {
      const pending = provider.getBedrockInstance();
      provider.bedrock = undefined;
      const next = await provider.getBedrockInstance();
      credentials.reject(new Error('retired initialization'));
      await expect(pending).rejects.toThrow('retired initialization');
      expect(await provider.getBedrockInstance()).toBe(next);
      const destroy = vi.spyOn(next, 'destroy');
      await providerRegistry.shutdownAll();
      expect(destroy).toHaveBeenCalledOnce();
    });
  });

  it('closes nested environment clients with their evaluation lifetime', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const destroy = vi.spyOn(BedrockRuntime.prototype, 'destroy');
    await cliState.withEnvFileOverrides({}, () =>
      providerRegistry.withEvaluation(async () => {
        await cliState.withEnv({}, async () => {
          await provider.getBedrockInstance();
          await cliState.withEnv({}, () => provider.getBedrockInstance());
        });
        expect(destroy).not.toHaveBeenCalled();
      }),
    );
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it('keeps a Python worker registered without explicit scope alive while another SDK evaluation finishes', async () => {
    const ready = createDeferred<void>();
    const release = createDeferred<void>();
    const python = new PythonProvider('fixture.py', { config: { pythonExecutable: 'python3' } });
    const shutdown = vi.spyOn(python, 'shutdown').mockResolvedValue();
    const first = providerRegistry.withEvaluation(async () => {
      // Python workers register lazily during initialization, without passing a scope.
      providerRegistry.register(python);
      ready.resolve();
      await release.promise;
      expect(shutdown).not.toHaveBeenCalled();
    });
    await ready.promise;
    try {
      await providerRegistry.withEvaluation(async () => {
        await new AwsBedrockCompletionProvider('fixture').getBedrockInstance();
      });
      expect(shutdown).not.toHaveBeenCalled();
    } finally {
      release.resolve();
    }
    await first;
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('keeps concurrent cleanup lifetimes separate through nested environments', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const ready = createDeferred<void>();
    const release = createDeferred<void>();
    let firstDestroy: ReturnType<typeof vi.spyOn>;
    const first = providerRegistry.withEvaluation(() =>
      withLifecycle(async () => {
        const client = await cliState.withEnv({}, () => provider.getBedrockInstance());
        firstDestroy = vi.spyOn(client, 'destroy');
        ready.resolve();
        await release.promise;
        expect(firstDestroy).not.toHaveBeenCalled();
      }),
    );
    const second = (async () => {
      await ready.promise;
      let secondDestroy: ReturnType<typeof vi.spyOn>;
      try {
        await expect(
          providerRegistry.withEvaluation(() =>
            withLifecycle(async () => {
              const client = await provider.getBedrockInstance();
              secondDestroy = vi.spyOn(client, 'destroy');
              throw new Error('fixture evaluation failure');
            }),
          ),
        ).rejects.toThrow('fixture evaluation failure');
        expect(secondDestroy!).toHaveBeenCalledOnce();
        expect(firstDestroy!).not.toHaveBeenCalled();
      } finally {
        release.resolve();
      }
    })();
    await Promise.all([first, second]);
    expect(firstDestroy!).toHaveBeenCalledOnce();
  });

  it.each([true, false])(
    'shares nested evaluation clients and isolates later evaluations (scoped=%s)',
    async (scoped) => {
      const provider = new AwsBedrockCompletionProvider('fixture');
      const check = async () => {
        let first: BedrockRuntime;
        await providerRegistry.withEvaluation(async () => {
          first = await provider.getBedrockInstance();
          const destroy = vi.spyOn(first, 'destroy');
          await providerRegistry.withEvaluation(async () => {
            expect(await provider.getBedrockInstance()).toBe(first);
          });
          expect(destroy).not.toHaveBeenCalled();
        });
        expect(first!.destroy).toHaveBeenCalledOnce();
        await providerRegistry.withEvaluation(async () => {
          expect(await provider.getBedrockInstance()).not.toBe(first);
        });
      };
      await (scoped ? cliState.withEnv({}, check) : check());
    },
  );

  it.each(providers)(
    'keeps standalone %s clients collectible and caller-owned',
    async (_name, create, method) => {
      const register = vi.spyOn(providerRegistry, 'register');
      const provider = create();
      const getClient = () => Reflect.get(provider, method).call(provider);
      const client = await getClient();
      const destroy = vi.spyOn(client, 'destroy');
      expect(register).not.toHaveBeenCalled();
      await cliState.withEnv({}, async () => {
        const scoped = await getClient();
        expect(register).not.toHaveBeenCalled();
        scoped.destroy();
      });
      await providerRegistry.withEvaluation(async () => {
        const evaluated = await getClient();
        expect(evaluated).not.toBe(client);
      });
      expect(destroy).not.toHaveBeenCalled();
      expect(await getClient()).toBe(client);
      await providerRegistry.shutdownAll();
      expect(destroy).not.toHaveBeenCalled();
      client.destroy();
      expect(destroy).toHaveBeenCalledOnce();
    },
  );

  it.each(providers)(
    'releases only the completed %s evaluation and supports reuse',
    async (_name, create, method) => {
      const provider = create();
      const getClient = () => Reflect.get(provider, method).call(provider);
      const ready = createDeferred<void>();
      const release = createDeferred<void>();
      let firstDestroy: ReturnType<typeof vi.spyOn>;
      let firstClient: unknown;
      const first = withLifecycle(async () => {
        firstClient = await getClient();
        firstDestroy = vi.spyOn(firstClient as { destroy(): void }, 'destroy');
        ready.resolve();
        await release.promise;
        expect(firstDestroy).not.toHaveBeenCalled();
      });
      await ready.promise;
      try {
        let secondDestroy: ReturnType<typeof vi.spyOn>;
        await withLifecycle(async () => {
          const client = await getClient();
          expect(client).not.toBe(firstClient);
          secondDestroy = vi.spyOn(client, 'destroy');
        });
        expect(secondDestroy!).toHaveBeenCalledOnce();
        expect(firstDestroy!).not.toHaveBeenCalled();
      } finally {
        release.resolve();
        await first;
      }
      expect(firstDestroy!).toHaveBeenCalledOnce();
      await withLifecycle(async () => expect(await getClient()).not.toBe(firstClient));
    },
  );

  it('retains an SDK client until its physical provider call settles after evaluation closure', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const ready = createDeferred<void>();
    const release = createDeferred<void>();
    let pending: Promise<void>;
    let destroy: ReturnType<typeof vi.spyOn>;
    await withLifecycle(async () => {
      pending = providerRegistry.withProvider(provider, async () => {
        const client = await provider.getBedrockInstance();
        destroy = vi.spyOn(client, 'destroy');
        ready.resolve();
        await release.promise;
        expect(destroy).not.toHaveBeenCalled();
      });
      await ready.promise;
    });
    expect(destroy!).not.toHaveBeenCalled();
    release.resolve();
    await pending!;
    await vi.waitFor(() => expect(destroy!).toHaveBeenCalledOnce());
  });

  it.each(['getter', 'client'] as const)(
    'retains a client prepared by a beforeAll %s hook until its timed-out call settles',
    async (setup) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-sdk-setup-'));
      const extension = path.join(directory, 'extension.mjs');
      fs.writeFileSync(
        extension,
        `export async function beforeAll({ suite }) {
        ${setup === 'getter' ? 'void suite.providers[0].bedrock;' : 'await suite.providers[0].getBedrockInstance();'}
      }`,
      );
      const provider = new AwsBedrockCompletionProvider('fixture');
      const release = createDeferred<void>();
      const finished = createDeferred<void>();
      const ready = createDeferred<void>();
      let destroy: ReturnType<typeof vi.spyOn> | undefined;
      const call = vi.spyOn(provider, 'callApi').mockImplementation(async () => {
        try {
          const client = await provider.getBedrockInstance();
          destroy = vi.spyOn(client, 'destroy');
          ready.resolve();
          await release.promise;
          return { output: 'finished' };
        } finally {
          finished.resolve();
        }
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const evaluation = evaluate(
          {
            providers: [provider],
            prompts: ['fixture'],
            tests: [{ vars: {} }],
            extensions: [`file://${extension}:beforeAll`],
            writeLatestResults: false,
          },
          { cache: false, showProgressBar: false, timeoutMs: 50 },
        );
        await Promise.race([
          ready.promise,
          evaluation.then(() => {
            throw new Error('Provider call did not become ready');
          }),
        ]);
        await vi.advanceTimersByTimeAsync(50);
        const summary = await (await evaluation).toEvaluateSummary();
        expect(summary.results[0].error).toContain('Evaluation timed out after 50ms');
        expect(call).toHaveBeenCalledOnce();
        expect(destroy).toBeDefined();
        expect(destroy).not.toHaveBeenCalled();
      } finally {
        release.resolve();
        vi.useRealTimers();
        if (call.mock.calls.length) {
          await finished.promise;
          await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());
        }
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  const pendingClients = [
    [...providers[0], 'getBedrockAuthOptions', BedrockRuntime.prototype],
    [...providers[1], 'getCredentials', SageMakerRuntimeClient.prototype],
    [...providers[2], 'getIamCredentialOptions', BedrockAgentRuntimeClient.prototype],
    [...providers[3], 'getIamCredentialOptions', BedrockAgentRuntimeClient.prototype],
    [...providers[4], 'getScopedEndpointOptions', BedrockRuntimeClient.prototype],
  ] as const;

  it.each(
    pendingClients.flatMap((entry) => [
      { entry, rejects: false },
      { entry, rejects: true },
    ]),
  )(
    'finishes cleanup with pending $entry.0 construction (rejects=$rejects)',
    async ({ entry: [_name, create, method, boundary, prototype], rejects }) => {
      const provider = create();
      const began = createDeferred<void>();
      const release = createDeferred<void>();
      const target = provider as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const original = target[boundary];
      vi.spyOn(target, boundary).mockImplementationOnce(async (...args) => {
        began.resolve();
        await release.promise;
        if (rejects) {
          throw new Error('fixture initialization failed');
        }
        return original.apply(provider, args);
      });
      const destroy = vi.spyOn(prototype, 'destroy');
      let pending!: Promise<unknown>;
      let outcome!: Promise<unknown>;
      const scope = withLifecycle(async () => {
        pending = Reflect.get(provider, method).call(provider);
        outcome = pending.catch((error) => error);
        await began.promise;
      });
      let stopped = false;
      void scope.then(() => {
        stopped = true;
      });
      await began.promise;
      // Allow cleanup's microtasks to finish while construction stays pending.
      await new Promise<void>((resolve) => setImmediate(resolve));
      try {
        expect(stopped).toBe(true);
        expect(destroy).not.toHaveBeenCalled();
      } finally {
        release.resolve();
        await outcome;
        await scope;
      }
      if (rejects) {
        expect(await outcome).toEqual(new Error('fixture initialization failed'));
        expect(destroy).not.toHaveBeenCalled();
      } else {
        expect(destroy).toHaveBeenCalledOnce();
      }
      const retired = await outcome;
      await withLifecycle(async () => {
        expect(await Reflect.get(provider, method).call(provider)).not.toBe(retired);
      });
      expect(destroy).toHaveBeenCalledTimes(rejects ? 1 : 2);
    },
  );

  it('releases ready SageMaker regions while another region is still initializing', async () => {
    const provider = new SageMakerCompletionProvider('fixture', {
      config: { modelType: 'custom' },
    });
    const began = createDeferred<void>();
    const release = createDeferred<void>();
    const original = provider.getCredentials.bind(provider);
    let pending!: Promise<SageMakerRuntimeClient>;
    let readyDestroy!: ReturnType<typeof vi.spyOn>;
    const scope = withLifecycle(async () => {
      const ready = await provider.getSageMakerRuntimeInstance('us-east-1');
      readyDestroy = vi.spyOn(ready, 'destroy');
      vi.spyOn(provider, 'getCredentials').mockImplementationOnce(async () => {
        began.resolve();
        await release.promise;
        return original();
      });
      pending = provider.getSageMakerRuntimeInstance('us-west-2');
      await began.promise;
    });
    try {
      await scope;
      expect(readyDestroy).toHaveBeenCalledOnce();
    } finally {
      release.resolve();
      await pending;
    }
    expect(readyDestroy).toHaveBeenCalledOnce();
  });

  it('permits a new client after manual shutdown while its predecessor still initializes', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const credentials = createDeferred<{ accessKeyId: string; secretAccessKey: string }>();
    vi.spyOn(provider, 'getCredentials').mockReturnValueOnce(credentials.promise);
    const destroy = vi.spyOn(BedrockRuntime.prototype, 'destroy');
    await withLifecycle(async () => {
      const pending = provider.getBedrockInstance();
      const shutdown = providerRegistry.shutdownAll();
      let stopped = false;
      void shutdown.then(() => {
        stopped = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      try {
        expect(stopped).toBe(true);
        const next = await provider.getBedrockInstance();
        credentials.resolve({ accessKeyId: 'fixture', secretAccessKey: 'fixture' });
        const retired = await pending;
        expect(next).not.toBe(retired);
        expect(destroy).toHaveBeenCalledOnce();
        expect(await provider.getBedrockInstance()).toBe(next);
      } finally {
        credentials.resolve({ accessKeyId: 'fixture', secretAccessKey: 'fixture' });
        await pending;
        await shutdown;
      }
    });
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it('contains destruction failures after abandoned construction succeeds', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const credentials = createDeferred<{ accessKeyId: string; secretAccessKey: string }>();
    vi.spyOn(provider, 'getCredentials').mockReturnValueOnce(credentials.promise);
    const failure = new Error('fixture destroy failure');
    vi.spyOn(BedrockRuntime.prototype, 'destroy').mockImplementationOnce(() => {
      throw failure;
    });
    const warn = vi.spyOn((await import('../../src/logger')).default, 'warn');
    let pending!: ReturnType<typeof provider.getBedrockInstance>;
    await withLifecycle(async () => {
      pending = provider.getBedrockInstance();
    });
    credentials.resolve({ accessKeyId: 'fixture', secretAccessKey: 'fixture' });
    await pending;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(warn).toHaveBeenCalledWith('Error destroying late SDK client', { error: failure });
  });

  it('preserves caller-owned injected clients', async () => {
    const bedrock = new AwsBedrockCompletionProvider('fixture');
    const sageMaker = new SageMakerCompletionProvider('fixture', {
      config: { modelType: 'custom' },
    });
    const kb = new AwsBedrockKnowledgeBaseProvider('fixture', {
      config: { knowledgeBaseId: 'fixture' },
    });
    const client = { destroy: vi.fn() };
    bedrock.bedrock = client as never;
    sageMaker.sagemakerRuntime = client;
    kb.knowledgeBaseClient = client as never;
    await withLifecycle(async () => {
      expect(await bedrock.getBedrockInstance()).toBe(client);
      expect(await sageMaker.getSageMakerRuntimeInstance()).toBe(client);
      expect(await kb.getKnowledgeBaseClient()).toBe(client);
      await providerRegistry.shutdownAll();
    });
    expect(client.destroy).not.toHaveBeenCalled();
  });

  it('destroys every SageMaker region client', async () => {
    await withLifecycle(async () => {
      const provider = new SageMakerCompletionProvider('fixture', {
        config: { modelType: 'custom' },
      });
      const clients = await Promise.all(
        ['us-east-1', 'us-west-2'].map((region) => provider.getSageMakerRuntimeInstance(region)),
      );
      const destroy = clients.map((client) => vi.spyOn(client, 'destroy'));
      await providerRegistry.shutdownAll();
      destroy.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    });
  });
});
