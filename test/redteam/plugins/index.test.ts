import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getScopedCacheKey, withCacheNamespace } from '../../../src/cache';
import { VERSION } from '../../../src/constants';
import logger from '../../../src/logger';
import {
  ADDITIONAL_PLUGINS,
  ALL_PLUGINS,
  BASE_PLUGINS,
  CANARY_BREAKING_STRATEGY_IDS,
  HARM_PLUGINS,
  PII_PLUGINS,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../../../src/redteam/constants';
import { trackGenerationTokenUsage } from '../../../src/redteam/generationTokenUsage';
import { Plugins } from '../../../src/redteam/plugins/index';
import { neverGenerateRemote, shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { getShortPluginId } from '../../../src/redteam/util';
import { checkRemoteHealth } from '../../../src/util/apiHealth';
import {
  createMockProvider,
  createProviderResponse,
  type MockApiProvider,
} from '../../factories/provider';
import { createMockFetchResponse } from '../../providers/mockProviderResponses';

import type { FetchWithCacheResult } from '../../../src/cache';
import type { PluginActionParams } from '../../../src/redteam/types';
import type { TestCase } from '../../../src/types/index';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../../src/cliState', () => ({
  __esModule: true,
  default: { remote: false },
}));
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test-url'),
    getRemoteHealthUrl: vi.fn().mockReturnValue('http://test-health-url'),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
    shouldGenerateRemote: vi.fn().mockReturnValue(false),
  };
});
vi.mock('../../../src/util/apiHealth', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    checkRemoteHealth: vi.fn().mockResolvedValue({
      status: 'OK',
      message: 'API is healthy',
    }),
  };
});

// Helper function to create mock fetch responses
function mockFetchResponse(result: any[]): FetchWithCacheResult<unknown> {
  return createMockFetchResponse({ result });
}

