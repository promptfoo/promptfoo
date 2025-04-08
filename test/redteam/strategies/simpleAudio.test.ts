import { expect, it, describe } from '@jest/globals';
import { SingleBar } from 'cli-progress';
import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addAudioToBase64, textToAudio } from '../../../src/redteam/strategies/simpleAudio';
import type { TestCase } from '../../../src/types';

// Mock the remoteGeneration module
jest.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test.url'),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
}));

// Mock the cache module
jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

// Mock cli-progress
jest.mock('cli-progress', () => ({
  Presets: {
    shades_classic: {},
  },
  SingleBar: jest.fn().mockImplementation(() => ({
    increment: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

const originalConsoleLog = console.log;
const mockFetchWithCache = fetchWithCache as jest.Mock;
const mockNeverGenerateRemote = neverGenerateRemote as jest.Mock;

describe('audio strategy', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWithCache.mockResolvedValue({
      data: { audioBase64: 'bW9ja2VkLWF1ZGlvLWJhc2U2NC1kYXRh' },
    });
    mockNeverGenerateRemote.mockReturnValue(false);
  });

  afterAll(() => {
    console.log = originalConsoleLog;
  });

  describe('textToAudio', () => {
    it('should convert text to base64 string using remote API', async () => {
      const text = 'Hello, world!';
      const base64 = await textToAudio(text, 'en');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        }),
        expect.any(Number),
      );
      expect(base64).toBe('bW9ja2VkLWF1ZGlvLWJhc2U2NC1kYXRh');
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
      expect(mockFetchWithCache).toHaveBeenCalled();

      // Check the first argument set to fetchWithCache
      const callArgs = mockFetchWithCache.mock.calls[0][1]; // This is the options object

      // The body should be a stringified JSON object
      const body = JSON.parse(callArgs.body);
      expect(body.task).toBe('audio');
      expect(body.text).toBe(text);
      expect(body.language).toBe('fr');
    });
  });

  describe('addAudioToBase64', () => {
    it('should convert test cases with the specified variable', async () => {
      // Setup mock to return a predictable response
      mockFetchWithCache.mockResolvedValue({
        data: { audioBase64: 'bW9ja2VkLWF1ZGlv' },
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

      expect(result[0].metadata).toEqual({
        harmCategory: 'Illegal Activities',
        otherField: 'value',
        strategyId: 'audio',
      });
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

      expect(result[0].metadata).toEqual({
        strategyId: 'audio',
      });
      expect(result[0].assert).toBeUndefined();
    });

    it('should use language from config if provided', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'This should be in Spanish',
        },
      };

      await addAudioToBase64([testCase], 'prompt', { language: 'es' });

      // Verify a call was made
      expect(mockFetchWithCache).toHaveBeenCalled();

      // Check the first argument set to fetchWithCache
      const callArgs = mockFetchWithCache.mock.calls[0][1]; // This is the options object

      // The body should be a stringified JSON object
      const body = JSON.parse(callArgs.body);
      expect(body.language).toBe('es');
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
        increment: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      };

      // Cast SingleBar to any to avoid TypeScript errors with mocking
      const mockSingleBar = SingleBar as any;
      const originalImplementation = mockSingleBar.mockImplementation;
      mockSingleBar.mockImplementation(() => mockBarInstance);

      await addAudioToBase64([testCase], 'prompt');

      expect(mockBarInstance.increment).toHaveBeenCalled();
      expect(mockBarInstance.stop).toHaveBeenCalled();

      // Restore original implementation and logger level
      mockSingleBar.mockImplementation = originalImplementation;
      logger.level = originalLevel;
    });
  });
});
