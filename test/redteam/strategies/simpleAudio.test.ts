import { SingleBar } from 'cli-progress';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addAudioToBase64, textToAudio } from '../../../src/redteam/strategies/simpleAudio';

import type { TestCase } from '../../../src/types/index';

// Mock the remoteGeneration module
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test.url'),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
  };
});

// Mock the cache module
vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

// Mock cli-progress
vi.mock('cli-progress', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    Presets: {
      shades_classic: {},
    },

    SingleBar: vi.fn().mockImplementation(function () {
      return {
        increment: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }),
  };
});

const originalConsoleLog = console.log;
const mockFetchWithCache = vi.mocked(fetchWithCache);
const mockNeverGenerateRemote = vi.mocked(neverGenerateRemote);

describe('audio strategy', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithCache.mockResolvedValue({
      data: { audioBase64: 'bW9ja2VkLWF1ZGlvLWJhc2U2NC1kYXRh' },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    mockNeverGenerateRemote.mockReturnValue(false);
  });

  afterAll(() => {
    console.log = originalConsoleLog;
  });

  describe('textToAudio', () => {
    it('should convert text to base64 string using remote API', async () => {
      const text = 'Hello, world!';
      const result = await textToAudio(text, 'en');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        }),
        expect.any(Number),
      );
      expect(result).toEqual(
        expect.objectContaining({
          base64: 'bW9ja2VkLWF1ZGlvLWJhc2U2NC1kYXRh',
        }),
      );
    });

    it('should throw an error if remote generation is disabled', async () => {
      mockNeverGenerateRemote.mockReturnValue(true);

      const text = 'This should fail';
      await expect(textToAudio(text, 'en')).rejects.toThrow('Remote generation is disabled');
    });

    it('should throw an error if remote API fails', async () => {
      mockFetchWithCache.mockRejectedValueOnce(new Error('Remote API error'));

      const text = 'Hello, fallback world!';
      await expect(textToAudio(text, 'en')).rejects.toThrow('Failed to generate audio');
    });

    it('should pass language parameter to API', async () => {
      const text = 'Bonjour, monde!';
      await textToAudio(text, 'fr');

      // Verify the correct call was made
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"language":"fr"'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('addAudioToBase64', () => {
    it('should convert test cases with the specified variable', async () => {
      // Setup mock to return a predictable response
      mockFetchWithCache.mockResolvedValue({
        data: { audioBase64: 'bW9ja2VkLWF1ZGlv' },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const testCases: TestCase[] = [
        {
          vars: {
            prompt: 'This is a test prompt',
            other: 'This should not be changed',
          },
        },
      ];

      const result = await addAudioToBase64(testCases, 'prompt');

      expect(result).toHaveLength(1);
      expect(result[0].vars?.prompt).toBe('bW9ja2VkLWF1ZGlv');
      expect(result[0].vars?.other).toBe('This should not be changed');
    });

    it('should throw an error when API is unavailable', async () => {
      mockFetchWithCache.mockRejectedValueOnce(new Error('API unavailable'));

      const testCases: TestCase[] = [
        {
          vars: {
            prompt: 'This should fail',
          },
        },
      ];

      await expect(addAudioToBase64(testCases, 'prompt')).rejects.toThrow(
        'Failed to generate audio',
      );
    });

    it('should preserve harmCategory and modify assertion metrics', async () => {
      const testCase: TestCase = {
        assert: [{ type: 'promptfoo:redteam:harmful' }],
        metadata: {
          harmCategory: 'Illegal Activities',
          otherField: 'value',
        },
        vars: {
          prompt: 'Harmful content',
        },
      };

      const result = await addAudioToBase64([testCase], 'prompt');

      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          harmCategory: 'Illegal Activities',
          otherField: 'value',
          strategyId: 'audio',
          originalText: 'Harmful content',
        }),
      );
      expect(result[0].assert).toEqual([
        {
          metric: 'harmful/Audio-Encoded',
          type: 'promptfoo:redteam:harmful',
        },
      ]);
    });

    it('should handle test cases without metadata or assertions', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'Simple content',
        },
      };

      const result = await addAudioToBase64([testCase], 'prompt');

      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          strategyId: 'audio',
          originalText: 'Simple content',
        }),
      );
      expect(result[0].assert).toBeUndefined();
    });

    it('should use language from config if provided', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'This should be in Spanish',
        },
      };

      await addAudioToBase64([testCase], 'prompt', { language: 'es' });

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"language":"es"'),
        }),
        expect.any(Number),
      );
    });

    it('should use language from test case metadata.language over config', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'This should be in Japanese',
        },
        metadata: {
          language: 'ja',
        },
      };

      await addAudioToBase64([testCase], 'prompt', { language: 'es' });

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"language":"ja"'),
        }),
        expect.any(Number),
      );
    });

    it('should use language from test case metadata.modifiers.language over config', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'This should be in French',
        },
        metadata: {
          modifiers: {
            language: 'fr',
          },
        },
      };

      await addAudioToBase64([testCase], 'prompt', { language: 'es' });

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"language":"fr"'),
        }),
        expect.any(Number),
      );
    });

    it('should prefer metadata.language over metadata.modifiers.language', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'This should be in German',
        },
        metadata: {
          language: 'de',
          modifiers: {
            language: 'fr',
          },
        },
      };

      await addAudioToBase64([testCase], 'prompt', { language: 'es' });

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"language":"de"'),
        }),
        expect.any(Number),
      );
    });

    it('should default to English when no language is specified', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'This should default to English',
        },
      };

      await addAudioToBase64([testCase], 'prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"language":"en"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle different languages for different test cases', async () => {
      const testCases: TestCase[] = [
        {
          vars: { prompt: 'Japanese text' },
          metadata: { language: 'ja' },
        },
        {
          vars: { prompt: 'French text' },
          metadata: { language: 'fr' },
        },
        {
          vars: { prompt: 'Default text' },
        },
      ];

      await addAudioToBase64(testCases, 'prompt', { language: 'es' });

      // First call should use 'ja' from metadata
      expect(mockFetchWithCache).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"language":"ja"'),
        }),
        expect.any(Number),
      );

      // Second call should use 'fr' from metadata
      expect(mockFetchWithCache).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"language":"fr"'),
        }),
        expect.any(Number),
      );

      // Third call should fall back to config 'es'
      expect(mockFetchWithCache).toHaveBeenNthCalledWith(
        3,
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"language":"es"'),
        }),
        expect.any(Number),
      );
    });

    it('should use progress bar when logger level is not debug', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'Test progress bar',
        },
      };

      // Save original level
      const originalLevel = logger.level;
      // Set level to info to enable progress bar
      logger.level = 'info';

      // Create mock for SingleBar
      const mockBarInstance = {
        increment: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };

      // Cast SingleBar to any to avoid TypeScript errors with mocking
      const mockSingleBar = SingleBar as any;
      const originalImplementation = mockSingleBar.mockImplementation;
      mockSingleBar.mockImplementation(function () {
        return mockBarInstance;
      });

      await addAudioToBase64([testCase], 'prompt');

      expect(mockBarInstance.increment).toHaveBeenCalledWith(1);
      expect(mockBarInstance.stop).toHaveBeenCalledWith();

      // Restore original implementation and logger level
      mockSingleBar.mockImplementation = originalImplementation;
      logger.level = originalLevel;
    });
  });
});
