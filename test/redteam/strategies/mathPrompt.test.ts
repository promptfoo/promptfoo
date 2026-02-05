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

import type { ApiProvider } from '../../../src/types/providers';

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
      const mockProvider: ApiProvider = {
        id: () => 'mock',
        callApi: vi.fn().mockResolvedValue({
          output: JSON.stringify({ encodedPrompt: 'encoded math text' }),
        }),
      } as any;

      vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockProvider);

      const result = await encodeMathPrompt('test text', 'set theory');

      expect(result).toContain('encoded math text');
      expect(result).toContain('Also provide a complete translation');
    });

    it('should handle JSON parsing errors', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'mock',
        callApi: vi.fn().mockResolvedValue({
          output: 'invalid json',
        }),
      } as any;

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

      const mockProvider: ApiProvider = {
        id: () => 'mock',
        callApi: vi.fn().mockResolvedValue({
          output: JSON.stringify({ encodedPrompt: 'encoded' }),
        }),
      } as any;

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
