import { getEnvString } from '../../../src/envars';
import { neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import {
  addVideoToBase64,
  textToVideo,
  importFfmpeg,
} from '../../../src/redteam/strategies/simpleVideo';
import type { TestCase } from '../../../src/types';

jest.mock('../../../src/envars');
jest.mock('../../../src/redteam/remoteGeneration');
jest.mock('fluent-ffmpeg', () => {
  throw new Error('fluent-ffmpeg not installed');
});

describe('simpleVideo', () => {
  beforeEach(() => {
    // @ts-expect-error: Mock implementation
    jest.mocked(getEnvString).mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'NODE_ENV') {
        return 'test';
      }
      return defaultValue ?? undefined;
    });
    jest.mocked(neverGenerateRemote).mockReturnValue(true);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('textToVideo', () => {
    it('returns a base64 string in test environment', async () => {
      const result = await textToVideo('test text');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns test environment video when JEST_WORKER_ID is set', async () => {
      // @ts-expect-error: Mock implementation
      jest.mocked(getEnvString).mockImplementation((key: string) => {
        if (key === 'JEST_WORKER_ID') {
          return '1';
        }
        return undefined;
      });
      const result = await textToVideo('test text');
      expect(typeof result).toBe('string');
      expect(result.startsWith('AAAAI')).toBe(true);
    });

    it('returns fallback base64 if video generation fails', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(false);
      // @ts-expect-error: Mock implementation
      jest.mocked(getEnvString).mockReturnValue(undefined);
      const text = 'test text';
      const result = await textToVideo(text);
      const expectedBase64 = Buffer.from(text).toString('base64');
      expect(result).toBe(expectedBase64);
    });

    it('returns fallback base64 if ffmpeg import fails', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(true);
      // @ts-expect-error: Mock implementation
      jest.mocked(getEnvString).mockReturnValue(undefined);
      const text = 'test text';
      const result = await textToVideo(text);
      const expectedBase64 = Buffer.from(text).toString('base64');
      expect(result).toBe(expectedBase64);
    });
  });

  describe('addVideoToBase64', () => {
    it('processes test cases correctly', async () => {
      const testCases: TestCase[] = [
        {
          vars: {
            prompt: 'test prompt',
          },
          assert: [
            {
              type: 'promptfoo:redteam:test',
              metric: 'test-metric',
            },
          ],
        },
      ];

      const result = await addVideoToBase64(testCases, 'prompt');

      expect(result).toHaveLength(1);
      expect(result[0].vars?.prompt).toBeDefined();
      expect(typeof result[0].vars?.prompt).toBe('string');
      expect(result[0].vars?.video_text).toBe('test prompt');
      expect(result[0].metadata?.strategyId).toBe('video');
      expect(result[0].assert?.[0].metric).toBe('test/Video-Encoded');
    });

    it('throws an error if vars is missing', async () => {
      const testCases = [{}] as TestCase[];
      await expect(addVideoToBase64(testCases, 'prompt')).rejects.toThrow(
        'Video encoding: testCase.vars is required',
      );
    });

    it('preserves non-redteam assertion metrics', async () => {
      const testCases: TestCase[] = [
        {
          vars: {
            prompt: 'test prompt',
          },
          assert: [
            {
              // @ts-expect-error: Testing non-redteam type
              type: 'other',
              metric: 'test-metric',
            },
          ],
        },
      ];

      const result = await addVideoToBase64(testCases, 'prompt');
      expect(result[0].assert?.[0].metric).toBe('test-metric');
    });

    it('handles multiple test cases with progress bar', async () => {
      const testCases: TestCase[] = Array(3).fill({
        vars: {
          prompt: 'test prompt',
        },
      });

      const result = await addVideoToBase64(testCases, 'prompt');
      expect(result).toHaveLength(3);
      result.forEach((testCase) => {
        expect(testCase.vars?.prompt).toBeDefined();
        expect(testCase.metadata?.strategyId).toBe('video');
      });
    });
  });

  describe('importFfmpeg', () => {
    it('throws error if fluent-ffmpeg is not installed', async () => {
      await expect(importFfmpeg()).rejects.toThrow(
        'To use the video strategy, please install fluent-ffmpeg',
      );
    });
  });
});