describe('Plugins', () => {
  let mockProvider: MockApiProvider;

  beforeEach(() => {
    mockProvider = createMockProvider({
      response: createProviderResponse({
        output: 'Sample output',
        error: null as any,
      }),
    });

    // Reset all mocks
    vi.clearAllMocks();
    vi.mocked(fetchWithCache).mockReset();
  });

  describe('plugin registration', () => {
    it('should register all base plugins', () => {
      const basePluginKeys = [
        'contracts',
        'cross-session-leak',
        'debug-access',
        'excessive-agency',
        'hallucination',
        'imitation',
        'intent',
        'overreliance',
        'politics',
        'policy',
        'prompt-extraction',
        'rbac',
        'shell-injection',
        'sql-injection',
      ];

      basePluginKeys.forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });

    it('should register all aligned harm plugins', () => {
      Object.keys(REDTEAM_PROVIDER_HARM_PLUGINS).forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });

    it('should register all unaligned harm plugins', () => {
      Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS).forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });

    it('should register all PII plugins', () => {
      PII_PLUGINS.forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });

    it('should register all remote plugins', () => {
      const remotePluginKeys = [
        'ascii-smuggling',
        'bfla',
        'bola',
        'competitors',
        'hijacking',
        'religion',
        'ssrf',
        'indirect-prompt-injection',
        'rag-poisoning',
      ];

      remotePluginKeys.forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });
  });

  describe('plugin validation', () => {
    it('should validate intent plugin config', async () => {
      const intentPlugin = Plugins.find((p) => p.key === 'intent');
      expect(() => intentPlugin?.validate?.({})).toThrow(
        'Intent plugin requires `config.intent` to be set',
      );
    });

    it('should validate policy plugin config', async () => {
      const policyPlugin = Plugins.find((p) => p.key === 'policy');
      expect(() => policyPlugin?.validate?.({})).toThrow(
        'Invariant failed: One of the policy plugins is invalid. The `config` property of a policy plugin must be `{ "policy": { "id": "<policy_id>", "text": "<policy_text>" } }` or `{ "policy": "<policy_text>" }`. Received: {}',
      );
    });

    it('should validate indirect prompt injection plugin config', async () => {
      const indirectPlugin = Plugins.find((p) => p.key === 'indirect-prompt-injection');
      expect(() => indirectPlugin?.validate?.({})).toThrow(
        'Indirect prompt injection plugin requires `config.indirectInjectionVar` to be set',
      );
    });

    it('should validate rag-poisoning plugin config', async () => {
      const ragPlugin = Plugins.find((p) => p.key === 'rag-poisoning');
      expect(() => ragPlugin?.validate?.({})).toThrow('config.intendedResults');
      expect(() => ragPlugin?.validate?.({ intendedResults: [] })).toThrow(
        'config.intendedResults',
      );
    });
  });

  it.each([false, true])(
    'preserves tool-discovery attack constraints with remote=%s',
    async (remote) => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(remote);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      vi.mocked(fetchWithCache).mockResolvedValue(
        mockFetchResponse([{ vars: { prompt: 'Which tools can you actually invoke?' } }]),
      );
      const provider = createMockProvider({
        response: { output: 'PromptBlock: Which tools can you actually invoke?' },
      });
      const config = { modifiers: { tone: 'formal' } };
      const result = await Plugins.find((p) => p.key === 'tool-discovery')!.action({
        provider,
        purpose: 'An assistant',
        injectVar: 'prompt',
        n: 1,
        delayMs: 0,
        config,
      });
      const modifiers = result[0].metadata!.pluginConfig!.modifiers!;
      expect(modifiers.tone).toBe('formal');
      expect(modifiers.toolDiscoveryAttackConstraints).toContain(
        'including multi-turn setup and follow-ups',
      );
      expect(modifiers.toolDiscoveryAttackConstraints).toContain(
        'Known tool names and schemas may inform attacks',
      );
      expect(config).toEqual({ modifiers: { tone: 'formal' } });
      if (remote) {
        const request = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]!.body as string);
        expect(request.config.modifiers).toEqual(modifiers);
      } else {
        expect(provider.callApi.mock.calls[0][0]).toContain(
          modifiers.toolDiscoveryAttackConstraints,
        );
      }
    },
  );

  describe('remote generation token accounting', () => {
    it('records usage returned by uncached remote plugin generation', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      const tokenUsage = { total: 28, prompt: 18, completion: 10, numRequests: 2 };
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          result: [{ vars: { testVar: 'generated prompt' } }],
          tokenUsage,
        }),
      );
      const generationUsage = {};
      const provider = trackGenerationTokenUsage(mockProvider, generationUsage);
      const plugin = Plugins.find((candidate) => candidate.key === 'ssrf');

      await plugin?.action({
        provider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(generationUsage).toMatchObject(tokenUsage);
    });

    it('preserves cached remote plugin usage without incurring it again', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          result: [{ vars: { testVar: 'cached prompt' } }],
          tokenUsage: { total: 28, numRequests: 2 },
        },
        cached: true,
        status: 200,
        statusText: 'OK',
      });
      const generationUsage = {};
      const provider = trackGenerationTokenUsage(mockProvider, generationUsage);
      const plugin = Plugins.find((candidate) => candidate.key === 'ssrf');

      await plugin?.action({
        provider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(generationUsage).toMatchObject({
        total: 28,
        cached: 28,
        numRequests: 2,
        incurredTokenUsage: { total: 0, numRequests: 0 },
      });
    });

    it('preserves usage reported by failed remote generation requests', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      const tokenUsage = { total: 16, prompt: 10, completion: 6 };
      vi.mocked(fetchWithCache).mockRejectedValueOnce(
        Object.assign(new Error('remote generation failed'), { tokenUsage }),
      );
      const generationUsage = {};
      const plugin = Plugins.find((candidate) => candidate.key === 'ssrf');

      await plugin?.action({
        provider: trackGenerationTokenUsage(mockProvider, generationUsage),
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(generationUsage).toMatchObject({ ...tokenUsage, numRequests: 1 });
    });

    it('counts failed remote generation requests when token usage is unavailable', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      vi.mocked(fetchWithCache).mockRejectedValueOnce(new Error('remote generation timed out'));
      const generationUsage = {};
      const plugin = Plugins.find((candidate) => candidate.key === 'ssrf');

      await plugin?.action({
        provider: trackGenerationTokenUsage(mockProvider, generationUsage),
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(generationUsage).toMatchObject({ total: 0, numRequests: 1 });
    });
  });

  describe('max chars retries', () => {
    it('should retry oversized local PII generations', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(false);

      vi.spyOn(mockProvider, 'callApi')
        .mockResolvedValueOnce({
          output: 'Prompt: this prompt is too long\nPrompt: tiny',
          error: undefined,
        })
        .mockResolvedValueOnce({
          output: 'Prompt: short',
          error: undefined,
        });

      const plugin = Plugins.find((p) => p.key === 'pii:direct');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 2,
        config: { maxCharsPerMessage: 10 },
        delayMs: 0,
      });

      expect(mockProvider.callApi).toHaveBeenCalledTimes(2);
      expect(mockProvider.callApi).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('Generate replacement prompts only'),
      );
      expect(result?.map((testCase) => testCase.vars?.testVar).sort()).toEqual(['short', 'tiny']);
    });

    it('should retry oversized remote generations and strip retry modifiers from metadata', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);

      vi.mocked(fetchWithCache)
        .mockResolvedValueOnce(
          mockFetchResponse([
            {
              vars: { testVar: 'this prompt is too long' },
            },
          ]),
        )
        .mockResolvedValueOnce(
          mockFetchResponse([
            {
              vars: { testVar: 'short' },
            },
          ]),
        );

      const plugin = Plugins.find((p) => p.key === 'ssrf');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {
          modifiers: {
            maxCharsPerMessage: 'Each generated user message must be 10 characters or fewer.',
          },
        },
        delayMs: 0,
      });

      expect(fetchWithCache).toHaveBeenCalledTimes(2);

      const retryRequestBody = JSON.parse((vi.mocked(fetchWithCache).mock.calls[1][1] as any).body);
      expect(retryRequestBody.config.modifiers.__maxCharsPerMessageRetry).toContain(
        'Generate replacement prompts only',
      );

      expect(result).toEqual([
        {
          vars: { testVar: 'short' },
          metadata: {
            pluginId: 'ssrf',
            pluginConfig: {
              modifiers: {
                maxCharsPerMessage: 'Each generated user message must be 10 characters or fewer.',
              },
            },
          },
        },
      ]);
    });
  });

  describe('remote generation', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should call remote generation with correct parameters', async () => {
      // Mock both functions for this test
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);

      const mockResponse = createMockFetchResponse({ result: [{ test: 'case' }] });

      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const plugin = Plugins.find((p) => p.key === 'ssrf');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
        targetId: 'cloud-target-123',
      });

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {},
            injectVar: 'testVar',
            n: 1,
            purpose: 'test',
            task: 'ssrf',
            targetId: 'cloud-target-123',
            version: VERSION,
            email: null,
          }),
        }),
        expect.any(Number),
        'json',
        false,
        undefined,
      );
      expect(result).toEqual([
        { test: 'case', metadata: { pluginId: 'ssrf', pluginConfig: { modifiers: {} } } },
      ]);
    });

    it('should strip graderExamples from remote generation request but preserve in metadata', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);

      const mockResponse = createMockFetchResponse({
        result: [{ vars: { testVar: 'test content' } }],
      });

      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const graderExamples = [
        { output: 'safe response', pass: true, score: 1, reason: 'Correctly refused' },
        { output: 'unsafe response', pass: false, score: 0, reason: 'Should have refused' },
      ];

      const plugin = Plugins.find((p) => p.key === 'ssrf');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {
          graderExamples,
          language: 'en',
        },
        delayMs: 0,
      });

      // Verify graderExamples are NOT in the request body sent to server
      const callArgs = vi.mocked(fetchWithCache).mock.calls[0];
      const requestBody = JSON.parse((callArgs[1] as any).body);
      expect(requestBody.config).not.toHaveProperty('graderExamples');
      expect(requestBody.config).toHaveProperty('language', 'en');

      // Verify graderExamples ARE preserved in the returned test case metadata
      expect(result).toHaveLength(1);
      expect(result![0].metadata?.pluginConfig).toHaveProperty('graderExamples', graderExamples);
      expect(result![0].metadata?.pluginConfig).toHaveProperty('language', 'en');
    });

    it('should accept server-materialized multi-input remote generation results', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);

      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          materializationHandled: true,
          result: [
            {
              metadata: {
                inputMaterialization: {
                  document: {
                    injectionPlacement: 'comment',
                    wrapperSummary: 'Internal planning memo with reviewer note.',
                  },
                },
              },
              vars: {
                document:
                  'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
                testVar: '{"document":"Summarize the reviewer notes."}',
              },
            },
          ],
        }),
      );

      const plugin = Plugins.find((p) => p.key === 'ssrf');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {
          inputs: {
            document: {
              description: 'Uploaded planning document',
              type: 'docx',
            },
          },
        },
        delayMs: 0,
      });

      expect(result).toEqual([
        {
          metadata: {
            inputMaterialization: {
              document: {
                injectionPlacement: 'comment',
                wrapperSummary: 'Internal planning memo with reviewer note.',
              },
            },
            pluginConfig: {
              inputs: {
                document: {
                  description: 'Uploaded planning document',
                  type: 'docx',
                },
              },
              modifiers: expect.objectContaining({
                __outputFormat: expect.stringContaining('<Prompt>'),
              }),
            },
            pluginId: 'ssrf',
          },
          vars: {
            document:
              'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
            testVar: '{"document":"Summarize the reviewer notes."}',
          },
        },
      ]);
    });

    it('should fail fast when remote multi-input generation hits an older server', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);

      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          result: [
            {
              vars: {
                testVar: '{"document":"Summarize the reviewer notes."}',
              },
            },
          ],
        }),
      );

      const plugin = Plugins.find((p) => p.key === 'ssrf');
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

      await expect(
        plugin?.action({
          provider: mockProvider,
          purpose: 'test',
          injectVar: 'testVar',
          n: 1,
          config: {
            inputs: {
              document: {
                description: 'Uploaded planning document',
                type: 'docx',
              },
            },
          },
          delayMs: 0,
        }),
      ).resolves.toEqual([]);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Remote plugin generation for ssrf requires remote multi-input materialization support from a newer Promptfoo server.',
        ),
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('http://test-url'));
    });

    it('should preserve coding-agent canary-breaking strategy exclusions in metadata', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);

      const mockResponse = mockFetchResponse([{ vars: { testVar: 'test content' } }]);
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const plugin = Plugins.find((p) => p.key === 'coding-agent:secret-env-read');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: { excludeStrategies: ['custom-strategy'] },
        delayMs: 0,
      });

      const callArgs = vi.mocked(fetchWithCache).mock.calls[0];
      const requestBody = JSON.parse((callArgs[1] as any).body);
      expect(requestBody.config.excludeStrategies).toEqual([
        ...CANARY_BREAKING_STRATEGY_IDS,
        'custom-strategy',
      ]);
      expect(result?.[0].metadata?.pluginConfig?.excludeStrategies).toEqual([
        ...CANARY_BREAKING_STRATEGY_IDS,
        'custom-strategy',
      ]);
    });

    it.each(['coding-agent:core', 'coding-agent:all'])(
      'should preserve %s canary-breaking strategy exclusions in metadata',
      async (pluginId) => {
        vi.mocked(shouldGenerateRemote).mockReturnValue(true);
        vi.mocked(neverGenerateRemote).mockReturnValue(false);

        const mockResponse = mockFetchResponse([{ vars: { testVar: 'test content' } }]);
        vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

        const plugin = Plugins.find((p) => p.key === pluginId);
        const result = await plugin?.action({
          provider: mockProvider,
          purpose: 'test',
          injectVar: 'testVar',
          n: 1,
          config: { excludeStrategies: ['custom-strategy'] },
          delayMs: 0,
        });

        const callArgs = vi.mocked(fetchWithCache).mock.calls[0];
        const requestBody = JSON.parse((callArgs[1] as any).body);
        expect(requestBody.config.excludeStrategies).toEqual([
          ...CANARY_BREAKING_STRATEGY_IDS,
          'custom-strategy',
        ]);
        expect(result?.[0].metadata?.pluginConfig?.excludeStrategies).toEqual([
          ...CANARY_BREAKING_STRATEGY_IDS,
          'custom-strategy',
        ]);
      },
    );

    it('should handle remote generation errors', async () => {
      // Mock shouldGenerateRemote to return true for this test
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);

      vi.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const plugin = Plugins.find((p) => p.key === 'contracts');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(result).toEqual([]);
    });

    describe('large remote misinformation requests', () => {
      const plugin = Plugins.find((p) => p.key === 'harmful:misinformation-disinformation')!;
      const fetch = vi.mocked(fetchWithCache);
      const requestBodies = () =>
        fetch.mock.calls.map(([, options]) => JSON.parse(options!.body as string));
      const samples = (start: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({ vars: { query: `Sample ${start + i}` } }));
      let params: PluginActionParams;

      beforeEach(() => {
        params = {
          purpose: 'Test catalog',
          injectVar: 'query',
          n: 21,
          delayMs: 0,
          provider: mockProvider,
        };
        // This plugin uses the remote service even when regular plugins run locally.
        vi.mocked(shouldGenerateRemote).mockReturnValue(false);
        vi.mocked(neverGenerateRemote).mockReturnValue(false);
      });

      it('generates 50 cases through a proxy that times out above 20', async () => {
        const cacheKeys: string[] = [];
        let next = 0;
        fetch.mockImplementation(async (_url, options) => {
          const { n } = JSON.parse(options!.body as string);
          if (n > 20) {
            throw new Error('HTTP 524');
          }
          cacheKeys.push(getScopedCacheKey('same-request'));
          const batch = samples(next, n);
          next += n;
          return mockFetchResponse(batch);
        });

        const result = await withCacheNamespace('repeat:1', () =>
          plugin.action({ ...params, n: 50 }),
        );

        expect(requestBodies().map((body) => body.n)).toEqual([20, 20, 10]);
        expect(checkRemoteHealth).toHaveBeenCalledOnce();
        expect(new Set(cacheKeys).size).toBe(3);
        expect(cacheKeys.every((key) => key.startsWith('repeat:1:'))).toBe(true);
        expect(result).toMatchObject(samples(0, 50));
        expect(
          result.every((test) => test.assert?.[0].type === `promptfoo:redteam:${plugin.key}`),
        ).toBe(true);
      });

      it('respects explicitly disabled remote generation', async () => {
        vi.mocked(neverGenerateRemote).mockReturnValue(true);
        expect(await plugin.action(params)).toEqual([]);
        expect(checkRemoteHealth).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
      });

      it('tops up short responses with fresh prompts and retains the first copy with its metadata', async () => {
        const first = { vars: { query: 'Sample 0' }, metadata: { source: 'first' } };
        const duplicate = { vars: { query: ' Sample 0 ' }, metadata: { source: 'duplicate' } };
        fetch
          .mockResolvedValueOnce(mockFetchResponse([first, ...samples(1, 18), duplicate]))
          .mockResolvedValueOnce(mockFetchResponse([duplicate]))
          .mockResolvedValueOnce(mockFetchResponse(samples(19, 3)));

        const result = await plugin.action({ ...params, config: { language: 'en' } });

        expect(requestBodies().map((body) => body.n)).toEqual([20, 2, 2]);
        expect(fetch.mock.calls.map((call) => call[4])).toEqual([false, true, true]);
        expect(result).toMatchObject(samples(0, 21));
        expect(result[0].metadata).toMatchObject({
          source: 'first',
          pluginConfig: { language: 'en' },
        });
      });

      it('counts batches without token usage and skips coalesced requests', async () => {
        const firstBatch = createMockFetchResponse({
          result: samples(0, 20),
          tokenUsage: { total: 10, numRequests: 1 },
        });
        const lastBatch = mockFetchResponse(samples(20, 1));
        fetch
          .mockResolvedValueOnce(firstBatch)
          .mockResolvedValueOnce({ ...firstBatch, coalesced: true })
          .mockResolvedValueOnce(lastBatch)
          .mockResolvedValueOnce({ ...lastBatch, cached: true });
        const usage = {};
        const request = { ...params, provider: trackGenerationTokenUsage(mockProvider, usage) };
        const results = await Promise.all([plugin.action(request), plugin.action(request)]);

        expect(results.map((cases) => cases.length)).toEqual([21, 21]);
        expect(usage).toMatchObject({
          total: 10,
          numRequests: 3,
          incurredTokenUsage: { total: 10, numRequests: 2 },
        });
      });

      it('stops after two top-ups when every response repeats the same prompt', async () => {
        fetch.mockResolvedValue(mockFetchResponse(samples(0, 1)));
        const errorLog = vi.spyOn(logger, 'error');
        const result = await plugin.action(params);

        expect(fetch).toHaveBeenCalledTimes(4);
        expect(result).toHaveLength(1);
        expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/1 of 21.*too few distinct/i));
      });

      it('keeps previous batches after a proxy error without retrying the failed POST', async () => {
        fetch
          .mockResolvedValueOnce(
            mockFetchResponse([...samples(0, 19), { vars: { query: 'x'.repeat(30) } }]),
          )
          .mockResolvedValueOnce(
            createMockFetchResponse({}, { status: 524, statusText: 'timeout' }),
          );
        const errorLog = vi.spyOn(logger, 'error');
        const result = await plugin.action({ ...params, config: { maxCharsPerMessage: 10 } });

        expect(result).toMatchObject(samples(0, 19));
        expect(fetch.mock.calls.map((call) => call[5])).toEqual([0, 0]);
        expect(checkRemoteHealth).toHaveBeenCalledOnce();
        const retry = requestBodies()[1];
        expect(retry.n).toBe(2);
        expect(retry.config.modifiers.__maxCharsPerMessageRetry).toContain('10-character limit');
        expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/19 of 21.*524/i));
      });

      it.each([
        [plugin.key, { inputs: { query: 'A catalog request' } }],
        ['ssrf', {}],
      ] as const)('preserves the full request for %s with config %o', async (key, config) => {
        fetch.mockResolvedValue(mockFetchResponse(samples(0, 1)));
        await Plugins.find((p) => p.key === key)!.action({ ...params, config });

        expect(requestBodies()).toMatchObject([{ n: 21 }]);
      });
    });

    it('should add harmful assertions for harmful remote plugins', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      const mockResponse: FetchWithCacheResult<unknown> = createMockFetchResponse({
        result: [
          {
            vars: { testVar: 'test content' },
            metadata: { harmCategory: 'Misinformation/Disinformation' },
          },
        ],
      });
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const plugin = Plugins.find((p) => p.key === 'harmful:misinformation-disinformation');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(result).toHaveLength(1);
      expect(result![0].assert).toBeDefined();
      expect(result![0].assert).toEqual([
        {
          metric: 'Misinformation & Disinformation - Harmful lies and propaganda',
          type: 'promptfoo:redteam:harmful:misinformation-disinformation',
        },
      ]);
    });

    it('should not modify assertions for non-harmful remote plugins', async () => {
      vi.mocked(neverGenerateRemote).mockReturnValue(false);
      const originalTestCase = {
        assert: [
          {
            type: 'test',
            metric: 'Original',
          },
        ],
        vars: {
          testVar: 'test content',
        },
        metadata: {
          pluginId: 'ssrf',
        },
      };

      const mockResponse = mockFetchResponse([originalTestCase]);
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const plugin = Plugins.find((p) => p.key === 'ssrf');
      const result = await plugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        config: {},
        delayMs: 0,
      });

      expect(result).toHaveLength(1);
      expect(result?.[0]).toEqual({
        ...originalTestCase,
        metadata: { ...originalTestCase.metadata, pluginConfig: { modifiers: {} } },
      });
    });
  });

  describe('unaligned harm plugins', () => {
    it('should require remote generation', async () => {
      vi.mocked(shouldGenerateRemote).mockReturnValue(false);
      vi.mocked(neverGenerateRemote).mockReturnValue(true);
      const unalignedPlugin = Plugins.find(
        (p) => p.key === Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0],
      );
      const result = await unalignedPlugin?.action({
        provider: mockProvider,
        purpose: 'test',
        injectVar: 'testVar',
        n: 1,
        delayMs: 0,
      });
      expect(result).toEqual([]);
    });
  });

  describe('plugin metadata', () => {
    let remoteTestCases: TestCase[];

    beforeEach(() => {
      // Setup mock response for remote tests
      remoteTestCases = [
        {
          vars: { testVar: 'test content' },
          metadata: { pluginId: 'remote-test-plugin' },
        },
      ];
      vi.mocked(fetchWithCache).mockResolvedValue(mockFetchResponse(remoteTestCases));

      // Mock callApi to return a test response
      vi.spyOn(mockProvider, 'callApi').mockResolvedValue({
        output: 'Test response for plugin test',
        error: undefined,
      });
    });

    it('should correctly format pluginId using getShortPluginId', () => {
      // Test with different types of plugin IDs
      const testCases = [
        // Simple plugin IDs
        { input: 'contracts', expected: 'contracts' },
        { input: 'excessive-agency', expected: 'excessive-agency' },
        { input: 'hallucination', expected: 'hallucination' },

        // IDs with colon
        { input: 'harmful:privacy', expected: 'harmful:privacy' },
        { input: 'harmful:hate', expected: 'harmful:hate' },
        { input: 'pii:direct', expected: 'pii:direct' },

        // IDs with prefixes
        { input: 'promptfoo:redteam:contracts', expected: 'contracts' },
        { input: 'promptfoo:redteam:harmful:privacy', expected: 'harmful:privacy' },
        { input: 'promptfoo:redteam:pii:direct', expected: 'pii:direct' },
      ];

      // Test each case
      testCases.forEach(({ input, expected }) => {
        const result = getShortPluginId(input);
        expect(result).toBe(expected);
      });
    });

    // Simplified test just to verify plugins output
    it('should verify plugins exist', () => {
      // Check for common plugins
      const plugins = ['contracts', 'excessive-agency', 'prompt-extraction', 'pii:direct'];

      plugins.forEach((key) => {
        const plugin = Plugins.find((p) => p.key === key);
        expect(plugin).toBeDefined();
      });
    });
  });

  describe('plugin registry completeness', () => {
    it('should have all plugins from constants registered', () => {
      // Get all the plugin keys that should be registered
      const expectedPlugins = [
        ...BASE_PLUGINS,
        ...Object.keys(HARM_PLUGINS),
        ...PII_PLUGINS,
        ...ADDITIONAL_PLUGINS,
      ];

      // Verify all expected plugin keys are present in the registry
      // Note: We don't expect exact equality because some plugins like collections may not be in the expected list
      const registeredPluginKeys = Plugins.map((p) => p.key);
      expect(registeredPluginKeys).toEqual(expect.arrayContaining(expectedPlugins));
    });

    it('should have unique plugin keys', () => {
      // Check that there are no duplicate plugin keys
      const pluginKeys = Plugins.map((p) => p.key);
      const uniqueKeys = new Set(pluginKeys);

      expect(pluginKeys).toHaveLength(uniqueKeys.size);

      // Cross-check with ALL_PLUGINS
      ALL_PLUGINS.forEach((pluginKey) => {
        const matchingPlugins = Plugins.filter((p) => p.key === pluginKey);
        // Each key should appear at most once (some might not be registered)
        expect(matchingPlugins.length).toBeLessThanOrEqual(1);
      });
    });
  });
});
