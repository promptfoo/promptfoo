import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { RubyProvider } from '../../src/providers/rubyCompletion';

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
  let provider: PythonProvider | RubyProvider;

  beforeEach(async () => {
    vi.resetAllMocks();
    const entries = new Map<string, string>();
    mocks.get.mockImplementation(async (key: string) => entries.get(key));
    mocks.set.mockImplementation(async (key: string, value: string) => entries.set(key, value));
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'script-result-contract-'));
    const script = path.join(directory, `provider.${extension}`);
    await fs.writeFile(script, '# script execution is replaced at the transport boundary');
    provider = new Provider(script, { config: { workers: 1 } });
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

  it('misses when only the test description changes', async () => {
    execute.mockResolvedValue({ output: 'ok' });
    const context = { prompt: { raw: 'same', label: 'same' }, vars: {} };
    for (const description of ['A', 'B', 'B']) {
      await provider.callApi('same', { ...context, test: { description } });
    }
    expect(execute).toHaveBeenCalledTimes(2);
    expect(mocks.get.mock.calls[0][0]).not.toBe(mocks.get.mock.calls[1][0]);
    expect(mocks.get.mock.calls[1][0]).toBe(mocks.get.mock.calls[2][0]);
  });

  it('misses when script-visible vars have different key order', async () => {
    execute.mockResolvedValue({ output: 'first order' });
    const prompt = { raw: 'same', label: 'same' };
    const a = await provider.callApi('same', { prompt, vars: { a: 1, b: 2 } });
    execute.mockResolvedValue({ output: 'second order' });
    const b = await provider.callApi('same', { prompt, vars: { b: 2, a: 1 } });
    expect(a).toMatchObject({ output: 'first order', cached: false });
    expect(b).toMatchObject({ output: 'second order', cached: false });
  });

  it('never reads or writes a cache key for secret-bearing context', async () => {
    execute.mockResolvedValue({ output: 'ok' });
    for (const apiKey of ['account-a', 'account-b', 'account-b']) {
      await provider.callApi('same', { prompt: { raw: 'same', label: 'same' }, vars: { apiKey } });
    }
    expect(execute).toHaveBeenCalledTimes(3);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
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
