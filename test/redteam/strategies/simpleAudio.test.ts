import { expect, it, describe } from '@jest/globals';
import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { shouldGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { addAudioToBase64, textToAudio } from '../../../src/redteam/strategies/simpleAudio';
import type { TestCase } from '../../../src/types';
import { SingleBar } from 'cli-progress';

// Mock the remoteGeneration module
jest.mock('../../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test.url'),
  shouldGenerateRemote: jest.fn(),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
}));

// Mock the cache module
jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

// Mock the node-gtts module
jest.mock('node-gtts', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    stream: jest.fn().mockImplementation(() => {
      const { Readable } = require('stream');
      const readable = new Readable();
      readable.push(Buffer.from('mocked-audio-data'));
      readable.push(null); // End the stream
      return readable;
    }),
  })),
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

describe('audio strategy', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (shouldGenerateRemote as jest.Mock).mockReturnValue(false);
    (fetchWithCache as jest.Mock).mockResolvedValue({
      data: { audioBase64: 'bW9ja2VkLWF1ZGlvLWJhc2U2NC1kYXRh' },
    });
  });

  describe('textToAudio', () => {
    it('should convert text to base64 string using remote API when shouldGenerateRemote is true', async () => {
      (shouldGenerateRemote as jest.Mock).mockReturnValue(true);
      
      const text = 'Hello, remote world!';
      const base64 = await textToAudio(text, 'en');

      expect(fetchWithCache).toHaveBeenCalled();
      expect(base64).toBe('bW9ja2VkLWF1ZGlvLWJhc2U2NC1kYXRh');
    });

    it('should convert text to base64 string locally when shouldGenerateRemote is false', async () => {
      (shouldGenerateRemote as jest.Mock).mockReturnValue(false);
      
      const text = 'Hello, local world!';
      const base64 = await textToAudio(text, 'en');

      expect(fetchWithCache).not.toHaveBeenCalled();
      // Check that the result is a base64 string (not the remote mocked value)
      expect(base64).toBeTruthy();
      expect(typeof base64).toBe('string');
      expect(base64).not.toBe('bW9ja2VkLWF1ZGlvLWJhc2U2NC1kYXRh');
      
      // Should be valid base64
      expect(() => Buffer.from(base64, 'base64')).not.toThrow();
    });

    it('should fall back to local processing if remote API fails', async () => {
      (shouldGenerateRemote as jest.Mock).mockReturnValue(true);
      (fetchWithCache as jest.Mock).mockRejectedValueOnce(new Error('Remote API error'));
      
      const text = 'Hello, fallback world!';
      const base64 = await textToAudio(text, 'en');

      expect(fetchWithCache).toHaveBeenCalled();
      expect(base64).toBeTruthy();
      expect(typeof base64).toBe('string');
      expect(base64).not.toBe('bW9ja2VkLWF1ZGlvLWJhc2U2NC1kYXRh');
      
      // Should be valid base64
      expect(() => Buffer.from(base64, 'base64')).not.toThrow();
    });

    it('should handle different languages', async () => {
      (shouldGenerateRemote as jest.Mock).mockReturnValue(false);
      
      const text = 'Bonjour, monde!';
      await textToAudio(text, 'fr');

      // Check if node-gtts was called with the correct language
      const nodeGtts = require('node-gtts').default;
      expect(nodeGtts).toHaveBeenCalledWith('fr');
    });
  });

  describe('addAudioToBase64', () => {
    it('should convert test cases with the specified variable', async () => {
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
      expect(result[0].vars?.prompt).toBeTruthy();
      expect(typeof result[0].vars?.prompt).toBe('string');
      expect(result[0].vars?.prompt).not.toBe('This is a test prompt'); // Should be changed
      expect(result[0].vars?.other).toBe('This should not be changed'); // Should not be changed

      // Should be valid base64
      expect(() => Buffer.from(result[0].vars?.prompt as string, 'base64')).not.toThrow();
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

      // Just check it's a valid base64 string
      expect(() => Buffer.from(result[0].vars?.prompt as string, 'base64')).not.toThrow();
    });

    it('should use language from config if provided', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'This should be in Spanish',
        },
      };

      await addAudioToBase64([testCase], 'prompt', { language: 'es' });
      
      // Check if node-gtts was called with the correct language
      const nodeGtts = require('node-gtts').default;
      expect(nodeGtts).toHaveBeenCalledWith('es');
    });

    it('should increment progress bar when provided', async () => {
      const testCase: TestCase = {
        vars: {
          prompt: 'Test progress bar',
        },
      };

      // Save original level
      const originalLevel = logger.level;
      // Set level to info to enable progress bar
      logger.level = 'info';

      // Create a spy for SingleBar
      const mockIncrement = jest.fn();
      const mockStop = jest.fn();
      (SingleBar as jest.Mock).mockImplementation(() => ({
        increment: mockIncrement,
        start: jest.fn(),
        stop: mockStop,
      }));
      
      await addAudioToBase64([testCase], 'prompt');

      expect(mockIncrement).toHaveBeenCalled();
      expect(mockStop).toHaveBeenCalled();
      
      // Restore original logger level
      logger.level = originalLevel;
    });
  });
});
