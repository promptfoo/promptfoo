import { SingleBar } from 'cli-progress';
import logger from '../../../src/logger';
import { addImageToBase64 } from '../../../src/redteam/strategies/simpleImage';
import type { TestCase } from '../../../src/types';

jest.mock('sharp', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      png: jest.fn().mockReturnValue({
        toBuffer: jest
          .fn()
          .mockResolvedValue(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
          ),
      }),
    })),
  };
});

jest.mock('cli-progress');

jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  level: 'info',
}));

describe('Image strategy', () => {
  const testCases: TestCase[] = [
    {
      vars: {
        prompt: 'This is a test prompt',
      },
      assert: [
        {
          type: 'equals',
          value: 'expected',
          metric: 'test-metric',
        },
        {
          type: 'promptfoo:redteam:jailbreak',
          value: 'should update this metric',
          metric: 'jailbreak-metric',
        },
      ],
    },
    {
      vars: {
        prompt: 'Another test prompt',
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('addImageToBase64', () => {
    it('should convert text to images and return updated test cases', async () => {
      const result = await addImageToBase64(testCases, 'prompt');

      expect(result).toHaveLength(testCases.length);

      expect(result[0]).toMatchObject({
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'test-metric',
          },
          {
            type: 'promptfoo:redteam:jailbreak',
            value: 'should update this metric',
            metric: 'jailbreak/Image-Encoded',
          },
        ],
        metadata: expect.any(Object),
        vars: {
          image_text: 'This is a test prompt',
          prompt: expect.stringMatching(/^i/),
        },
      });

      expect(result[1].vars?.image_text).toBe('Another test prompt');
      expect(result[1].vars?.prompt).toMatch(/^i/);
    });

    it('should handle test cases without assert property', async () => {
      const testCasesWithoutAssert: TestCase[] = [
        {
          vars: {
            prompt: 'Test without assert',
          },
        },
      ];

      const result = await addImageToBase64(testCasesWithoutAssert, 'prompt');

      expect(result).toHaveLength(1);
      expect(result[0].vars?.prompt).toMatch(/^i/);
      expect(result[0].vars?.image_text).toBe('Test without assert');
      expect(result[0].assert).toBeUndefined();
    });

    it('should throw an error when test case vars is missing', async () => {
      const invalidTestCases = [{} as unknown as TestCase];

      await expect(addImageToBase64(invalidTestCases, 'prompt')).rejects.toThrow(
        /testCase.vars is required/,
      );
    });

    it('should handle errors in textToImage gracefully', async () => {
      const problematicCase: TestCase = {
        vars: {
          prompt: '',
        },
      };

      const result = await addImageToBase64([problematicCase], 'prompt');

      expect(result).toHaveLength(1);
    });

    it('should create and update progress bar', async () => {
      const mockStart = jest.fn();
      const mockIncrement = jest.fn();
      const mockStop = jest.fn();

      (logger.level as any) = 'info';

      const mockSingleBar = {
        start: mockStart,
        increment: mockIncrement,
        stop: mockStop,
      };

      jest.mocked(SingleBar).mockImplementation(() => mockSingleBar as unknown as SingleBar);

      await addImageToBase64(testCases, 'prompt');

      expect(mockStart).toHaveBeenCalledWith(testCases.length, 0);
      expect(mockIncrement).toHaveBeenCalledTimes(2);
      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('should log progress in debug mode without progress bar', async () => {
      (logger.level as any) = 'debug';

      await addImageToBase64(testCases, 'prompt');

      expect(logger.debug).toHaveBeenCalledWith('Processed 1 of 2');
      expect(logger.debug).toHaveBeenCalledWith('Processed 2 of 2');
    });

    it('should update assertion metrics with Image-Encoded suffix', async () => {
      const result = await addImageToBase64([testCases[0]], 'prompt');

      const assertions = result[0].assert;
      expect(assertions?.[0].metric).toBe('test-metric');
      expect(assertions?.[1].metric).toBe('jailbreak/Image-Encoded');
    });

    it('should create metadata if not present in the original test case', async () => {
      const testCaseWithoutMetadata: TestCase = {
        vars: {
          prompt: 'No metadata',
        },
      };

      const result = await addImageToBase64([testCaseWithoutMetadata], 'prompt');

      expect(result[0].metadata).toEqual({
        strategyId: 'image',
      });
    });

    it('should preserve existing metadata in the test case', async () => {
      const testCaseWithMetadata: TestCase = {
        vars: {
          prompt: 'With metadata',
        },
        metadata: {
          source: 'test',
          category: 'image-test',
        },
      };

      const result = await addImageToBase64([testCaseWithMetadata], 'prompt');

      expect(result[0].metadata).toEqual({
        source: 'test',
        category: 'image-test',
        strategyId: 'image',
      });
    });
  });
});
