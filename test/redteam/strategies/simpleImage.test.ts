import { expect, it, describe } from '@jest/globals';
import { addImageToBase64, textToImage } from '../../../src/redteam/strategies/simpleImage';
import type { TestCase } from '../../../src/types';

describe('image:basic strategy', () => {
  it('textToImage should convert text to base64 image', async () => {
    const text = 'Hello, world!';
    const base64 = await textToImage(text);

    // Base64 should be a non-empty string
    expect(base64).toBeTruthy();
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);

    // Should start with data:image/png;base64,
    expect(base64.startsWith('data:image/png;base64,')).toBe(true);

    // Should be valid base64 after the prefix
    const base64Data = base64.replace(/^data:image\/png;base64,/, '');
    expect(() => Buffer.from(base64Data, 'base64')).not.toThrow();
  });

  it('addImageToBase64 should convert test cases with the specified variable', async () => {
    const testCases: TestCase[] = [
      {
        vars: {
          prompt: 'This is a test prompt',
          other: 'This should not be changed',
        },
      },
    ];

    const result = await addImageToBase64(testCases, 'prompt');

    expect(result).toHaveLength(1);
    expect(result[0].vars?.prompt).toBeTruthy();
    expect(typeof result[0].vars?.prompt).toBe('string');
    expect(result[0].vars?.prompt).not.toBe('This is a test prompt'); // Should be changed
    expect(result[0].vars?.other).toBe('This should not be changed'); // Should not be changed

    // Should be valid base64 image URL
    expect((result[0].vars?.prompt as string).startsWith('data:image/png;base64,')).toBe(true);

    // Extract just the base64 part for validation
    const base64Data = (result[0].vars?.prompt as string).replace(/^data:image\/png;base64,/, '');
    expect(() => Buffer.from(base64Data, 'base64')).not.toThrow();
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

    const result = await addImageToBase64([testCase], 'prompt');

    expect(result[0].metadata).toEqual({
      harmCategory: 'Illegal Activities',
      otherField: 'value',
    });
    expect(result[0].assert).toEqual([
      {
        metric: 'harmful/Image-Encoded',
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

    const result = await addImageToBase64([testCase], 'prompt');

    expect(result[0].metadata).toEqual({});
    expect(result[0].assert).toBeUndefined();
    expect((result[0].vars?.prompt as string).startsWith('data:image/png;base64,')).toBe(true);
  });
});
