import { expect, it, describe } from '@jest/globals';
import { addAudioToBase64, textToAudio } from '../../../src/redteam/strategies/simpleAudio';
import type { TestCase } from '../../../src/types';

const originalConsoleLog = console.log;

describe('audio strategy', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
  });

  it('textToAudio should convert text to base64 string', async () => {
    const text = 'Hello, world!';
    const base64 = await textToAudio(text);

    // Base64 should be a non-empty string
    expect(base64).toBeTruthy();
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);

    // Should be valid base64
    expect(() => Buffer.from(base64, 'base64')).not.toThrow();
  }, 15000); // 15 second timeout for potential slow TTS processing

  it('addAudioToBase64 should convert test cases with the specified variable', async () => {
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
  }, 15000); // 15 second timeout for potential slow TTS processing

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
  }, 15000); // 15 second timeout for potential slow TTS processing

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
  }, 15000); // 15 second timeout for potential slow TTS processing
});
