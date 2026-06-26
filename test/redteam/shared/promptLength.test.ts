import { describe, expect, it } from 'vitest';
import { getGeneratedTestCaseLengthViolation } from '../../../src/redteam/shared/promptLength';

describe('getGeneratedTestCaseLengthViolation', () => {
  it('checks each generated sequence prompt against the minimum', () => {
    expect(
      getGeneratedTestCaseLengthViolation({ prompt: ['a', 'b'] }, 'prompt', {
        minCharsPerMessage: 3,
      }),
    ).toEqual({ kind: 'min', length: 1, limit: 3, path: 'prompt' });
  });

  it('counts only text parts in multimodal user messages', () => {
    const prompt = JSON.stringify([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${'a'.repeat(100)}` } },
        ],
      },
    ]);

    expect(
      getGeneratedTestCaseLengthViolation({ prompt }, 'prompt', { minCharsPerMessage: 3 }),
    ).toEqual({ kind: 'min', length: 2, limit: 3, path: '[0].content' });
  });
});
