import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { RubyProvider } from '../../src/providers/rubyCompletion';
import { scriptResolvedConfigCacheKey } from '../../src/util/scriptConfigCacheKey';

const mocks = vi.hoisted(() => ({
  python: vi.fn(),
  ruby: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../../src/cache', () => ({
  getCache: async () => ({ get: mocks.get, set: mocks.set }),
  isCacheEnabled: () => true,
}));

vi.mock('../../src/python/workerPool', () => ({
  PythonWorkerPool: class {
    async initialize() {}
    execute = mocks.python;
    async shutdown() {}
  },
}));

vi.mock('../../src/ruby/rubyUtils', () => ({ runRuby: mocks.ruby }));

describe.each([
  { language: 'Python', Provider: PythonProvider, extension: 'py', execute: mocks.python },
  { language: 'Ruby', Provider: RubyProvider, extension: 'rb', execute: mocks.ruby },
])('$language script result contract', ({ language, Provider, extension, execute }) => {
  let directory: string;
  let scriptPath: string;
  let provider: PythonProvider | RubyProvider;

  beforeEach(async () => {
    vi.resetAllMocks();
    const entries = new Map<string, string>();
    mocks.get.mockImplementation(async (key: string) => entries.get(key));
    mocks.set.mockImplementation(async (key: string, value: string) => entries.set(key, value));
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'script-result-contract-'));
    scriptPath = path.join(directory, `provider.${extension}`);
    await fs.writeFile(scriptPath, '# script execution is replaced at the transport boundary');
    provider = new Provider(scriptPath, { config: { workers: 1 } });
  });

  afterEach(async () => {
    await providerRegistry.shutdownAll();
    await fs.rm(directory, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it.each([undefined, 0])(
    'keeps fresh and persisted numRequests distinct for %s',
    async (numRequests) => {
      execute.mockResolvedValue({ output: 'ok', tokenUsage: { total: 9, numRequests } });

      const fresh = await provider.callApi('hello');
      const cached = await provider.callApi('hello');

      expect(fresh).toEqual({
        output: 'ok',
        cached: false,
        tokenUsage: { total: 9, numRequests: language === 'Python' ? 1 : numRequests },
      });
      expect(JSON.parse(mocks.set.mock.calls[0][1])).toEqual({
        output: 'ok',
        tokenUsage: numRequests === undefined ? { total: 9 } : { total: 9, numRequests },
      });
      expect(cached).toEqual({
        output: 'ok',
        cached: true,
        tokenUsage: { total: 9, cached: 9, numRequests: numRequests ?? 1 },
      });
      expect(execute).toHaveBeenCalledTimes(1);
      const args = execute.mock.calls[0][language === 'Python' ? 1 : 2];
      expect(args).toHaveLength(3);
      expect(args[2]).toBeUndefined();
    },
  );

  it.each([
    { method: 'callApi', error: false },
    { method: 'callEmbeddingApi', error: 0 },
    { method: 'callClassificationApi', error: 'script failed' },
  ] as const)('does not cache an own error from $method', async ({ method, error }) => {
    execute.mockImplementation(async () => ({ error }));
    const expected = method === 'callApi' ? { error, cached: false } : { error };

    expect(await provider[method]('hello')).toEqual(expected);
    expect(await provider[method]('hello')).toEqual(expected);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it.each(['', false, 0, null])('preserves a falsy output %s through the cache', async (output) => {
    execute.mockResolvedValue({ output });

    expect(await provider.callApi('hello')).toEqual({ output, cached: false });
    expect(await provider.callApi('hello')).toEqual({ output, cached: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('misses the cache when referenced file:// settings change and hits when they do not', async () => {
    const settingsDir = path.join(directory, 'config');
    const settingsPath = path.join(settingsDir, 'model_settings.json');
    await fs.mkdir(settingsDir);

    const writeSettings = async (temperature: number, keyOrder: 'forward' | 'reverse') => {
      const headers =
        keyOrder === 'forward'
          ? { 'X-Model': 'gpt-test', 'Content-Type': 'application/json' }
          : { 'Content-Type': 'application/json', 'X-Model': 'gpt-test' };
      const body =
        keyOrder === 'forward'
          ? { temperature, model: 'gpt-test', headers }
          : { headers, model: 'gpt-test', temperature };
      await fs.writeFile(settingsPath, JSON.stringify(body));
    };

    const options = {
      config: {
        basePath: directory,
        settings: 'file://config/model_settings.json',
      },
    };
    const varsFor = (evalId: string) => ({
      name: 'world',
      __evalId: evalId,
      __evalStepId: 'test-0-prompt-0-repeat-0',
      __repeatIndex: 0,
    });
    const cacheKey = () => mocks.get.mock.calls.at(-1)?.[0] as string;
    const scriptArgs = (callIndex: number) =>
      execute.mock.calls[callIndex][language === 'Python' ? 1 : 2] as [
        string,
        { config: { settings: { temperature: number; model: string } } },
        { vars: Record<string, unknown> },
      ];

    execute.mockResolvedValue({ output: 'from-settings-a' });
    await writeSettings(0.2, 'forward');
    const firstProvider = new Provider(scriptPath, options);
    const first = await firstProvider.callApi('Hello', { vars: varsFor('eval-run-1') } as any);

    const firstKey = cacheKey();
    expect(firstKey).toContain('file://config/model_settings.json');
    expect(firstKey).toContain(scriptResolvedConfigCacheKey(firstProvider.config));
    expect(firstKey).not.toContain('__evalId');
    expect(firstKey).not.toContain('eval-run-1');
    expect(firstKey).toContain('"__evalStepId":"test-0-prompt-0-repeat-0"');
    expect(firstKey).toContain('"__repeatIndex":0');
    expect(scriptArgs(0)[1].config.settings).toMatchObject({
      temperature: 0.2,
      model: 'gpt-test',
    });
    expect(scriptArgs(0)[2].vars.__evalId).toBe('eval-run-1');
    expect(first).toEqual({ output: 'from-settings-a', cached: false });

    // Same file contents, different key order, new provider and eval id: still a hit.
    await writeSettings(0.2, 'reverse');
    const secondProvider = new Provider(scriptPath, options);
    const second = await secondProvider.callApi('Hello', { vars: varsFor('eval-run-2') } as any);
    const secondKey = cacheKey();
    expect(secondKey).toBe(firstKey);
    expect(secondKey).not.toContain('eval-run-2');
    expect(second).toEqual({ output: 'from-settings-a', cached: true });
    expect(execute).toHaveBeenCalledTimes(1);

    await writeSettings(0.9, 'forward');
    execute.mockResolvedValue({ output: 'from-settings-b' });
    const thirdProvider = new Provider(scriptPath, options);
    const third = await thirdProvider.callApi('Hello', { vars: varsFor('eval-run-3') } as any);
    const thirdKey = cacheKey();
    expect(thirdKey).not.toBe(firstKey);
    expect(thirdKey).toContain('file://config/model_settings.json');
    expect(thirdKey).toContain(scriptResolvedConfigCacheKey(thirdProvider.config));
    expect(thirdKey).not.toContain('__evalId');
    expect(thirdKey).not.toContain('eval-run-3');
    expect(scriptArgs(1)[1].config.settings.temperature).toBe(0.9);
    expect(third).toEqual({ output: 'from-settings-b', cached: false });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not cache a file-backed config that differs only by a secret', async () => {
    const accountA = 'sk-account-a-secret-value-0123456789abcd';
    const accountB = 'sk-account-b-secret-value-0123456789abcd';
    const settingsDir = path.join(directory, 'credentials');
    const settingsPath = path.join(settingsDir, 'model_settings.json');
    await fs.mkdir(settingsDir);

    const writeSettings = async (apiKey: string) => {
      await fs.writeFile(settingsPath, JSON.stringify({ model: 'gpt-test', apiKey }));
    };
    const options = {
      config: {
        basePath: directory,
        settings: 'file://credentials/model_settings.json',
      },
    };
    const scriptArgs = (callIndex: number) =>
      execute.mock.calls[callIndex][language === 'Python' ? 1 : 2] as [
        string,
        { config: { settings: { apiKey: string; model: string } } },
      ];

    execute.mockResolvedValue({ output: 'account-a' });
    await writeSettings(accountA);
    const firstProvider = new Provider(scriptPath, options);
    const first = await firstProvider.callApi('Hello');

    expect(first).toEqual({ output: 'account-a', cached: false });
    expect(scriptArgs(0)[1].config.settings.apiKey).toBe(accountA);
    expect(scriptResolvedConfigCacheKey(firstProvider.config)).not.toContain(accountA);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();

    execute.mockResolvedValue({ output: 'account-b' });
    await writeSettings(accountB);
    const secondProvider = new Provider(scriptPath, options);
    const second = await secondProvider.callApi('Hello');

    expect(second).toEqual({ output: 'account-b', cached: false });
    expect(scriptArgs(1)[1].config.settings.apiKey).toBe(accountB);
    expect(scriptResolvedConfigCacheKey(secondProvider.config)).toBe(
      scriptResolvedConfigCacheKey(firstProvider.config),
    );
    expect(scriptResolvedConfigCacheKey(secondProvider.config)).not.toContain(accountB);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();

    // The same credential still cannot reuse a cached response: the redacted
    // fingerprint cannot tell these accounts apart, so the cache stays off.
    execute.mockResolvedValue({ output: 'account-b-again' });
    const thirdProvider = new Provider(scriptPath, options);
    const third = await thirdProvider.callApi('Hello');
    expect(third).toEqual({ output: 'account-b-again', cached: false });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('separates cache entries by script-visible metadata and prompt, not per-run ids', async () => {
    const varsFor = (evalId: string) => ({
      name: 'world',
      __evalId: evalId,
      __evalStepId: 'test-0-prompt-0-repeat-0',
      __repeatIndex: 0,
    });
    const prompt = { id: 'prompt-1', raw: 'Hello {{name}}', label: 'greeting' };
    const metadata = {
      pluginId: 'harmful',
      strategyId: 'basic',
      evaluationId: 'eval-run-1',
      traceparent: '00-aaa-bbb-01',
    };
    const cacheKey = () => mocks.get.mock.calls.at(-1)?.[0] as string;
    const scriptArgs = (callIndex: number) =>
      execute.mock.calls[callIndex][language === 'Python' ? 1 : 2] as [
        string,
        unknown,
        {
          prompt: { label: string; raw: string };
          test: { metadata: { pluginId: string; evaluationId: string } };
          vars: { __evalId: string };
        },
      ];

    execute.mockResolvedValue({ output: 'plugin-a' });
    const first = await provider.callApi('Hello world', {
      vars: varsFor('eval-run-1'),
      prompt,
      test: { metadata },
    } as any);
    const firstKey = cacheKey();

    expect(first).toEqual({ output: 'plugin-a', cached: false });
    expect(firstKey).not.toContain('__evalId');
    expect(firstKey).not.toContain('eval-run-1');
    expect(firstKey).not.toContain('traceparent');
    expect(firstKey).not.toContain('00-aaa-bbb-01');
    expect(scriptArgs(0)[2].test.metadata).toBe(metadata);
    expect(scriptArgs(0)[2].prompt.label).toBe('greeting');
    expect(scriptArgs(0)[2].vars.__evalId).toBe('eval-run-1');

    const second = await provider.callApi('Hello world', {
      vars: varsFor('eval-run-2'),
      prompt: { label: 'greeting', id: 'prompt-1', raw: 'Hello {{name}}' },
      test: {
        metadata: {
          traceparent: '00-ccc-ddd-01',
          evaluationId: 'eval-run-2',
          strategyId: 'basic',
          pluginId: 'harmful',
        },
      },
    } as any);

    expect(cacheKey()).toBe(firstKey);
    expect(second).toEqual({ output: 'plugin-a', cached: true });
    expect(execute).toHaveBeenCalledTimes(1);

    execute.mockResolvedValue({ output: 'plugin-b' });
    const third = await provider.callApi('Hello world', {
      vars: varsFor('eval-run-2'),
      prompt,
      test: {
        metadata: { pluginId: 'pii', strategyId: 'basic', evaluationId: 'eval-run-2' },
      },
    } as any);

    expect(cacheKey()).not.toBe(firstKey);
    expect(third).toEqual({ output: 'plugin-b', cached: false });
    expect(scriptArgs(1)[2].test.metadata.pluginId).toBe('pii');
    expect(scriptArgs(1)[2].test.metadata.evaluationId).toBe('eval-run-2');
    expect(execute).toHaveBeenCalledTimes(2);

    execute.mockResolvedValue({ output: 'other-label' });
    const fourth = await provider.callApi('Hello world', {
      vars: varsFor('eval-run-2'),
      prompt: { ...prompt, label: 'other' },
      test: {
        metadata: { pluginId: 'pii', strategyId: 'basic', evaluationId: 'eval-run-2' },
      },
    } as any);

    expect(fourth).toEqual({ output: 'other-label', cached: false });
    expect(scriptArgs(2)[2].prompt.label).toBe('other');
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it.each(['', null])('caches a successful result with error %s', async (error) => {
    execute.mockResolvedValue({ output: 'ok', error });

    expect(await provider.callApi('hello')).toEqual({ output: 'ok', error, cached: false });
    expect(await provider.callApi('hello')).toEqual({ output: 'ok', error, cached: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    { method: 'callEmbeddingApi', result: { embedding: [] }, functionName: 'call_embedding_api' },
    {
      method: 'callClassificationApi',
      result: { classification: {} },
      functionName: 'call_classification_api',
    },
  ] as const)(
    'preserves $method results through the cache and passes two arguments',
    async ({ method, result, functionName }) => {
      const expected = { ...result, tokenUsage: { total: 9, numRequests: 0 } };
      execute.mockResolvedValue(structuredClone(expected));

      expect(await provider[method]('hello')).toEqual(expected);
      expect(await provider[method]('hello')).toEqual(expected);
      expect(execute).toHaveBeenCalledTimes(1);
      const call = execute.mock.calls[0];
      expect(call[language === 'Python' ? 0 : 1]).toBe(functionName);
      expect(call[language === 'Python' ? 1 : 2]).toEqual(['hello', { config: { workers: 1 } }]);
    },
  );
});
