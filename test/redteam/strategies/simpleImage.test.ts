import { expect, it, describe } from '@jest/globals';
import { addImageToBase64, textToImageBase64 } from '../../../src/redteam/strategies/simpleImage';
import type { TestCase } from '../../../src/types';

describe('image:basic strategy', () => {
  it('textToImageBase64 should convert text to base64 image', async () => {
    const text = 'Hello, world!';
    const base64 = textToImageBase64(text);

    // Base64 should be a non-empty string
    expect(base64).toBeTruthy();
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);

    // Should be valid base64
    expect(() => Buffer.from(base64, 'base64')).not.toThrow();
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

    // Should be valid base64
    expect(() => Buffer.from(result[0].vars?.prompt as string, 'base64')).not.toThrow();
  });
});
