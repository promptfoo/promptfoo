import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeCoverage,
  extractRequirements,
} from '../../../src/generation/assertions/coverageAnalyzer';

import type { Requirement } from '../../../src/generation/types';
import type { ApiProvider, Assertion } from '../../../src/types';

vi.mock('../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    level: 'info',
    child: vi.fn().mockReturnValue({}),
  },
}));

describe('coverageAnalyzer', () => {
  let mockProvider: ApiProvider;
  let mockCallApi: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockCallApi = vi.fn();
    mockProvider = {
      id: () => 'mock-provider',
      callApi: mockCallApi,
    } as unknown as ApiProvider;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('extractRequirements', () => {
    it('should extract requirements from prompts', async () => {
      const mockResponse = {
        output: JSON.stringify({
          requirements: [
            {
              id: 'req-1',
              description: 'Response should be helpful',
              source: 'explicit',
              testability: 'subjective',
              priority: 'high',
              category: 'behavior',
            },
            {
              id: 'req-2',
              description: 'Response should be in English',
              source: 'implied',
              testability: 'objective',
              priority: 'medium',
              category: 'format',
            },
          ],
        }),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const prompts = ['You are a helpful assistant. Please help the user with their query.'];
      const result = await extractRequirements(prompts, mockProvider);

      expect(result).toHaveLength(2);
      expect(result[0].description).toBe('Response should be helpful');
      expect(result[0].id).toBe('req-1');
      expect(result[0].source).toBe('explicit');
      expect(mockCallApi).toHaveBeenCalled();
    });

    it('should throw error for empty prompts array', async () => {
      const prompts: string[] = [];
      await expect(extractRequirements(prompts, mockProvider)).rejects.toThrow(
        'At least one prompt is required for requirements extraction',
      );
      expect(mockCallApi).not.toHaveBeenCalled();
    });

    it('should handle provider error', async () => {
      mockCallApi.mockRejectedValue(new Error('API error'));

      const prompts = ['Test prompt'];
      await expect(extractRequirements(prompts, mockProvider)).rejects.toThrow('API error');
    });

    it('should skip invalid requirements in response', async () => {
      const mockResponse = {
        output: JSON.stringify({
          requirements: [
            {
              id: 'req-1',
              description: 'Valid requirement',
              source: 'explicit',
              testability: 'objective',
            },
            {
              // Missing required fields
              description: 'Invalid requirement',
            },
            {
              id: 'req-3',
              description: 'Another valid one',
              source: 'implied',
              testability: 'subjective',
            },
          ],
        }),
      };
      mockCallApi.mockResolvedValue(mockResponse);

      const prompts = ['Test prompt'];
      const result = await extractRequirements(prompts, mockProvider);

      // Should only have the 2 valid requirements
      expect(result).toHaveLength(2);
    });
  });

  describe('analyzeCoverage', () => {
    it('should analyze coverage of assertions against requirements', async () => {
      const requirements: Requirement[] = [
        {
          id: 'req-1',
          description: 'Response should be polite and respectful',
          source: 'explicit',
          testability: 'subjective',
          category: 'behavior',
        },
        {
          id: 'req-2',
          description: 'Response should be accurate and factual',
          source: 'explicit',
          testability: 'objective',
          category: 'content',
        },
      ];

      const assertions: Assertion[] = [
        { type: 'pi', value: 'Is the response polite and respectful?' },
        { type: 'contains', value: 'hello' },
      ];

      const result = await analyzeCoverage(requirements, assertions);

      expect(result).toBeDefined();
      expect(result.requirements).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(1);
    });

    it('should return 0 coverage for empty assertions', async () => {
      const requirements: Requirement[] = [
        {
          id: 'req-1',
          description: 'Response should be helpful',
          source: 'explicit',
          testability: 'subjective',
        },
      ];

      const assertions: Assertion[] = [];

      const result = await analyzeCoverage(requirements, assertions);

      expect(result.overallScore).toBe(0);
      expect(result.gaps).toHaveLength(1);
    });

    it('should return 0 coverage for empty requirements', async () => {
      const requirements: Requirement[] = [];

      const assertions: Assertion[] = [{ type: 'contains', value: 'hello' }];

      const result = await analyzeCoverage(requirements, assertions);

      expect(result.overallScore).toBe(0);
      expect(result.requirements).toHaveLength(0);
    });

    it('should identify gaps in coverage', async () => {
      const requirements: Requirement[] = [
        {
          id: 'req-1',
          description: 'Response must include database connection details',
          source: 'explicit',
          testability: 'objective',
          category: 'content',
        },
        {
          id: 'req-2',
          description: 'Output should handle authentication tokens securely',
          source: 'explicit',
          testability: 'objective',
          category: 'security',
        },
        {
          id: 'req-3',
          description: 'System must process XML payloads correctly',
          source: 'explicit',
          testability: 'objective',
          category: 'format',
        },
      ];

      // Assertions that don't match the requirements (no keyword overlap)
      const assertions: Assertion[] = [{ type: 'contains', value: 'hello world' }];

      const result = await analyzeCoverage(requirements, assertions);

      expect(result.gaps).toBeDefined();
      // Should identify uncovered requirements as gaps (no overlap with hello world)
      expect(result.gaps.length).toBe(3);
    });

    it('should calculate full coverage when assertions match requirements', async () => {
      const requirements: Requirement[] = [
        {
          id: 'req-1',
          description: 'Response must contain greeting word hello',
          source: 'explicit',
          testability: 'objective',
          category: 'content',
        },
      ];

      const assertions: Assertion[] = [
        { type: 'contains', value: 'greeting' },
        { type: 'contains', value: 'hello' },
      ];

      const result = await analyzeCoverage(requirements, assertions);

      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.requirements[0].coverageLevel).not.toBe('none');
    });
  });
});
