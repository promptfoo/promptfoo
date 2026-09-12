import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'crypto';

import { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../src/esm';
import logger from '../../src/logger';

// Use vi.hoisted to create mock functions that can be used in vi.mock factories
const { mockSend, mockCacheGet, mockCacheSet, mockIsCacheEnabled } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
  mockIsCacheEnabled: vi.fn(),
}));

// Create a mock cache object that uses the hoisted mock functions
const mockCacheObject = {
  get: mockCacheGet,
  set: mockCacheSet,
};

// Mock the cache module - this will be used by the dynamic import
vi.mock('../../src/cache', () => ({
  getCache: vi.fn().mockReturnValue(mockCacheObject),
  isCacheEnabled: mockIsCacheEnabled,
}));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

// Mock AWS SDK
vi.mock('@aws-sdk/client-sagemaker-runtime', () => ({
  SageMakerRuntimeClient: vi.fn().mockImplementation(function ({ region }) {
    return { send: (command: unknown) => mockSend(command, region), destroy: vi.fn() };
  }),
  InvokeEndpointCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
}));

vi.mock('@smithy/core/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@smithy/core/config')>();
  return {
    ...actual,
    // Keep the mocked SDK fixture from resolving auto defaults through IMDS.
    resolveDefaultsModeConfig: () => async () => 'legacy' as const,
  };
});

