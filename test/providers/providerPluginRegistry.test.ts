import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { evaluateWithSource } from '../../src/evaluate';
import {
  MissingProviderPackageError,
  PROVIDER_PLUGIN_API_VERSION,
  ProviderPluginLoadError,
  ProviderPluginRegistry,
  registerProviderPlugin,
} from '../../src/provider-plugin';
import { builtinProviderPlugins } from '../../src/providers/builtinProviderPlugins';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { isRedteamProviderPath } from '../../src/providers/registryTypes';

import type { ProviderFactory, ProviderPluginManifest } from '../../src/provider-plugin';

function createFactory(name: string, test: (providerPath: string) => boolean): ProviderFactory {
  return {
    test,
    create: async (providerPath, providerOptions, context) => ({
      id: () => providerOptions.id ?? `${name}:${providerPath}`,
      callApi: async () => ({
        output: { basePath: context.basePath, name, providerPath },
      }),
    }),
  };
}

function createManifest(
  name: string,
  canHandle: (providerPath: string) => boolean,
  load: ProviderPluginManifest['load'],
  packageName?: string,
): ProviderPluginManifest {
  return {
    apiVersion: PROVIDER_PLUGIN_API_VERSION,
    name,
    packageName,
    canHandle,
    load,
  };
}

