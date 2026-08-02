import { SingleBar } from 'cli-progress';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import * as remoteGeneration from '../../../src/redteam/remoteGeneration';
import {
  addMathPrompt,
  DEFAULT_MATH_CONCEPTS,
  EXAMPLES,
  encodeMathPrompt,
  generateMathPrompt,
} from '../../../src/redteam/strategies/mathPrompt';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

vi.mock('cli-progress');
vi.mock('../../../src/redteam/providers/shared');
vi.mock('../../../src/cache');
vi.mock('../../../src/redteam/remoteGeneration');

describe('mathPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        data: { result: [{ vars: { prompt: 'encoded' } }] },
      } as any);

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

    it('should handle errors gracefully', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));
      (SingleBar as any).mockImplementation(function () {
        return {
          start: vi.fn(),
          increment: vi.fn(),
          stop: vi.fn(),
        } as unknown as SingleBar;
      });

      const result = await generateMathPrompt([{ vars: { prompt: 'test' } }] as any, 'prompt', {});
      expect(result).toEqual([]);
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
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should use custom math concepts when provided', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockImplementation(function () {
        return false;
      });
      const customConcepts = ['topology', 'calculus'];

      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'encoded' }),
        }),
      });

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);
      (SingleBar as any).mockImplementation(function () {
        return {
          start: vi.fn(),
          increment: vi.fn(),
          stop: vi.fn(),
        } as unknown as SingleBar;
      });

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
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { result: [{ vars: { prompt: 'remote-default' } }] },
      } as any);

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

      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      expect(redteamProviderManager.getDefaultProvider).not.toHaveBeenCalled();
      expect(result[0]?.vars?.prompt).toBe('remote-default');
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
      (SingleBar as any).mockImplementation(function () {
        return {
          start: vi.fn(),
          increment: vi.fn(),
          stop: vi.fn(),
        } as unknown as SingleBar;
      });

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
