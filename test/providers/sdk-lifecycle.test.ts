import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { AwsBedrockAgentsProvider } from '../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../src/providers/bedrock/knowledgeBase';
import { NovaSonicProvider } from '../../src/providers/bedrock/nova-sonic';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { createEnvironmentScopedState } from '../../src/providers/scopedState';
import { createDeferred, mockProcessEnv } from '../util/utils';

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
  it('does not take over SIGTERM for standalone SDK-only consumers', () => {
    const source = pathToFileURL(path.resolve('src/providers/bedrock/index.ts')).href;
    const script = `import { AwsBedrockCompletionProvider } from ${JSON.stringify(source)}; await new AwsBedrockCompletionProvider('fixture').getBedrockInstance(); process.kill(process.pid, 'SIGTERM');`;
    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      { encoding: 'utf8', timeout: 15000 },
    );
    expect(child.error).toBeUndefined();
    expect(child.signal).toBe('SIGTERM');
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
      await cliState.withEnv({}, async () => {
        const outer = await getClient();
        await cliState.withEnv({}, async () => {
          const previous = await getClient();
          const previousDestroy = vi.spyOn(previous, 'destroy');
          const namespace = Reflect.get(provider, 'responseCacheNamespace');
          const injected = { destroy: vi.fn() };
          Reflect.set(provider, field, injected);
          expect(await getClient()).toBe(injected);
          Reflect.set(provider, field, value);
          expect(Reflect.get(provider, field)).toBeUndefined();
          const next = await getClient();
          const nextDestroy = vi.spyOn(next, 'destroy');
          expect(next).not.toBe(previous);
          expect(Reflect.get(provider, 'responseCacheNamespace')).toBe(namespace);
          expect(previousDestroy).not.toHaveBeenCalled();
          await providerRegistry.shutdownAll(cliState.envScope);
          expect(previousDestroy).toHaveBeenCalledOnce();
          expect(nextDestroy).toHaveBeenCalledOnce();
          expect(injected.destroy).not.toHaveBeenCalled();
        });
        expect(await getClient()).toBe(outer);
        await providerRegistry.shutdownAll(cliState.envScope);
      });
    },
  );

  it.each(resetCases)(
    'keeps a $name initialization cleared with $value from publishing over its replacement',
    async ({ create, method, field, value }) => {
      const provider = create();
      const credentials = createDeferred<{ accessKeyId: string; secretAccessKey: string }>();
      vi.spyOn(provider, 'getCredentials').mockReturnValueOnce(credentials.promise);
      const getClient = () => Reflect.get(provider, method).call(provider);
      await cliState.withEnv({}, async () => {
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
          await providerRegistry.shutdownAll(cliState.envScope);
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
    await cliState.withEnv({}, async () => {
      const previous = state();
      const previousOwner = register.mock.calls.at(-1)![0];
      state.reset();
      const next = state();
      await previousOwner.shutdown();
      expect(cleanup).toHaveBeenCalledWith(previous);
      expect(state()).toBe(next);
      providerRegistry.unregister(previousOwner);
      await providerRegistry.shutdownAll(cliState.envScope);
      expect(cleanup).toHaveBeenCalledTimes(2);
      expect(cleanup).toHaveBeenLastCalledWith(next);
    });
  });

  it('does not let a rejected retired initialization clear its replacement', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const credentials = createDeferred<{ accessKeyId: string; secretAccessKey: string }>();
    vi.spyOn(provider, 'getCredentials').mockReturnValueOnce(credentials.promise);
    await cliState.withEnv({}, async () => {
      const pending = provider.getBedrockInstance();
      provider.bedrock = undefined;
      const next = await provider.getBedrockInstance();
      credentials.reject(new Error('retired initialization'));
      await expect(pending).rejects.toThrow('retired initialization');
      expect(await provider.getBedrockInstance()).toBe(next);
      const destroy = vi.spyOn(next, 'destroy');
      await providerRegistry.shutdownAll(cliState.envScope);
      expect(destroy).toHaveBeenCalledOnce();
    });
  });

  it('closes nested environment clients with their evaluation lifetime', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const destroy = vi.spyOn(BedrockRuntime.prototype, 'destroy');
    await cliState.withEnvFileOverrides({}, () =>
      providerRegistry.withScope(async () => {
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
    const first = providerRegistry.withScope(async () => {
      // Python workers register lazily during initialization, without passing a scope.
      providerRegistry.register(python);
      ready.resolve();
      await release.promise;
      expect(shutdown).not.toHaveBeenCalled();
    });
    await ready.promise;
    try {
      await providerRegistry.withScope(async () => {
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
    const first = providerRegistry.withScope(() =>
      cliState.withEnv({}, async () => {
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
          providerRegistry.withScope(() =>
            cliState.withEnv({}, async () => {
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
    'isolates lifetimes sharing the same environment (scoped=%s)',
    async (scoped) => {
      const provider = new AwsBedrockCompletionProvider('fixture');
      const check = async () => {
        await providerRegistry.withScope(async () => {
          const first = await provider.getBedrockInstance();
          const destroy = vi.spyOn(first, 'destroy');
          await providerRegistry.withScope(async () => {
            const second = await provider.getBedrockInstance();
            expect(second).not.toBe(first);
          });
          expect(destroy).not.toHaveBeenCalled();
          expect(await provider.getBedrockInstance()).toBe(first);
        });
      };
      await (scoped ? cliState.withEnv({}, check) : check());
    },
  );

  it('does not register unused state or close standalone clients during an evaluation', async () => {
    const register = vi.spyOn(providerRegistry, 'register');
    const provider = new AwsBedrockCompletionProvider('fixture');
    expect(register).not.toHaveBeenCalled();
    const client = await provider.getBedrockInstance();
    const destroy = vi.spyOn(client, 'destroy');
    await cliState.withEnv({}, async () => {
      await provider.getBedrockInstance();
      await providerRegistry.shutdownAll(cliState.envScope);
    });
    expect(destroy).not.toHaveBeenCalled();
    await providerRegistry.shutdownAll();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it.each(providers)(
    'releases only the completed %s scope and supports reuse',
    async (_name, create, method) => {
      const provider = create();
      const getClient = () => Reflect.get(provider, method).call(provider);
      const ready = createDeferred<void>();
      const released = createDeferred<void>();
      let firstDestroy: ReturnType<typeof vi.spyOn>;
      const first = cliState.withEnv({}, async () => {
        const client = await getClient();
        firstDestroy = vi.spyOn(client, 'destroy');
        ready.resolve();
        await released.promise;
        expect(firstDestroy).not.toHaveBeenCalled();
        await providerRegistry.shutdownAll(cliState.envScope);
        expect(firstDestroy).toHaveBeenCalledOnce();
        const next = await getClient();
        expect(next).not.toBe(client);
        const nextDestroy = vi.spyOn(next, 'destroy');
        await providerRegistry.shutdownAll(cliState.envScope);
        expect(nextDestroy).toHaveBeenCalledOnce();
      });
      const second = cliState.withEnv({}, async () => {
        await ready.promise;
        const client = await getClient();
        const destroy = vi.spyOn(client, 'destroy');
        try {
          await providerRegistry.shutdownAll(cliState.envScope);
          expect(destroy).toHaveBeenCalledOnce();
          expect(firstDestroy!).not.toHaveBeenCalled();
        } finally {
          released.resolve();
        }
      });
      await Promise.all([first, second]);
    },
  );

  it('waits for pending construction, releases it, and permits a new lifecycle', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const destroy = vi.spyOn(BedrockRuntime.prototype, 'destroy');
    const credentials = createDeferred<{ accessKeyId: string; secretAccessKey: string }>();
    vi.spyOn(provider, 'getCredentials').mockReturnValueOnce(credentials.promise);
    await cliState.withEnv({}, async () => {
      const pending = provider.getBedrockInstance();
      const shutdown = providerRegistry.shutdownAll(cliState.envScope);
      let stopped = false;
      void shutdown.then(() => {
        stopped = true;
      });
      await Promise.resolve();
      expect(stopped).toBe(false);
      const next = await provider.getBedrockInstance();
      credentials.resolve({ accessKeyId: 'fixture', secretAccessKey: 'fixture' });
      const client = await pending;
      await shutdown;
      expect(destroy).toHaveBeenCalledOnce();
      expect(next).not.toBe(client);
      expect(await provider.getBedrockInstance()).toBe(next);
      await providerRegistry.shutdownAll(cliState.envScope);
      expect(destroy).toHaveBeenCalledTimes(2);
      expect(stopped).toBe(true);
    });
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
    await cliState.withEnv({}, async () => {
      expect(await bedrock.getBedrockInstance()).toBe(client);
      expect(await sageMaker.getSageMakerRuntimeInstance()).toBe(client);
      expect(await kb.getKnowledgeBaseClient()).toBe(client);
      await providerRegistry.shutdownAll(cliState.envScope);
    });
    expect(client.destroy).not.toHaveBeenCalled();
  });

  it('destroys every SageMaker region client', async () => {
    await cliState.withEnv({}, async () => {
      const provider = new SageMakerCompletionProvider('fixture', {
        config: { modelType: 'custom' },
      });
      const clients = await Promise.all(
        ['us-east-1', 'us-west-2'].map((region) => provider.getSageMakerRuntimeInstance(region)),
      );
      const destroy = clients.map((client) => vi.spyOn(client, 'destroy'));
      await providerRegistry.shutdownAll(cliState.envScope);
      destroy.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    });
  });
});