import {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';

describe('SageMakerCompletionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCacheEnabled.mockReturnValue(false);
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockSend.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(['no later request', 'newer same-key result', 'uncanceled result'])(
    'guards completion caching across an async file transform with %s',
    async (scenario) => {
      const directory = await mkdtemp(path.join(tmpdir(), 'sagemaker-response-transform-'));
      const transformPath = path.join(directory, 'transform.cjs');
      await writeFile(
        transformPath,
        `let entered, release, exited;
const started = new Promise(resolve => { entered = resolve; });
const gate = new Promise(resolve => { release = resolve; });
const finished = new Promise(resolve => { exited = resolve; });
async function transform(data) {
  if (data.output === 'A') { entered(); await gate; exited(); }
  return data.output;
}
Object.assign(transform, { started, release, finished });
module.exports = transform;
`,
      );
      const fixture: { started: Promise<void>; release: () => void; finished: Promise<void> } =
        await importModule(transformPath);
      const entries = new Map<string, string>();
      mockIsCacheEnabled.mockReturnValue(true);
      mockCacheGet.mockImplementation(async (key: string) => entries.get(key));
      mockCacheSet.mockImplementation(async (key: string, value: string) => {
        entries.set(key, value);
      });
      mockSend
        .mockResolvedValueOnce({ Body: new TextEncoder().encode('{"output":"A"}') })
        .mockResolvedValueOnce({ Body: new TextEncoder().encode('{"output":"B"}') });
      const provider = new SageMakerCompletionProvider('async-transform', {
        config: {
          accessKeyId: 'SYNTHETIC_TRANSFORM',
          secretAccessKey: 'synthetic-transform-secret',
          region: 'us-east-1',
          modelType: 'custom',
          responseFormat: { path: `file://${transformPath}` },
        },
      });
      const controller = new AbortController();
      const request = provider.callApi('same request', undefined, {
        abortSignal: controller.signal,
      });
      void request.catch(() => {});
      try {
        await Promise.race([
          fixture.started,
          request.then(() => {
            throw new Error('Request completed without entering the file transform');
          }),
        ]);
        if (scenario !== 'uncanceled result') {
          const reason = new Error('Synthetic response-transform cancellation');
          controller.abort(reason);
          await expect(request).rejects.toBe(reason);
        }
        if (scenario === 'newer same-key result') {
          expect(await provider.callApi('same request')).toMatchObject({ output: 'B' });
          expect(mockCacheSet).toHaveBeenCalledTimes(1);
        }
        fixture.release();
        await fixture.finished;
        // Drain the actual parse/cache continuation after the file transform returns.
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (scenario === 'no later request') {
          expect(mockCacheSet).not.toHaveBeenCalled();
          expect(entries.size).toBe(0);
        } else {
          const output = scenario === 'newer same-key result' ? 'B' : 'A';
          if (scenario === 'uncanceled result') {
            expect(await request).toMatchObject({ output });
          }
          expect(mockCacheSet).toHaveBeenCalledTimes(1);
          expect(await provider.callApi('same request')).toMatchObject({ output, cached: true });
          expect(mockSend).toHaveBeenCalledTimes(scenario === 'newer same-key result' ? 2 : 1);
        }
      } finally {
        fixture.release();
        await Promise.allSettled([request]);
        provider.cleanup();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  describe('cache flag behavior', () => {
    it('should set cached flag when returning cached response from callApi', async () => {
      const mockCachedResponse = {
        output: 'cached sagemaker response',
        tokenUsage: { total: 50, prompt: 20, completion: 30 },
      };

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));
      mockIsCacheEnabled.mockReturnValue(true);

      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.cached).toBe(true);
      expect(result.output).toBe('cached sagemaker response');
      expect(mockCacheGet).toHaveBeenCalled();
      // Verify tokenUsage.cached is set for cached results
      expect(result.tokenUsage?.cached).toBe(50);
      // Verify API was not called
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should preserve metadata with transformed prompt when returning cached response', async () => {
      const mockCachedResponse = {
        output: 'cached response with metadata',
        tokenUsage: { total: 100 },
        metadata: {
          transformed: true,
          originalPrompt: 'original prompt',
        },
      };

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));
      mockIsCacheEnabled.mockReturnValue(true);

      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.cached).toBe(true);
      expect(result.metadata?.transformed).toBe(true);
      expect(result.metadata?.originalPrompt).toBe('original prompt');
    });
  });

  describe('cache identity', () => {
    beforeEach(() => {
      const entries = new Map<string, string>();
      mockIsCacheEnabled.mockReturnValue(true);
      mockCacheGet.mockImplementation(async (key: string) => entries.get(key));
      mockCacheSet.mockImplementation(async (key: string, value: string) => {
        entries.set(key, value);
      });
    });

    it('keeps outputs separate for different stop sequences and replays matching requests', async () => {
      mockSend.mockImplementation(async ({ Body }) => ({
        Body: new TextEncoder().encode(
          JSON.stringify({ choices: [{ text: JSON.parse(Body).stop[0] }] }),
        ),
      }));
      const providers = ['END', 'STOP'].map(
        (stop) =>
          new SageMakerCompletionProvider('test-endpoint', {
            config: { region: 'us-east-1', modelType: 'openai', stopSequences: [stop] },
          }),
      );

      for (const provider of providers) {
        const fresh = await provider.callApi('A quiet garden');
        expect(fresh.output).toBe(provider.config.stopSequences?.[0]);
        expect(fresh.cached).not.toBe(true);
        const cached = await provider.callApi('A quiet garden');
        expect(cached.output).toBe(fresh.output);
        expect(cached.cached).toBe(true);
        expect(cached.tokenUsage?.cached).toBe(fresh.tokenUsage?.total);
      }
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('keeps differently extracted outputs separate for the same request', async () => {
      mockSend.mockResolvedValue({
        Body: new TextEncoder().encode(JSON.stringify({ answer: 'A garden', summary: 'Flowers' })),
      });
      for (const [path, output] of [
        ['json.answer', 'A garden'],
        ['json.summary', 'Flowers'],
      ]) {
        const provider = new SageMakerCompletionProvider('test-endpoint', {
          config: { region: 'us-east-1', modelType: 'custom', responseFormat: { path } },
        });
        expect(await provider.callApi('A quiet garden')).toMatchObject({ output });
        expect(await provider.callApi('A quiet garden')).toMatchObject({ output, cached: true });
      }
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['AWS_SAGEMAKER_MAX_TOKENS', '128', '256', 'max_tokens'],
      ['AWS_SAGEMAKER_TEMPERATURE', '0.2', '0.8', 'temperature'],
      ['AWS_SAGEMAKER_TOP_P', '0.5', '0.9', 'top_p'],
    ])('uses effective %s values when caching requests', async (env, first, second, field) => {
      mockSend.mockImplementation(async ({ Body }) => ({
        Body: new TextEncoder().encode(
          JSON.stringify({ choices: [{ text: String(JSON.parse(Body)[field]) }] }),
        ),
      }));
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: { region: 'us-east-1', modelType: 'openai' },
      });

      for (const value of [first, second]) {
        vi.stubEnv(env, value);
        expect(await provider.callApi('A quiet garden')).toMatchObject({ output: value });
        expect(await provider.callApi('A quiet garden')).toMatchObject({
          output: value,
          cached: true,
        });
      }
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('reuses explicit zero settings when environment defaults change', async () => {
      mockSend.mockResolvedValue({
        Body: new TextEncoder().encode(JSON.stringify({ choices: [{ text: 'A garden' }] })),
      });
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: { region: 'us-east-1', modelType: 'openai', maxTokens: 0, temperature: 0, topP: 0 },
      });
      await provider.callApi('A quiet garden');
      vi.stubEnv('AWS_SAGEMAKER_MAX_TOKENS', '256');
      vi.stubEnv('AWS_SAGEMAKER_TEMPERATURE', '0.8');
      vi.stubEnv('AWS_SAGEMAKER_TOP_P', '0.9');

      expect(await provider.callApi('A quiet garden')).toMatchObject({
        output: 'A garden',
        cached: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockSend.mock.calls[0][0].Body)).toMatchObject({
        max_tokens: 0,
        temperature: 0,
        top_p: 0,
      });
    });

    it.each(['cache lookup', 'endpoint request'])(
      'keeps the request and cache identity together when defaults change during %s',
      async (stage) => {
        vi.stubEnv('AWS_SAGEMAKER_MAX_TOKENS', '128');
        const getCached = mockCacheGet.getMockImplementation()!;
        mockCacheGet.mockImplementation(async (key: string) => {
          const cached = await getCached(key);
          if (stage === 'cache lookup' && mockCacheGet.mock.calls.length === 1) {
            vi.stubEnv('AWS_SAGEMAKER_MAX_TOKENS', '256');
          }
          return cached;
        });
        mockSend.mockImplementation(async ({ Body }) => {
          const output = String(JSON.parse(Body).max_tokens);
          if (stage === 'endpoint request') {
            vi.stubEnv('AWS_SAGEMAKER_MAX_TOKENS', '256');
          }
          return {
            Body: new TextEncoder().encode(JSON.stringify({ choices: [{ text: output }] })),
          };
        });
        const provider = new SageMakerCompletionProvider('test-endpoint', {
          config: { region: 'us-east-1', modelType: 'openai' },
        });

        expect(await provider.callApi('A quiet garden')).toMatchObject({ output: '128' });
        expect(await provider.callApi('A quiet garden')).toMatchObject({ output: '256' });
        expect(await provider.callApi('A quiet garden')).toMatchObject({
          output: '256',
          cached: true,
        });
        vi.stubEnv('AWS_SAGEMAKER_MAX_TOKENS', '128');
        expect(await provider.callApi('A quiet garden')).toMatchObject({
          output: '128',
          cached: true,
        });
        expect(mockSend).toHaveBeenCalledTimes(2);
      },
    );

    it.each([
      ['endpoint', 'EndpointName', 'first-endpoint', 'second-endpoint'],
      ['contentType', 'ContentType', 'application/json', 'application/x-json'],
      ['acceptType', 'Accept', 'application/json', 'application/x-json'],
    ] as const)(
      'keeps %s bound to its request across cache lookup',
      async (field, wireField, first, second) => {
        const provider = new SageMakerCompletionProvider('test-endpoint', {
          config: { region: 'us-east-1', modelType: 'custom', [field]: first },
        });
        const getCached = mockCacheGet.getMockImplementation()!;
        mockCacheGet.mockImplementation(async (key: string) => {
          const cached = await getCached(key);
          if (mockCacheGet.mock.calls.length === 1) {
            provider.config[field] = second;
          }
          return cached;
        });
        mockSend.mockImplementation(async (command) => ({
          Body: new TextEncoder().encode(JSON.stringify({ output: command[wireField] })),
        }));

        expect(await provider.callApi('A quiet garden')).toMatchObject({ output: first });
        expect(await provider.callApi('A quiet garden')).toMatchObject({ output: second });
        expect(await provider.callApi('A quiet garden')).toMatchObject({
          output: second,
          cached: true,
        });
        provider.config[field] = first;
        expect(await provider.callApi('A quiet garden')).toMatchObject({
          output: first,
          cached: true,
        });
        expect(mockSend).toHaveBeenCalledTimes(2);
        expect(mockSend.mock.calls.map(([command]) => command[wireField])).toEqual([first, second]);
      },
    );

    it.each([
      ['cache lookup', undefined],
      ['cache lookup', 'json.first'],
      ['endpoint request', undefined],
      ['endpoint request', 'json.first'],
    ] as const)('keeps response path %s / %s bound to its cached output', async (stage, path) => {
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: { region: 'us-east-1', modelType: 'custom', responseFormat: { path } },
      });
      const getCached = mockCacheGet.getMockImplementation()!;
      mockCacheGet.mockImplementation(async (key: string) => {
        const cached = await getCached(key);
        if (stage === 'cache lookup' && mockCacheGet.mock.calls.length === 1) {
          provider.config.responseFormat!.path = 'json.second';
        }
        return cached;
      });
      mockSend.mockImplementation(async () => {
        if (stage === 'endpoint request') {
          provider.config.responseFormat!.path = 'json.second';
        }
        return {
          Body: new TextEncoder().encode(
            JSON.stringify({ output: 'first', first: 'first', second: 'second' }),
          ),
        };
      });

      expect(await provider.callApi('A quiet garden')).toMatchObject({ output: 'first' });
      expect(await provider.callApi('A quiet garden')).toMatchObject({ output: 'second' });
      expect(await provider.callApi('A quiet garden')).toMatchObject({
        output: 'second',
        cached: true,
      });
      provider.config.responseFormat!.path = path;
      expect(await provider.callApi('A quiet garden')).toMatchObject({
        output: 'first',
        cached: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it.each(['cache lookup', 'credential loading'])(
      'keeps the runtime region bound to its request during %s',
      async (stage) => {
        const provider = new SageMakerCompletionProvider('test-endpoint', {
          config: { region: 'us-east-1', modelType: 'custom' },
        });
        const getCached = mockCacheGet.getMockImplementation()!;
        mockCacheGet.mockImplementation(async (key: string) => {
          const cached = await getCached(key);
          if (stage === 'cache lookup' && mockCacheGet.mock.calls.length === 1) {
            provider.config.region = 'us-west-2';
          }
          return cached;
        });
        const credentials = vi.spyOn(provider, 'getCredentials').mockImplementation(async () => {
          if (stage === 'credential loading') {
            provider.config.region = 'us-west-2';
          }
          return undefined;
        });
        mockSend.mockImplementation(async (_command, region) => ({
          Body: new TextEncoder().encode(JSON.stringify({ output: region })),
        }));

        expect(await provider.callApi('A quiet garden')).toMatchObject({ output: 'us-east-1' });
        expect(await provider.callApi('A quiet garden')).toMatchObject({ output: 'us-west-2' });
        expect(await provider.callApi('A second garden')).toMatchObject({ output: 'us-west-2' });
        expect(await provider.callApi('A quiet garden')).toMatchObject({
          output: 'us-west-2',
          cached: true,
        });
        provider.config.region = 'us-east-1';
        expect(await provider.callApi('A quiet garden')).toMatchObject({
          output: 'us-east-1',
          cached: true,
        });
        expect(mockSend).toHaveBeenCalledTimes(3);
        expect(SageMakerRuntimeClient).toHaveBeenCalledTimes(3);
        // A new transport in the same region retains its credential provider.
        expect(credentials).toHaveBeenCalledTimes(2);
      },
    );

    it('keeps concurrent requests on their captured runtime regions', async () => {
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: { region: 'us-east-1', modelType: 'custom' },
      });
      let release!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pendingCredentials = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(provider, 'getCredentials')
        .mockImplementationOnce(async () => {
          started();
          await pendingCredentials;
          return undefined;
        })
        .mockResolvedValue(undefined);
      mockSend.mockImplementation(async (_command, region) => ({
        Body: new TextEncoder().encode(JSON.stringify({ output: region })),
      }));

      const first = provider.callApi('A quiet garden');
      await waiting;
      provider.config.region = 'us-west-2';
      const second = await provider.callApi('A quiet garden');
      release();
      expect(await first).toMatchObject({ output: 'us-east-1' });
      expect(second).toMatchObject({ output: 'us-west-2' });
      expect(await provider.callApi('A quiet garden')).toMatchObject({
        output: 'us-west-2',
        cached: true,
      });
      provider.config.region = 'us-east-1';
      expect(await provider.callApi('A quiet garden')).toMatchObject({
        output: 'us-east-1',
        cached: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('preserves an injected runtime without loading credentials', async () => {
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: { region: 'us-east-1', modelType: 'custom' },
      });
      const send = vi
        .fn()
        .mockResolvedValue({ Body: new TextEncoder().encode('{"output":"injected"}') });
      provider.sagemakerRuntime = { send };
      const credentials = vi.spyOn(provider, 'getCredentials');
      for (const region of ['us-east-1', 'us-west-2']) {
        provider.config.region = region;
        expect(await provider.callApi('A quiet garden')).toMatchObject({ output: 'injected' });
      }
      expect(send).toHaveBeenCalledTimes(2);
      expect(SageMakerRuntimeClient).not.toHaveBeenCalled();
      expect(credentials).not.toHaveBeenCalled();
    });

    it.each([
      { cacheEnabled: false, bustCache: false },
      { cacheEnabled: true, bustCache: true },
    ])('does not hash unused cache keys for %j', async ({ cacheEnabled, bustCache }) => {
      mockIsCacheEnabled.mockReturnValue(cacheEnabled);
      mockSend.mockResolvedValue({ Body: new TextEncoder().encode('{"output":"A garden"}') });
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: { region: 'us-east-1', modelType: 'custom' },
      });
      const createHash = vi.spyOn(crypto, 'createHash');

      expect(
        await provider.callApi('A quiet garden', {
          vars: {},
          prompt: { raw: 'A quiet garden', label: 'Garden' },
          bustCache,
        }),
      ).toMatchObject({
        output: 'A garden',
      });
      expect(createHash).not.toHaveBeenCalled();
      expect(mockCacheGet).not.toHaveBeenCalled();
      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it('uses the original request when caching is enabled during the endpoint response', async () => {
      mockIsCacheEnabled.mockReturnValue(false);
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: { region: 'us-east-1', modelType: 'custom', endpoint: 'first-endpoint' },
      });
      mockSend.mockImplementation(async ({ EndpointName }) => {
        provider.config.endpoint = 'second-endpoint';
        mockIsCacheEnabled.mockReturnValue(true);
        return { Body: new TextEncoder().encode(JSON.stringify({ output: EndpointName })) };
      });

      expect(await provider.callApi('A quiet garden')).toMatchObject({ output: 'first-endpoint' });
      provider.config.endpoint = 'first-endpoint';
      expect(await provider.callApi('A quiet garden')).toMatchObject({
        output: 'first-endpoint',
        cached: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('uses the model type resolved from the provider ID for response caching', async () => {
      mockSend.mockResolvedValue({
        Body: new TextEncoder().encode(
          JSON.stringify({ generation: 'Llama output', choices: [{ text: 'OpenAI output' }] }),
        ),
      });
      for (const [modelType, output] of [
        ['openai', 'OpenAI output'],
        ['llama', 'Llama output'],
      ]) {
        const provider = new SageMakerCompletionProvider('test-endpoint', {
          id: `sagemaker:${modelType}:test-endpoint`,
          config: { region: 'us-east-1' },
        });
        expect(await provider.callApi('A quiet garden')).toMatchObject({ output });
        expect(await provider.callApi('A quiet garden')).toMatchObject({ output, cached: true });
      }
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('does not replay a cached success when a changed request fails', async () => {
      mockSend
        .mockResolvedValueOnce({
          Body: new TextEncoder().encode(JSON.stringify({ choices: [{ text: 'A garden' }] })),
        })
        .mockRejectedValue(new Error('Endpoint unavailable'));
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: { region: 'us-east-1', modelType: 'openai', stopSequences: ['END'] },
      });
      await provider.callApi('A quiet garden');
      provider.config.stopSequences = ['STOP'];

      expect(await provider.callApi('A quiet garden')).toEqual({
        error: 'SageMaker API error: Endpoint unavailable',
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockCacheSet).toHaveBeenCalledTimes(1);
    });
  });

  describe('payload formatting', () => {
    it('reports invalid configuration without logging configured credential values', () => {
      const warn = vi.spyOn(logger, 'warn');
      new SageMakerCompletionProvider('endpoint', {
        config: {
          modelType: 'custom',
          accessKeyId: 'SENTINEL_ACCESS_KEY',
          secretAccessKey: 'SENTINEL_SECRET_KEY',
          sessionToken: 'SENTINEL_SESSION_TOKEN',
          maxTokens: 'invalid-number' as unknown as number,
        },
      });
      const warnings = JSON.stringify(warn.mock.calls);
      expect(warnings).toContain('maxTokens');
      expect(warnings).toContain('number');
      for (const sentinel of [
        'SENTINEL_ACCESS_KEY',
        'SENTINEL_SECRET_KEY',
        'SENTINEL_SESSION_TOKEN',
      ]) {
        expect(warnings).not.toContain(sentinel);
      }
    });

    it('accepts function transforms in config without validation warnings', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const transformFn = (output: unknown) => String(output).trim();

      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: transformFn,
        },
      });

      expect(provider.transform).toBe(transformFn);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('applies a direct TransformFunction to the prompt via applyTransformation', async () => {
      const transformFn = (prompt: unknown) => `TRANSFORMED:${String(prompt).trim()}`;
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: transformFn,
        },
      });

      const transformed = await provider.applyTransformation('  hello  ');
      expect(transformed).toBe('TRANSFORMED:hello');
    });

    it('evaluates inline string arrow transforms with `prompt` as the identifier', async () => {
      // Pins down why the inline-string branch stays local to sagemaker.ts:
      // the shared util would rename `prompt` to `output` and break user configs.
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: '(prompt) => prompt.toUpperCase()',
        },
      });

      const transformed = await provider.applyTransformation('hello world');
      expect(transformed).toBe('HELLO WORLD');
    });

    it('awaits async inline string arrow transforms', async () => {
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: 'async (prompt) => `${prompt}!`',
        },
      });

      await expect(provider.applyTransformation('hello')).resolves.toBe('hello!');
    });

    it('rethrows errors from a function transform instead of silently running against the untransformed prompt', async () => {
      // Contract change in PR #8441: a user-supplied TransformFunction that throws
      // is a programming error and must surface — string/file transforms keep their
      // legacy best-effort behavior for backward compatibility.
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: (() => {
            throw new Error('boom in transform');
          }) as (prompt: unknown) => string,
        },
      });

      await expect(provider.applyTransformation('hello')).rejects.toThrow('boom in transform');
    });

    it('swallows errors from inline string transforms (legacy best-effort behavior)', async () => {
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: `(prompt) => { throw new Error('string boom'); }`,
        },
      });

      // String transforms preserve the legacy contract: log and fall back to the
      // original prompt. This test guards that we didn't over-rotate the rethrow.
      await expect(provider.applyTransformation('hello')).resolves.toBe('hello');
    });
  });

  describe('callApi with function transforms', () => {
    it('surfaces function-transform failures as a ProviderResponse.error without double-labeling', async () => {
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: (() => {
            throw new Error('transform boom');
          }) as (prompt: unknown) => string,
        },
      });

      const result = await provider.callApi('hello');
      expect(result.output).toBeUndefined();
      // The response error unwraps `transform()`'s wrapper so the user sees a
      // single `SageMaker transform error: <raw>` with no double-labeling.
      // Pin the exact shape rather than negating the wrapper's internal format.
      expect(result.error).toMatch(/^SageMaker transform error: transform boom$/);
    });

    it('falls back to the original prompt when a function transform returns undefined', async () => {
      // `stringifyTransformResult` returns undefined for null/undefined return values,
      // which causes `applyTransformation` to fall back to the original prompt with a
      // debug log. Guard this observable behavior so a future refactor doesn't turn
      // it into an error by accident.
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: (() => undefined) as unknown as (prompt: unknown) => string,
        },
      });

      await expect(provider.applyTransformation('original-prompt')).resolves.toBe(
        'original-prompt',
      );
    });

    it('preserves an explicit maxTokens value of 0', () => {
      vi.stubEnv('AWS_SAGEMAKER_MAX_TOKENS', '1024');

      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'openai',
          maxTokens: 0,
        },
      });

      const payload = JSON.parse(provider.formatPayload('Hello'));

      expect(payload.max_tokens).toBe(0);
    });
  });
});

