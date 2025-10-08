import { SingleBar } from 'cli-progress';
import { fetchWithCache } from '../../../src/cache';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addCompositeTestCases } from '../../../src/redteam/strategies/singleTurnComposite';

import type { TestCase } from '../../../src/types';

jest.mock('cli-progress');
jest.mock('../../../src/cache');
jest.mock('../../../src/globalConfig/accounts');
jest.mock('../../../src/redteam/remoteGeneration');

describe('composite jailbreak strategy', () => {
  let mockProgressBar: jest.Mocked<SingleBar>;

  beforeEach(() => {
    jest.resetAllMocks();
    mockProgressBar = {
      start: jest.fn(),
      increment: jest.fn(),
      stop: jest.fn(),
    } as unknown as jest.Mocked<SingleBar>;
    jest.mocked(SingleBar).mockReturnValue(mockProgressBar);
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');
    jest.mocked(getRemoteGenerationUrl).mockReturnValue('http://test.com');
    jest.mocked(neverGenerateRemote).mockReturnValue(false);
  });

  const testCases: TestCase[] = [
    {
      vars: {
        prompt: 'test prompt 1',
      },
      assert: [
        {
          type: 'equals',
          value: 'expected',
          metric: 'test-metric',
        },
      ],
    },
    {
      vars: {
        prompt: 'test prompt 2',
      },
      assert: [
        {
          type: 'contains',
          value: 'test',
          metric: 'another-metric',
        },
      ],
    },
  ];

  describe('basic functionality', () => {
    it('should generate composite test cases with default n=5', async () => {
      const mockResponse = {
        data: {
          modifiedPrompts: [
            'composite variation 1',
            'composite variation 2',
            'composite variation 3',
            'composite variation 4',
            'composite variation 5',
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const result = await addCompositeTestCases(testCases.slice(0, 1), 'prompt', {});

      // Should generate 5 variations for 1 test case
      expect(result).toHaveLength(5);
      expect(result[0]?.vars?.prompt).toBe('composite variation 1');
      expect(result[0]?.metadata?.strategyId).toBe('jailbreak:composite');
      expect(result[0]?.metadata?.originalText).toBe('test prompt 1');
      expect(result[0]?.assert?.[0].metric).toBe('test-metric/Composite');
    });

    it('should use custom n value when provided', async () => {
      const mockResponse = {
        data: {
          modifiedPrompts: ['variation 1', 'variation 2', 'variation 3'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const result = await addCompositeTestCases(testCases.slice(0, 1), 'prompt', { n: 3 });

      // Should generate 3 variations when n=3
      expect(result).toHaveLength(3);

      // Verify the API was called with n=3
      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://test.com',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"n":3'),
        },
        expect.any(Number),
      );
    });

    it('should process multiple test cases correctly', async () => {
      // Mock different responses for each test case
      jest.mocked(fetchWithCache)
        .mockResolvedValueOnce({
          data: {
            modifiedPrompts: ['case1-var1', 'case1-var2'],
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        })
        .mockResolvedValueOnce({
          data: {
            modifiedPrompts: ['case2-var1', 'case2-var2'],
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

      const result = await addCompositeTestCases(testCases, 'prompt', { n: 2 });

      // Should generate 2 variations for each of 2 test cases = 4 total
      expect(result).toHaveLength(4);
      expect(result[0]?.vars?.prompt).toBe('case1-var1');
      expect(result[1]?.vars?.prompt).toBe('case1-var2');
      expect(result[2]?.vars?.prompt).toBe('case2-var1');
      expect(result[3]?.vars?.prompt).toBe('case2-var2');
    });

    it('should handle large n values correctly', async () => {
      const largeN = 100;
      const modifiedPrompts = Array.from({ length: largeN }, (_, i) => `variation ${i + 1}`);

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { modifiedPrompts },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCases.slice(0, 1), 'prompt', { n: largeN });

      expect(result).toHaveLength(largeN);
      expect(result[99]?.vars?.prompt).toBe('variation 100');
    });
  });

  describe('model family configuration', () => {
    it('should pass modelFamily when configured', async () => {
      const mockResponse = {
        data: {
          modifiedPrompts: ['variation 1'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      await addCompositeTestCases(testCases.slice(0, 1), 'prompt', {
        n: 1,
        modelFamily: 'claude'
      });

      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://test.com',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"modelFamily":"claude"'),
        },
        expect.any(Number),
      );
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockResponse = {
        data: {
          error: 'API error',
        },
        cached: false,
        status: 500,
        statusText: 'Error',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const result = await addCompositeTestCases(testCases, 'prompt', {});

      expect(result).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith(
        '[jailbreak:composite] Error in composite generation: API error}',
      );
    });

    it('should throw error when remote generation is disabled', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(true);

      await expect(addCompositeTestCases(testCases, 'prompt', {})).rejects.toThrow(
        'Composite jailbreak strategy requires remote generation to be enabled',
      );
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      jest.mocked(fetchWithCache).mockRejectedValue(networkError);

      const result = await addCompositeTestCases(testCases, 'prompt', {});

      expect(result).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith(`Error in composite generation: ${networkError}`);
    });

    it('should handle empty test cases', async () => {
      const result = await addCompositeTestCases([], 'prompt', {});

      expect(result).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith('No composite  jailbreak test cases were generated');
    });

    it('should handle test cases without vars', async () => {
      const invalidTestCases: TestCase[] = [
        {
          // Missing vars
          assert: [{ type: 'equals', value: 'test' }],
        },
      ];

      const mockResponse = {
        data: {
          modifiedPrompts: ['variation 1'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      // The invariant check will throw an error
      const result = await addCompositeTestCases(invalidTestCases, 'prompt', {});

      // Due to the try-catch in generateCompositePrompts, it returns empty array on error
      expect(result).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle partial failures in batch processing', async () => {
      // First call succeeds, second call fails
      jest.mocked(fetchWithCache)
        .mockResolvedValueOnce({
          data: {
            modifiedPrompts: ['success-variation'],
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        })
        .mockResolvedValueOnce({
          data: {
            error: 'Partial failure',
          },
          cached: false,
          status: 500,
          statusText: 'Error',
        });

      const result = await addCompositeTestCases(testCases, 'prompt', { n: 1 });

      // Should return only the successful variations
      expect(result).toHaveLength(1);
      expect(result[0]?.vars?.prompt).toBe('success-variation');
      expect(logger.error).toHaveBeenCalledWith(
        '[jailbreak:composite] Error in composite generation: Partial failure}',
      );
    });
  });

  describe('metadata preservation', () => {
    it('should preserve existing metadata', async () => {
      const testCasesWithMetadata: TestCase[] = [
        {
          vars: { prompt: 'test' },
          metadata: {
            existingKey: 'existingValue',
            pluginId: 'harmful:hate',
          },
        },
      ];

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: ['variation'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCasesWithMetadata, 'prompt', {});

      expect(result[0]?.metadata).toEqual({
        existingKey: 'existingValue',
        pluginId: 'harmful:hate',
        strategyId: 'jailbreak:composite',
        originalText: 'test',
      });
    });

    it('should preserve other vars besides the inject var', async () => {
      const testCasesWithMultipleVars: TestCase[] = [
        {
          vars: {
            prompt: 'test prompt',
            context: 'additional context',
            id: '123',
          },
        },
      ];

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: ['modified prompt'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCasesWithMultipleVars, 'prompt', {});

      expect(result[0]?.vars).toEqual({
        prompt: 'modified prompt',
        context: 'additional context',
        id: '123',
      });
    });
  });

  describe('progress bar handling', () => {
    it('should show progress bar when not in debug mode', async () => {
      // Mock logger.level to not be 'debug'
      Object.defineProperty(logger, 'level', {
        get: jest.fn(() => 'info'),
        configurable: true,
      });

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: ['variation'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await addCompositeTestCases(testCases.slice(0, 1), 'prompt', {});

      expect(mockProgressBar.start).toHaveBeenCalledWith(1, 0);
      expect(mockProgressBar.increment).toHaveBeenCalledWith(1);
      expect(mockProgressBar.stop).toHaveBeenCalled();
    });

    it('should not show progress bar in debug mode', async () => {
      // Mock logger.level to be 'debug'
      Object.defineProperty(logger, 'level', {
        get: jest.fn(() => 'debug'),
        configurable: true,
      });

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: ['variation'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await addCompositeTestCases(testCases.slice(0, 1), 'prompt', {});

      expect(mockProgressBar.start).not.toHaveBeenCalled();
      expect(mockProgressBar.increment).not.toHaveBeenCalled();
      expect(mockProgressBar.stop).not.toHaveBeenCalled();
    });
  });

  describe('payload construction', () => {
    it('should include all required fields in API payload', async () => {
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: ['variation'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await addCompositeTestCases(testCases.slice(0, 1), 'prompt', {});

      const expectedPayload = JSON.stringify({
        task: 'jailbreak:composite',
        prompt: 'test prompt 1',
        email: 'test@example.com',
      });

      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://test.com',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expectedPayload,
        },
        expect.any(Number),
      );
    });

    it('should handle different inject variable names', async () => {
      const customVarTestCases: TestCase[] = [
        {
          vars: {
            userInput: 'custom var content',
          },
        },
      ];

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: ['modified content'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(customVarTestCases, 'userInput', {});

      expect(result[0]?.vars?.userInput).toBe('modified content');
      expect(result[0]?.metadata?.originalText).toBe('custom var content');

      const expectedPayload = expect.stringContaining('"prompt":"custom var content"');
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expectedPayload,
        }),
        expect.any(Number),
      );
    });
  });

  describe('assertion transformation', () => {
    it('should transform assertion metrics correctly', async () => {
      const testCasesWithAssertions: TestCase[] = [
        {
          vars: { prompt: 'test' },
          assert: [
            { type: 'equals', value: 'expected', metric: 'base-metric' },
            { type: 'contains', value: 'substring', metric: 'another-metric' },
            { type: 'javascript', value: 'output.length > 10' }, // No metric
          ],
        },
      ];

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: ['variation'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCasesWithAssertions, 'prompt', {});

      expect(result[0]?.assert).toEqual([
        { type: 'equals', value: 'expected', metric: 'base-metric/Composite' },
        { type: 'contains', value: 'substring', metric: 'another-metric/Composite' },
        { type: 'javascript', value: 'output.length > 10', metric: 'undefined/Composite' },
      ]);
    });

    it('should handle test cases without assertions', async () => {
      const testCasesNoAssertions: TestCase[] = [
        {
          vars: { prompt: 'test' },
          // No assert field
        },
      ];

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          modifiedPrompts: ['variation'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await addCompositeTestCases(testCasesNoAssertions, 'prompt', {});

      expect(result[0]?.assert).toBeUndefined();
    });
  });
});