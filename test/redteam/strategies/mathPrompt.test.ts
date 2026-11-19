import { SingleBar } from 'cli-progress';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { trackGenerationTokenUsage } from '../../../src/redteam/generationTokenUsage';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import * as remoteGeneration from '../../../src/redteam/remoteGeneration';
import {
  addMathPrompt,
  DEFAULT_MATH_CONCEPTS,
  EXAMPLES,
  encodeMathPrompt,
  generateMathPrompt,
} from '../../../src/redteam/strategies/mathPrompt';
import * as http from '../../../src/util/fetch/index';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

function createMathProgressBar() {
  return {
    start: vi.fn(),
    increment: vi.fn(),
    stop: vi.fn(),
  } as unknown as SingleBar;
}

vi.mock('cli-progress');
vi.mock('../../../src/redteam/providers/shared');
vi.mock(import('../../../src/cache'), async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../../src/redteam/remoteGeneration');

describe('mathPrompt', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe('generateMathPrompt', () => {
    it('should generate math prompts remotely', async () => {
      const mockProgressBar = {
        start: vi.fn(),
        increment: vi.fn(),
        stop: vi.fn(),
        render: vi.fn(),
        update: vi.fn(),
        isActive: vi.fn(),
        getProgress: vi.fn(),
      } as unknown as SingleBar;

      (SingleBar as any).mockImplementation(function () {
        return mockProgressBar;
      });

      const mockTestCases = [{ vars: { prompt: 'test1' } }, { vars: { prompt: 'test2' } }];
      const mockResult = [{ vars: { prompt: 'encoded1' } }, { vars: { prompt: 'encoded2' } }];

      const mockResponse = {
        data: {
          result: mockResult,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
        deleteFromCache: async () => {},
      };

      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse as any);
      const result = await generateMathPrompt(mockTestCases as any, 'prompt', {
        targetId: 'cloud-target-123',
      });

      expect(result).toEqual(mockResult);
      expect(mockProgressBar.start).toHaveBeenCalledWith(1, 0);
      expect(mockProgressBar.increment).toHaveBeenCalledWith(1);
      expect(mockProgressBar.stop).toHaveBeenCalledWith();
      const requestBody = vi.mocked(fetchWithCache).mock.calls[0]?.[1]?.body;
      expect(requestBody).toBeTypeOf('string');
      expect(JSON.parse(requestBody as string)).toMatchObject({
        targetId: 'cloud-target-123',
      });
    });

    it('sends only the remote math contract', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        cached: false,
        status: 200,
        statusText: 'OK',
        data: { result: [{ vars: { prompt: 'encoded' } }] },
      });

      await generateMathPrompt([{ vars: { prompt: 'test' } }] as any, 'prompt', {
        mathConcepts: ['topology'],
        targetId: 'cloud-target-123',
        env: { CANARY: 'env-secret' },
        apiKey: 'config-secret',
        headers: { Authorization: 'Bearer header-secret' },
      });

      const body = vi.mocked(fetchWithCache).mock.calls[0]?.[1]?.body;
      expect(body).toBeTypeOf('string');
      expect(JSON.parse(body as string)).toMatchObject({
        task: 'math-prompt',
        injectVar: 'prompt',
        config: { mathConcepts: ['topology'] },
        targetId: 'cloud-target-123',
      });
      expect(body).not.toContain('env-secret');
      expect(body).not.toContain('config-secret');
      expect(body).not.toContain('header-secret');
    });

    it('propagates the remote failure and stops the progress bar', async () => {
      const error = new Error('Network error');
      const progressBar = createMathProgressBar();
      vi.mocked(fetchWithCache).mockRejectedValueOnce(error);
      vi.mocked(SingleBar).mockImplementation(function () {
        return progressBar;
      });

      await expect(generateMathPrompt([{ vars: { prompt: 'test' } }], 'prompt', {})).rejects.toBe(
        error,
      );
      expect(progressBar.stop).toHaveBeenCalledOnce();
    });
  });

  describe('encodeMathPrompt', () => {
    it('should encode text using math concepts', async () => {
      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'encoded math text' }),
        }),
      });

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);

      const result = await encodeMathPrompt('test text', 'set theory');

      expect(result).toContain('encoded math text');
      expect(result).toContain('Also provide a complete translation');
    });

    it('should handle JSON parsing errors', async () => {
      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({ output: 'invalid json' }),
      });

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);

      await expect(encodeMathPrompt('test text', 'set theory')).rejects.toThrow(
        'Expected a JSON object',
      );
    });
  });

  describe('addMathPrompt', () => {
    it.each([
      { status: 524, message: 'Remote MathPrompt generation failed (HTTP 524).' },
      { status: 200, message: 'Remote MathPrompt generation returned invalid JSON (HTTP 200).' },
    ])(
      'reports HTTP $status for an HTML response when the local fallback has no API key',
      async ({ status, message }) => {
        const cache =
          await vi.importActual<typeof import('../../../src/cache')>('../../../src/cache');
        vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
        vi.mocked(remoteGeneration.getRemoteGenerationUrl).mockReturnValue(
          'https://example.test/task',
        );
        vi.mocked(fetchWithCache).mockImplementationOnce(cache.fetchWithCache);
        vi.spyOn(http, 'fetchWithRetries').mockResolvedValueOnce(
          new Response('<html>private upstream details</html>', { status }),
        );
        vi.mocked(redteamProviderManager.getProvider).mockRejectedValueOnce(
          new Error('OpenAI API key is not set'),
        );

        await expect(
          cache.withCacheEnabled(false, () =>
            addMathPrompt([{ vars: { prompt: 'hello' } }], 'prompt', {
              mathConcepts: ['topology'],
            }),
          ),
        ).rejects.toMatchObject({ message });
        expect(redteamProviderManager.getProvider).toHaveBeenCalledOnce();
      },
    );

    it.each([
      { status: 503, data: { result: [] }, message: 'HTTP 503' },
      { status: 200, data: { result: {} }, message: 'expected an array of test cases' },
      { status: 200, data: {}, message: 'expected an array of test cases' },
    ])(
      'reports the remote failure for HTTP $status with $data',
      async ({ status, data, message }) => {
        vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
        vi.mocked(fetchWithCache).mockResolvedValueOnce({
          cached: false,
          status,
          statusText: '',
          data,
        });
        vi.mocked(redteamProviderManager.getProvider).mockRejectedValueOnce(
          new Error('No local key'),
        );

        await expect(addMathPrompt([{ vars: { prompt: 'hello' } }], 'prompt', {})).rejects.toThrow(
          message,
        );
      },
    );

    it.each([200, 503])('uses local results after HTTP %i with no remote cases', async (status) => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        cached: false,
        status,
        statusText: '',
        data: { result: [] },
      });
      const provider = createMockProvider({
        response: createProviderResponse({ output: JSON.stringify({ encodedPrompt: 'local' }) }),
      });
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValueOnce(provider);

      const result = await addMathPrompt([{ vars: { prompt: 'hello' } }], 'prompt', {
        mathConcepts: ['topology'],
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.vars?.prompt).toContain('local');
      expect(provider.callApi).toHaveBeenCalledOnce();
    });

    it('preserves errors from the explicitly selected local provider', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
      const provider = createMockProvider();
      const error = new Error('Local provider unavailable');
      vi.mocked(provider.callApi).mockRejectedValueOnce(error);

      await expect(
        addMathPrompt(
          [{ vars: { prompt: 'hello' } }],
          'prompt',
          {},
          {
            generationProviderSelection: { source: 'explicit', provider },
          },
        ),
      ).rejects.toBe(error);
      expect(fetchWithCache).not.toHaveBeenCalled();
    });

    it('should use custom math concepts when provided', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(false);
      const customConcepts = ['topology', 'calculus'];

      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'encoded' }),
        }),
      });

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);
      (SingleBar as any).mockImplementation(createMathProgressBar);

      const result = await addMathPrompt([{ vars: { prompt: 'test' } }] as any, 'prompt', {
        mathConcepts: customConcepts,
      });

      expect(result).toHaveLength(customConcepts.length);
    });

    it('routes locally loaded providers through the generation usage wrapper', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(false);
      const loadedProvider = createMockProvider({
        id: 'loaded',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'untracked' }),
        }),
      });
      const trackedProvider = createMockProvider({
        id: 'tracked',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'tracked' }),
        }),
      });
      const wrapGenerationProvider = vi.fn().mockReturnValue(trackedProvider);

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(loadedProvider);

      const result = await addMathPrompt(
        [{ vars: { prompt: 'test' } }] as any,
        'prompt',
        {
          mathConcepts: ['topology'],
        },
        {
          wrapGenerationProvider,
        },
      );

      expect(wrapGenerationProvider).toHaveBeenCalledWith(loadedProvider);
      expect(trackedProvider.callApi).toHaveBeenCalledTimes(1);
      expect(String(result[0]?.vars?.prompt)).toContain('tracked');
    });

    it('keeps the JSON-only small-model variant for the built-in default path', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(false);
      const defaultProvider = createMockProvider({
        id: 'default-json-small',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'default-specialized' }),
        }),
      });
      vi.mocked(redteamProviderManager.getDefaultProvider).mockResolvedValue(defaultProvider);

      const result = await addMathPrompt(
        [{ vars: { prompt: 'test' } }] as any,
        'prompt',
        { mathConcepts: ['topology'] },
        {
          generationProviderSelection: {
            provider: createMockProvider({ id: 'default-regular' }),
            source: 'default',
          },
        },
      );

      expect(redteamProviderManager.getDefaultProvider).toHaveBeenCalledWith({
        jsonOnly: true,
        preferSmallModel: true,
      });
      expect(defaultProvider.callApi).toHaveBeenCalledTimes(1);
      expect(String(result[0]?.vars?.prompt)).toContain('default-specialized');
    });

    it('keeps remote generation enabled for the built-in default selection', async () => {
      const generationTokenUsage = {};
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(fetchWithCache).mockResolvedValue({
        cached: false,
        status: 200,
        statusText: 'OK',
        data: {
          result: [{ vars: { prompt: 'remote-default' } }],
          tokenUsage: { total: 45, prompt: 30, completion: 15, numRequests: 3 },
        },
      });

      const result = await addMathPrompt(
        [{ vars: { prompt: 'test' } }] as any,
        'prompt',
        { mathConcepts: ['topology'] },
        {
          generationProviderSelection: {
            provider: trackGenerationTokenUsage(
              createMockProvider({ id: 'default-regular' }),
              generationTokenUsage,
            ),
            source: 'default',
          },
        },
      );

      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      expect(redteamProviderManager.getDefaultProvider).not.toHaveBeenCalled();
      expect(result[0]?.vars?.prompt).toBe('remote-default');
      expect(generationTokenUsage).toMatchObject({
        total: 45,
        prompt: 30,
        completion: 15,
        numRequests: 3,
      });
    });

    it('uses the request-scoped generation provider for local encoding', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(false);
      const requestProvider = createMockProvider({
        id: 'request-provider',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'request-scoped' }),
        }),
      });

      const result = await addMathPrompt(
        [{ vars: { prompt: 'test' } }] as any,
        'prompt',
        {
          mathConcepts: ['topology'],
        },
        {
          generationProviderSelection: {
            provider: requestProvider,
            source: 'explicit',
          },
        },
      );

      expect(redteamProviderManager.getProvider).not.toHaveBeenCalled();
      expect(requestProvider.callApi).toHaveBeenCalledTimes(1);
      expect(String(result[0]?.vars?.prompt)).toContain('request-scoped');
    });

    it('keeps explicit providers local instead of sending them to remote generation', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
      const requestProvider = createMockProvider({
        id: 'anthropic:claude-sonnet-4-20250514',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'local-explicit' }),
        }),
      });
      Object.assign(requestProvider, { apiKey: 'resolved-secret' });
      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(requestProvider);
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { result: [{ vars: { prompt: 'remote-encoded' } }] },
      } as any);
      (SingleBar as any).mockImplementation(createMathProgressBar);

      await addMathPrompt(
        [{ vars: { prompt: 'test' } }] as any,
        'prompt',
        {
          mathConcepts: ['topology'],
          env: { CANARY: 'env-secret' },
          apiKey: 'config-secret',
          headers: { Authorization: 'Bearer header-secret' },
        },
        {
          generationProviderSelection: {
            provider: requestProvider as any,
            source: 'explicit',
            localProviderSpec: 'anthropic:claude-sonnet-4-20250514',
            persistableId: 'anthropic:claude-sonnet-4-20250514',
          },
        },
      );

      expect(fetchWithCache).not.toHaveBeenCalled();
      expect(redteamProviderManager.getProvider).toHaveBeenCalledWith({
        provider: 'anthropic:claude-sonnet-4-20250514',
        jsonOnly: true,
        preferSmallModel: true,
      });
      expect(requestProvider.callApi).toHaveBeenCalledTimes(1);
    });

    it('stays local when a runtime provider has no serializable spec', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
      const requestProvider = createMockProvider({
        id: 'runtime-only',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'local-runtime' }),
        }),
      });

      const result = await addMathPrompt(
        [{ vars: { prompt: 'test' } }] as any,
        'prompt',
        { mathConcepts: ['topology'] },
        {
          generationProviderSelection: {
            provider: requestProvider,
            source: 'explicit',
          },
        },
      );

      expect(fetchWithCache).not.toHaveBeenCalled();
      expect(requestProvider.callApi).toHaveBeenCalledTimes(1);
      expect(String(result[0]?.vars?.prompt)).toContain('local-runtime');
    });

    it('should validate mathConcepts config', async () => {
      await expect(addMathPrompt([], 'prompt', { mathConcepts: 'invalid' })).rejects.toThrow(
        'MathPrompt strategy: `mathConcepts` must be an array of strings',
      );
    });
  });

  describe('constants', () => {
    it('should expose DEFAULT_MATH_CONCEPTS', () => {
      expect(DEFAULT_MATH_CONCEPTS).toEqual(['set theory', 'group theory', 'abstract algebra']);
    });

    it('should expose EXAMPLES', () => {
      expect(EXAMPLES).toHaveLength(3);
      expect(EXAMPLES[0]).toContain('Let A represent a set');
    });
  });
});