describe('SageMakerEmbeddingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCacheEnabled.mockReturnValue(false);
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockSend.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it.each(['cache lookup', 'SDK response'])(
    'keeps embedding request, parsing and cache identity stable across %s',
    async (stage) => {
      mockIsCacheEnabled.mockReturnValue(true);
      const cache = new Map<string, string>();
      let started!: () => void;
      let finish!: () => void;
      const held = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let firstLookup = true;
      mockCacheGet.mockImplementation(async (key: string) => {
        if (firstLookup && stage === 'cache lookup') {
          firstLookup = false;
          started();
          await gate;
        }
        return cache.get(key);
      });
      mockCacheSet.mockImplementation(async (key: string, value: string) => {
        cache.set(key, value);
      });
      mockSend.mockImplementation(async (command, region) => {
        if (mockSend.mock.calls.length === 1 && stage === 'SDK response') {
          started();
          await gate;
        }
        const first = command.EndpointName === 'endpoint-A';
        expect(region).toBe(first ? 'us-east-1' : 'us-west-2');
        expect(command.ContentType).toBe(first ? 'application/a' : 'application/b');
        expect(command.Accept).toBe(first ? 'application/a' : 'application/b');
        expect(JSON.parse(command.Body)).toEqual(
          first ? { inputs: 'same text' } : { input: 'same text', model: 'embedding' },
        );
        return {
          Body: new TextEncoder().encode(JSON.stringify({ first: [1, 0], second: [0, 1] })),
        };
      });
      const provider = new SageMakerEmbeddingProvider('endpoint-A', {
        config: {
          region: 'us-east-1',
          modelType: 'huggingface',
          contentType: 'application/a',
          acceptType: 'application/a',
          responseFormat: { path: 'json.first' },
        },
      });
      const responseFormat = provider.config.responseFormat;
      if (!responseFormat) {
        throw new Error('Missing embedding fixture response format');
      }
      const requestA = provider.callEmbeddingApi('same text');
      void requestA.catch(() => {});
      try {
        await Promise.race([
          held,
          requestA.then(() => {
            throw new Error('Request completed before the hold');
          }),
        ]);
        Object.assign(provider.config, {
          endpoint: 'endpoint-B',
          region: 'us-west-2',
          modelType: 'openai',
          contentType: 'application/b',
          acceptType: 'application/b',
        });
        responseFormat.path = 'json.second';
        finish();
        expect(await requestA).toMatchObject({ embedding: [1, 0], tokenUsage: { numRequests: 1 } });
        expect(mockCacheSet.mock.calls[0][0]).toBe(mockCacheGet.mock.calls[0][0]);
        expect(await provider.callEmbeddingApi('same text')).toMatchObject({ embedding: [0, 1] });
        expect(mockSend).toHaveBeenCalledTimes(2);
        expect(await provider.callEmbeddingApi('same text')).toMatchObject({
          embedding: [0, 1],
          cached: true,
        });
        expect(mockSend).toHaveBeenCalledTimes(2);
        Object.assign(provider.config, {
          endpoint: 'endpoint-A',
          region: 'us-east-1',
          modelType: 'huggingface',
          contentType: 'application/a',
          acceptType: 'application/a',
        });
        responseFormat.path = 'json.first';
        expect(await provider.callEmbeddingApi('same text')).toMatchObject({
          embedding: [1, 0],
          cached: true,
        });
        expect(mockSend).toHaveBeenCalledTimes(2);
        expect(cache.size).toBe(2);
      } finally {
        finish();
        await Promise.allSettled([requestA]);
        provider.cleanup();
      }
    },
  );

  it('does not cache a late embedding response after caller cancellation', async () => {
    mockIsCacheEnabled.mockReturnValue(true);
    mockCacheGet.mockResolvedValue(undefined);
    let started!: () => void;
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mockSend.mockImplementation(async () => {
      started();
      await gate;
      // Deliberately ignore SDK cancellation to exercise the late-result guard.
      return { Body: new TextEncoder().encode(JSON.stringify({ embedding: [1, 0] })) };
    });
    const provider = new SageMakerEmbeddingProvider('abort-endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    const controller = new AbortController();
    const request = provider.callEmbeddingApi('text', undefined, {
      abortSignal: controller.signal,
    });
    void request.catch(() => {});
    try {
      await Promise.race([
        held,
        request.then(() => {
          throw new Error('Request was not held');
        }),
      ]);
      const error = new Error('Synthetic embedding cancellation');
      controller.abort(error);
      await expect(request).rejects.toBe(error);
      finish();
      await mockSend.mock.results[0].value;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(mockCacheSet).not.toHaveBeenCalled();
    } finally {
      finish();
      await Promise.allSettled([request]);
      provider.cleanup();
    }
  });

  it('uses one endpoint snapshot for embedding cache lookup and write', async () => {
    mockIsCacheEnabled.mockReturnValue(true);
    mockCacheGet.mockResolvedValue(undefined);
    const provider = new SageMakerEmbeddingProvider('first-endpoint', {
      config: { region: 'us-east-1', modelType: 'custom' },
    });
    let release!: () => void;
    const sent = new Promise<void>((resolve) => {
      mockSend.mockImplementationOnce(async () => {
        resolve();
        await new Promise<void>((done) => {
          release = done;
        });
        return { Body: new TextEncoder().encode('{"embedding":[0.1,0.2]}') };
      });
    });
    vi.spyOn(provider, 'getEndpointName')
      .mockReturnValueOnce('first-endpoint')
      .mockReturnValue('later-endpoint');

    const result = provider.callEmbeddingApi('text');
    await sent;
    release();
    expect(await result).toMatchObject({ embedding: [0.1, 0.2] });
    const configHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          endpoint: 'first-endpoint',
          modelType: 'custom',
          contentType: 'application/json',
          acceptType: 'application/json',
          region: 'us-east-1',
        }),
      )
      .digest('hex')
      .substring(0, 8);
    const key = mockCacheGet.mock.calls[0][0];
    expect(key).toMatch(/^sagemaker:embedding:v1:first-endpoint:/);
    expect(key.endsWith(`:${configHash}`)).toBe(true);
    expect(mockCacheSet.mock.calls[0][0]).toBe(key);
  });

  describe('cache flag behavior', () => {
    it('should set cached flag when returning cached response from callEmbeddingApi', async () => {
      const mockCachedResponse = {
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        tokenUsage: { prompt: 10, total: 10 },
      };

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));
      mockIsCacheEnabled.mockReturnValue(true);

      const provider = new SageMakerEmbeddingProvider('test-embedding-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'openai',
        },
      });

      const result = await provider.callEmbeddingApi('test input');

      expect(result.cached).toBe(true);
      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(mockCacheGet).toHaveBeenCalled();
      // Verify tokenUsage.cached is set for cached results
      expect(result.tokenUsage?.cached).toBe(10);
      // Verify API was not called
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should preserve all embedding response fields when returning cached response', async () => {
      const mockCachedResponse = {
        embedding: [0.1, 0.2],
        tokenUsage: { prompt: 5, total: 5 },
        cost: 0.0001,
        latencyMs: 150,
      };

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));
      mockIsCacheEnabled.mockReturnValue(true);

      const provider = new SageMakerEmbeddingProvider('test-embedding-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'openai',
        },
      });

      const result = await provider.callEmbeddingApi('test input');

      expect(result.cached).toBe(true);
      expect(result.embedding).toEqual([0.1, 0.2]);
      expect(result.cost).toBe(0.0001);
      expect(result.latencyMs).toBe(150);
    });
  });
});
