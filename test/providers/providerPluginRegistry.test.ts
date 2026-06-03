import { describe, expect, it, vi } from 'vitest';
import {
  MissingProviderPackageError,
  PROVIDER_PLUGIN_API_VERSION,
  ProviderPluginLoadError,
  ProviderPluginRegistry,
  registerProviderPlugin,
} from '../../src/provider-plugin';
import {
  builtinProviderPlugins,
  isRedteamProviderPath,
} from '../../src/providers/builtinProviderPlugins';
import { loadApiProvider } from '../../src/providers/index';

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