describe('ProviderPluginRegistry', () => {
  it('keeps non-matching lookups on the fallback fast path without loading plugins', async () => {
    const load = vi.fn(async () => [createFactory('fake', () => true)]);
    const registry = new ProviderPluginRegistry([
      createManifest(
        '@promptfoo/provider-fake',
        (providerPath) => providerPath.startsWith('fake:'),
        load,
      ),
    ]);
    const fallback = [createFactory('fallback', () => true)];

    await expect(registry.getFactories('echo', fallback)).resolves.toBe(fallback);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads a fake external-style plugin once and passes options and context to its factory', async () => {
    const factory = createFactory('fake', (providerPath) => providerPath.startsWith('fake:'));
    const load = vi.fn(async () => [factory]);
    const registry = new ProviderPluginRegistry([
      createManifest(
        '@promptfoo/provider-fake',
        (providerPath) => providerPath.startsWith('fake:'),
        load,
      ),
    ]);
    const fallback = [createFactory('fallback', () => true)];

    const [first, second, third] = await Promise.all([
      registry.getFactories('fake:model', fallback),
      registry.getFactories('fake:model', fallback),
      registry.getFactories('fake:model', fallback),
    ]);

    expect(load).toHaveBeenCalledOnce();
    expect(first[0]).toBe(factory);
    expect(second[0]).toBe(factory);
    expect(third[0]).toBe(factory);

    const provider = await factory.create(
      'fake:model',
      { id: 'custom-id' },
      { basePath: '/tmp/fake-consumer' },
    );
    expect(provider.id()).toBe('custom-id');
    await expect(provider.callApi('ignored')).resolves.toEqual({
      output: {
        basePath: '/tmp/fake-consumer',
        name: 'fake',
        providerPath: 'fake:model',
      },
    });
  });

  it('registers an external-style family and loads it through the compatibility API', async () => {
    const load = vi.fn(async () => [
      createFactory('external', (providerPath) => providerPath.startsWith('external-test:')),
    ]);
    const dispose = registerProviderPlugin(
      createManifest(
        '@example/promptfoo-provider',
        (providerPath) => providerPath.startsWith('external-test:'),
        load,
      ),
    );

    try {
      const provider = await loadApiProvider('external-test:model', {
        basePath: '/tmp/external-consumer',
        options: { id: 'external-provider-id' },
      });

      expect(provider.id()).toBe('external-provider-id');
      await expect(provider.callApi('ignored')).resolves.toEqual({
        output: {
          basePath: '/tmp/external-consumer',
          name: 'external',
          providerPath: 'external-test:model',
        },
      });
      expect(load).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });

  it('leaves cleanup-capable external providers with their owning caller', async () => {
    const cleanup = vi.fn();
    const dispose = registerProviderPlugin(
      createManifest(
        'cleanup',
        (providerPath) => providerPath === 'cleanup:model',
        async () => [
          {
            test: () => true,
            create: async () => ({
              id: () => 'cleanup:model',
              callApi: async () => ({ output: 'ok' }),
              cleanup,
            }),
          },
        ],
      ),
    );

    try {
      const first = await loadApiProvider('cleanup:model');
      const second = await loadApiProvider('cleanup:model');
      await providerRegistry.shutdownAll();
      expect(cleanup).not.toHaveBeenCalled();
      await first.cleanup?.();
      expect(cleanup).toHaveBeenCalledOnce();
      await expect(second.callApi('still running')).resolves.toEqual({ output: 'ok' });
      await second.cleanup?.();
      expect(cleanup).toHaveBeenCalledTimes(2);
    } finally {
      dispose();
    }
  });

  it('cleans up plugin providers created by programmatic evaluation', async () => {
    const cleanup = vi.fn();
    const dispose = registerProviderPlugin(
      createManifest(
        'evaluation-cleanup',
        (providerPath) => providerPath === 'evaluation-cleanup:model',
        async () => [
          {
            test: () => true,
            create: async () => ({
              id: () => 'evaluation-cleanup:model',
              callApi: async () => ({ output: 'ok' }),
              cleanup,
            }),
          },
        ],
      ),
    );

    try {
      await evaluateWithSource({
        prompts: ['hello'],
        providers: ['evaluation-cleanup:model'],
        tests: [{ vars: {}, assert: [{ type: 'equals', value: 'ok' }] }],
      });
      expect(cleanup).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });

  it('cleans up nested plugin providers created by programmatic evaluation', async () => {
    const cleanup = vi.fn();
    const dispose = registerProviderPlugin(
      createManifest(
        'nested-cleanup',
        (providerPath) => providerPath === 'nested-cleanup:model',
        async () => [
          {
            test: () => true,
            create: async () => ({
              id: () => 'nested-cleanup:model',
              callApi: async () => ({ output: '{"pass":true,"score":1,"reason":"ok"}' }),
              cleanup,
            }),
          },
        ],
      ),
    );

    try {
      await evaluateWithSource({
        prompts: ['hello'],
        providers: [{ id: 'echo' }],
        tests: [
          {
            vars: {},
            options: { provider: { text: 'nested-cleanup:model' } },
            assert: [{ type: 'llm-rubric', value: 'returns hello' }],
          },
        ],
      });
      expect(cleanup).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });

  it('leaves caller-supplied nested grading providers with their caller', async () => {
    const cleanup = vi.fn();
    const grader = {
      id: () => 'caller-grader',
      callApi: async () => ({ output: '{"pass":true,"score":1,"reason":"ok"}' }),
      cleanup,
    };

    await evaluateWithSource({
      prompts: ['hello'],
      providers: [{ id: 'echo' }],
      tests: [
        {
          vars: {},
          options: { provider: { text: grader } },
          assert: [{ type: 'llm-rubric', value: 'returns hello' }],
        },
      ],
    });

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('cleans created providers when a later provider load fails', async () => {
    const cleanup = vi.fn();
    const dispose = registerProviderPlugin(
      createManifest(
        'partial-cleanup',
        (providerPath) => providerPath.startsWith('partial-cleanup:'),
        async () => [
          {
            test: () => true,
            create: async (providerPath) => {
              if (providerPath.endsWith(':fail')) {
                throw new Error('load failed');
              }
              return {
                id: () => providerPath,
                callApi: async () => ({ output: 'ok' }),
                cleanup,
              };
            },
          },
        ],
      ),
    );

    try {
      await expect(
        loadApiProviders(['partial-cleanup:ok', 'partial-cleanup:fail']),
      ).rejects.toThrow('load failed');
      expect(cleanup).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });

  it('cleans created providers when another entry in the same file fails', async () => {
    const cleanup = vi.fn();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-file-cleanup-'));
    const config = path.join(root, 'providers.json');
    fs.writeFileSync(
      config,
      JSON.stringify([{ id: 'partial-file:ok' }, { id: 'partial-file:fail' }]),
    );
    const dispose = registerProviderPlugin(
      createManifest(
        'partial-file',
        (id) => id.startsWith('partial-file:'),
        async () => [
          {
            test: () => true,
            create: async (id) => {
              if (id.endsWith(':fail')) {
                throw new Error('file load failed');
              }
              return { id: () => id, callApi: async () => ({ output: 'ok' }), cleanup };
            },
          },
        ],
      ),
    );

    try {
      await expect(loadApiProviders(`file://${config}`)).rejects.toThrow('file load failed');
      expect(cleanup).toHaveBeenCalledOnce();
    } finally {
      dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('settles file validation and synchronous cleanup failures', async () => {
    const secondCleanup = vi.fn();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-file-sync-cleanup-'));
    const config = path.join(root, 'providers.json');
    fs.writeFileSync(
      config,
      JSON.stringify([{ id: 'sync-cleanup:first' }, {}, { id: 'sync-cleanup:second' }]),
    );
    const dispose = registerProviderPlugin(
      createManifest(
        'sync-cleanup',
        (id) => id.startsWith('sync-cleanup:'),
        async () => [
          {
            test: () => true,
            create: async (id) => ({
              id: () => id,
              callApi: async () => ({ output: 'ok' }),
              cleanup:
                id === 'sync-cleanup:first'
                  ? () => {
                      throw new Error('cleanup failed');
                    }
                  : secondCleanup,
            }),
          },
        ],
      ),
    );

    try {
      await expect(loadApiProviders(`file://${config}`)).rejects.toThrow('must have an id');
      expect(secondCleanup).toHaveBeenCalledOnce();
    } finally {
      dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('continues evaluation-owned cleanup after one hook fails', async () => {
    const secondCleanup = vi.fn();
    const dispose = registerProviderPlugin(
      createManifest(
        'cleanup-order',
        (providerPath) => providerPath.startsWith('cleanup-order:'),
        async () => [
          {
            test: () => true,
            create: async (providerPath) => ({
              id: () => providerPath,
              callApi: async () => ({ output: 'ok' }),
              cleanup:
                providerPath === 'cleanup-order:first'
                  ? async () => {
                      throw new Error('cleanup failed');
                    }
                  : secondCleanup,
            }),
          },
        ],
      ),
    );

    try {
      await expect(
        evaluateWithSource({
          prompts: ['hello'],
          providers: ['cleanup-order:first', 'cleanup-order:second'],
          tests: [{ vars: {}, assert: [{ type: 'equals', value: 'ok' }] }],
        }),
      ).rejects.toThrow('cleanup failed');
      expect(secondCleanup).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });

  it('preserves an evaluation failure when cleanup also fails', async () => {
    const dispose = registerProviderPlugin(
      createManifest(
        'primary-error',
        (id) => id === 'primary-error:model',
        async () => [
          {
            test: () => true,
            create: async () => ({
              id: () => 'primary-error:model',
              callApi: async () => ({ output: 'ok' }),
              cleanup: async () => {
                throw new Error('cleanup failed');
              },
            }),
          },
        ],
      ),
    );

    try {
      const error = await evaluateWithSource({
        prompts: ['file:///definitely/missing-prompt.txt'],
        providers: ['primary-error:model'],
        tests: [{ vars: {}, assert: [{ type: 'equals', value: 'ok' }] }],
      }).catch((error) => error);
      expect(error.message).not.toBe('cleanup failed');
    } finally {
      dispose();
    }
  });

  it('evaluates a winning plugin predicate once while loading', async () => {
    const test = vi.fn(() => true);
    const dispose = registerProviderPlugin(
      createManifest(
        'stateful',
        (providerPath) => providerPath === 'stateful:model',
        async () => [createFactory('stateful', test)],
      ),
    );

    try {
      await loadApiProvider('stateful:model');
      expect(test).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });

  it('uses deterministic registration order and loads only the first matching plugin', async () => {
    const firstFactory = createFactory('first', () => true);
    const firstLoad = vi.fn(async () => [firstFactory]);
    const secondLoad = vi.fn(async () => [createFactory('second', () => true)]);
    const registry = new ProviderPluginRegistry([
      createManifest('first', () => true, firstLoad),
      createManifest('second', () => true, secondLoad),
    ]);

    const factories = await registry.getFactories('shared:model', []);

    expect(factories[0]).toBe(firstFactory);
    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).not.toHaveBeenCalled();
  });

  it('supports host-owned registrations ahead of external plugins', async () => {
    const registry = new ProviderPluginRegistry([
      createManifest(
        'external',
        () => true,
        async () => [createFactory('external', () => true)],
      ),
    ]);
    registry.register(
      createManifest(
        'host',
        () => true,
        async () => [createFactory('host', () => true)],
      ),
      { position: 'first' },
    );

    const [factory] = await registry.getFactories('shared:model', []);
    const provider = await factory.create('shared:model', {}, {});

    expect(provider.id()).toBe('host:shared:model');
  });

  it('lets host composition replace an existing built-in registration', async () => {
    const registry = new ProviderPluginRegistry([
      createManifest(
        'built-in',
        () => true,
        async () => [createFactory('first', () => true)],
      ),
    ]);
    registry.register(
      createManifest(
        'built-in',
        () => true,
        async () => [createFactory('replacement', () => true)],
      ),
      { position: 'first', replaceExisting: true },
    );

    const [factory] = await registry.getFactories('shared:model', []);
    const provider = await factory.create('shared:model', {}, {});

    expect(provider.id()).toBe('replacement:shared:model');
    expect(registry.manifests.map((manifest) => manifest.name)).toEqual(['built-in']);
  });

  it('places a matching plugin ahead of a broad fallback factory', async () => {
    const pluginFactory = createFactory('plugin', (providerPath) =>
      providerPath.startsWith('fake:'),
    );
    const fallbackFactory = createFactory('file', (providerPath) => providerPath.endsWith('.ts'));
    const registry = new ProviderPluginRegistry([
      createManifest(
        'fake',
        (providerPath) => providerPath.startsWith('fake:'),
        async () => [pluginFactory],
      ),
    ]);

    const factories = await registry.getFactories('fake:model.ts', [fallbackFactory]);

    expect(factories.find((factory) => factory.test('fake:model.ts'))).toBe(pluginFactory);
  });

  it('returns an idempotent disposer that exposes the next matching plugin', async () => {
    const registry = new ProviderPluginRegistry();
    const disposeFirst = registry.register(
      createManifest(
        'first',
        () => true,
        async () => [createFactory('first', () => true)],
      ),
    );
    registry.register(
      createManifest(
        'second',
        () => true,
        async () => [createFactory('second', () => true)],
      ),
    );

    const [first] = await registry.getFactories('shared:model', []);
    const firstProvider = await first.create('shared:model', {}, {});
    expect(firstProvider.id()).toBe('first:shared:model');
    expect(registry.manifests.map((manifest) => manifest.name)).toEqual(['first', 'second']);

    disposeFirst();
    disposeFirst();

    expect(registry.manifests.map((manifest) => manifest.name)).toEqual(['second']);
    const [remaining] = await registry.getFactories('shared:model', []);
    const provider = await remaining.create('shared:model', {}, {});
    expect(provider.id()).toBe('second:shared:model');
  });

  it('composes AWS, Google, and redteam through v1 built-in manifests', () => {
    expect(
      builtinProviderPlugins.map(({ apiVersion, name, packageName }) => ({
        apiVersion,
        name,
        packageName,
      })),
    ).toEqual([
      {
        apiVersion: PROVIDER_PLUGIN_API_VERSION,
        name: '@promptfoo/provider-aws',
        packageName: '@promptfoo/provider-aws',
      },
      {
        apiVersion: PROVIDER_PLUGIN_API_VERSION,
        name: '@promptfoo/provider-google',
        packageName: '@promptfoo/provider-google',
      },
      {
        apiVersion: PROVIDER_PLUGIN_API_VERSION,
        name: '@promptfoo/provider-redteam',
        packageName: '@promptfoo/provider-redteam',
      },
    ]);

    expect(
      builtinProviderPlugins.map((plugin) => plugin.canHandle('bedrock:completion:model')),
    ).toEqual([true, false, false]);
    expect(builtinProviderPlugins.map((plugin) => plugin.canHandle('google:model'))).toEqual([
      false,
      true,
      false,
    ]);
    expect(
      builtinProviderPlugins.map((plugin) => plugin.canHandle('promptfoo:redteam:crescendo')),
    ).toEqual([false, false, true]);
    expect(isRedteamProviderPath('promptfoo:redteam:does-not-exist')).toBe(false);
  });

  it('rejects duplicate names and unsupported manifest versions', () => {
    const manifest = createManifest(
      'fake',
      () => true,
      async () => [],
    );
    const registry = new ProviderPluginRegistry([manifest]);

    expect(() => registry.register(manifest)).toThrow(
      "Provider plugin 'fake' is already registered",
    );
    expect(() =>
      registry.register({
        ...manifest,
        name: 'future',
        apiVersion: 2,
      } as unknown as ProviderPluginManifest),
    ).toThrow("Unsupported provider plugin API version for 'future': 2");
    expect(() =>
      registry.register({
        ...manifest,
        name: 'invalid',
        load: undefined,
      } as unknown as ProviderPluginManifest),
    ).toThrow("Provider plugin 'invalid' must define canHandle() and load()");
    expect(() =>
      registry.register({
        ...manifest,
        name: '',
      } as unknown as ProviderPluginManifest),
    ).toThrow('Provider plugin name must be a non-empty string');
  });

  it('wraps canHandle failures with plugin and provider context', async () => {
    const cause = new Error('broken matcher');
    const registry = new ProviderPluginRegistry([
      createManifest(
        'broken',
        () => {
          throw cause;
        },
        async () => [],
      ),
    ]);

    await expect(registry.getFactories('broken:model', [])).rejects.toMatchObject({
      cause,
      code: 'PROMPTFOO_PROVIDER_PLUGIN_LOAD_ERROR',
      pluginName: 'broken',
      providerPath: 'broken:model',
    });
  });

  it('rejects invalid loaded factory arrays with plugin context', async () => {
    const registry = new ProviderPluginRegistry([
      createManifest(
        'broken',
        () => true,
        async () => [{} as ProviderFactory],
      ),
    ]);

    await expect(registry.getFactories('broken:model', [])).rejects.toMatchObject({
      code: 'PROMPTFOO_PROVIDER_PLUGIN_LOAD_ERROR',
      pluginName: 'broken',
      providerPath: 'broken:model',
    });
  });

  it('rejects sparse loaded factory arrays with plugin context', async () => {
    const registry = new ProviderPluginRegistry([
      createManifest(
        'broken',
        () => true,
        async () => new Array<ProviderFactory>(1),
      ),
    ]);

    await expect(registry.getFactories('broken:model', [])).rejects.toMatchObject({
      code: 'PROMPTFOO_PROVIDER_PLUGIN_LOAD_ERROR',
      pluginName: 'broken',
      providerPath: 'broken:model',
    });
  });

  it('rejects a claiming manifest whose factories do not match the provider path', async () => {
    const registry = new ProviderPluginRegistry([
      createManifest(
        'broken',
        () => true,
        async () => [createFactory('broken', () => false)],
      ),
    ]);

    await expect(registry.getFactories('broken:model', [])).rejects.toMatchObject({
      code: 'PROMPTFOO_PROVIDER_PLUGIN_LOAD_ERROR',
      pluginName: 'broken',
      providerPath: 'broken:model',
    });
  });

  it('throws a typed actionable error when the matching plugin package is missing', async () => {
    const cause = Object.assign(
      new Error(
        "Cannot find package '@promptfoo/provider-fake' imported from /tmp/external-loader.js",
      ),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    const registry = new ProviderPluginRegistry([
      createManifest(
        '@promptfoo/provider-fake',
        (providerPath) => providerPath.startsWith('fake:'),
        async () => {
          throw cause;
        },
        '@promptfoo/provider-fake',
      ),
    ]);

    let caught: unknown;
    try {
      await registry.getFactories('fake:model', []);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingProviderPackageError);
    expect(caught).toMatchObject({
      code: 'PROMPTFOO_MISSING_PROVIDER_PACKAGE',
      packageName: '@promptfoo/provider-fake',
      pluginName: '@promptfoo/provider-fake',
      providerPath: 'fake:model',
      cause,
    });
    expect((caught as Error).message).toContain('npm install @promptfoo/provider-fake');
  });

  it('does not misclassify a missing transitive dependency as a missing plugin package', async () => {
    const cause = Object.assign(
      new Error(
        "Cannot find package 'missing-transitive' imported from /node_modules/@promptfoo/provider-fake/index.js",
      ),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    const registry = new ProviderPluginRegistry([
      createManifest(
        '@promptfoo/provider-fake',
        () => true,
        async () => {
          throw cause;
        },
        '@promptfoo/provider-fake',
      ),
    ]);

    let caught: unknown;
    try {
      await registry.getFactories('fake:model', []);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderPluginLoadError);
    expect(caught).not.toBeInstanceOf(MissingProviderPackageError);
    expect(caught).toMatchObject({
      code: 'PROMPTFOO_PROVIDER_PLUGIN_LOAD_ERROR',
      cause,
      pluginName: '@promptfoo/provider-fake',
      providerPath: 'fake:model',
    });
  });

  it('retries a plugin load after a failure', async () => {
    const factory = createFactory('fake', () => true);
    const load = vi
      .fn<ProviderPluginManifest['load']>()
      .mockRejectedValueOnce(new Error('temporary load failure'))
      .mockResolvedValueOnce([factory]);
    const registry = new ProviderPluginRegistry([createManifest('fake', () => true, load)]);

    await expect(registry.getFactories('fake:model', [])).rejects.toBeInstanceOf(
      ProviderPluginLoadError,
    );
    await expect(registry.getFactories('fake:model', [])).resolves.toEqual([factory]);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
