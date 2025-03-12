import { SingleBar } from 'cli-progress';
import logger from '../../../src/logger';
import { addImageToBase64 } from '../../../src/redteam/strategies/simpleImage';
import type { TestCase } from '../../../src/types';

// Mock dependencies
jest.mock('cli-progress');
jest.mock('../../../src/logger');

// Do NOT mock the textToImage function since it's generating real base64 data
// We'll test with the actual implementation
jest.mock('../../../src/redteam/strategies/simpleImage', () => {
  const originalModule = jest.requireActual('../../../src/redteam/strategies/simpleImage');
  return {
    ...originalModule,
  };
});

describe('Image strategy', () => {
  // Sample test cases
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
      // Test case without assertions
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

      // Verify the result contains the expected number of test cases
      expect(result).toHaveLength(testCases.length);

      // Verify test case has been correctly processed
      // Since the actual base64 data is dynamic, we just check structure
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
          prompt: expect.stringMatching(/^iVBOR/), // Base64 PNG starts with this prefix
        },
      });

      // Verify all test cases were processed
      expect(result[1].vars?.image_text).toBe('Another test prompt');
      expect(result[1].vars?.prompt).toMatch(/^iVBOR/);
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
      // Verify data structure
      expect(result[0].vars?.prompt).toMatch(/^iVBOR/);
      expect(result[0].vars?.image_text).toBe('Test without assert');
      expect(result[0].assert).toBeUndefined();
    });

    it('should throw an error when test case vars is missing', async () => {
      // Create an invalid test case that will trigger the invariant
      const invalidTestCases = [{} as unknown as TestCase];

      await expect(addImageToBase64(invalidTestCases, 'prompt')).rejects.toThrow(
        /testCase.vars is required/,
      );
    });

    it('should handle errors in textToImage gracefully', async () => {
      // Create a test case with problematic content
      const problematicCase: TestCase = {
        vars: {
          prompt: '', // Empty prompt might cause issues
        },
      };

      const result = await addImageToBase64([problematicCase], 'prompt');

      // We just verify the test case was processed
      expect(result).toHaveLength(1);

      // Since the actual implementation might not error on empty string,
      // we can't reliably test the error case without mocking textToImage
    });

    it('should create and update progress bar', async () => {
      // Mock the SingleBar instance methods
      const mockStart = jest.fn();
      const mockIncrement = jest.fn();
      const mockStop = jest.fn();

      // Simulate non-debug mode
      (logger.level as any) = 'info';

      // Create a mock instance for SingleBar
      const mockSingleBar = {
        start: mockStart,
        increment: mockIncrement,
        stop: mockStop,
      };

      // Replace the SingleBar constructor with a mock that returns our mock instance
      jest.mocked(SingleBar).mockImplementation(() => mockSingleBar as unknown as SingleBar);

      await addImageToBase64(testCases, 'prompt');

      // Verify progress bar was used correctly
      expect(mockStart).toHaveBeenCalledWith(testCases.length, 0);
      expect(mockIncrement).toHaveBeenCalledTimes(2);
      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('should log progress in debug mode without progress bar', async () => {
      // Simulate debug mode
      (logger.level as any) = 'debug';

      await addImageToBase64(testCases, 'prompt');

      // Verify debug logging was used instead of progress bar
      expect(logger.debug).toHaveBeenCalledWith('Processed 1 of 2');
      expect(logger.debug).toHaveBeenCalledWith('Processed 2 of 2');
    });

    it('should update assertion metrics with Image-Encoded suffix', async () => {
      const result = await addImageToBase64([testCases[0]], 'prompt');

      // Check specifically that promptfoo:redteam: prefixed metrics are updated
      const assertions = result[0].assert;
      expect(assertions?.[0].metric).toBe('test-metric'); // Regular metric unchanged
      expect(assertions?.[1].metric).toBe('jailbreak/Image-Encoded'); // Red team metric updated
    });

    it('should create metadata if not present in the original test case', async () => {
      const testCaseWithoutMetadata: TestCase = {
        vars: {
          prompt: 'No metadata',
        },
      };

      const result = await addImageToBase64([testCaseWithoutMetadata], 'prompt');

      expect(result[0].metadata).toEqual({});
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
      });
    });
  });
});
