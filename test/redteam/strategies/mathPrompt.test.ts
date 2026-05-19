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
      const result = await generateMathPrompt(mockTestCases as any, 'prompt', {});

      expect(result).toEqual(mockResult);
      expect(mockProgressBar.start).toHaveBeenCalledWith(1, 0);
      expect(mockProgressBar.increment).toHaveBeenCalledWith(1);
      expect(mockProgressBar.stop).toHaveBeenCalledWith();
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

      expect(result.encodedPrompt).toContain('encoded math text');
      expect(result.encodedPrompt).toContain('Also provide a complete translation');
      expect(result.tokenUsage).toEqual({
        total: 10,
        prompt: 5,
        completion: 5,
        cached: 0,
        numRequests: 1,
      });
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

    it('should preserve helper usage on JSON parsing errors', async () => {
      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: 'invalid json',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        }),
      });

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);

      await expect(encodeMathPrompt('test text', 'set theory')).rejects.toMatchObject({
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
      });
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
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
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
      expect(result[0]?.metadata?.providerTokenUsage).toEqual({
        total: 10,
        prompt: 5,
        completion: 5,
        numRequests: 1,
      });
    });

    it('should preserve prior generation usage when layered after another strategy', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(false);

      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'encoded' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
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

      const result = await addMathPrompt(
        [
          {
            vars: { prompt: 'test' },
            metadata: {
              providerTokenUsage: { total: 7, prompt: 4, completion: 3, numRequests: 1 },
            },
          },
        ] as any,
        'prompt',
        { mathConcepts: ['topology'] },
      );

      expect(result[0]?.metadata?.providerTokenUsage).toEqual({
        total: 17,
        prompt: 9,
        completion: 8,
        cached: 0,
        numRequests: 2,
      });
    });

    it('should preserve one-row remote failure usage before local fallback', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          error: 'remote parse failed',
          tokenUsage: { total: 7, prompt: 4, completion: 3, numRequests: 1 },
        },
      } as any);

      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'encoded' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
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
        mathConcepts: ['topology'],
      });

      expect(result[0]?.metadata?.providerTokenUsage).toEqual({
        total: 17,
        prompt: 9,
        completion: 8,
        cached: 0,
        numRequests: 2,
      });
    });

    it('should preserve batched remote failure usage exactly once before local fallback', async () => {
      vi.mocked(remoteGeneration.shouldGenerateRemote).mockReturnValue(true);
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          error: 'remote batch parse failed',
          tokenUsage: { total: 11, prompt: 6, completion: 5, numRequests: 1 },
        },
      } as any);

      const mockProvider = createMockProvider({
        id: 'mock',
        response: createProviderResponse({
          output: JSON.stringify({ encodedPrompt: 'encoded' }),
          tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
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

      const result = await addMathPrompt(
        [{ vars: { prompt: 'first' } }, { vars: { prompt: 'second' } }] as any,
        'prompt',
        { mathConcepts: ['topology'] },
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.metadata?.providerTokenUsage).toEqual({
        total: 21,
        prompt: 11,
        completion: 10,
        cached: 0,
        numRequests: 2,
      });
      expect(result[1]?.metadata?.providerTokenUsage).toEqual({
        total: 10,
        prompt: 5,
        completion: 5,
        numRequests: 1,
      });
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
