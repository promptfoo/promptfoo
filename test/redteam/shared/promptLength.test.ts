import { describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import {
  getGeneratedTestCaseLengthViolation,
  getTargetPromptCharLimits,
} from '../../../src/redteam/shared/promptLength';

describe('getGeneratedTestCaseLengthViolation', () => {
  it('checks each generated sequence prompt against the minimum', () => {
    expect(
      getGeneratedTestCaseLengthViolation({ prompt: ['a', 'b'] }, 'prompt', {
        minCharsPerMessage: 3,
      }),
    ).toEqual({ kind: 'min', length: 1, limit: 3, path: 'prompt' });
  });

  it('prefers resolved runtime overrides over stale cli state when requested', () => {
    const originalConfig = cliState.config;
    cliState.config = { redteam: { minCharsPerMessage: 100 } };

    try {
      expect(
        getTargetPromptCharLimits(
          undefined,
          { minCharsPerMessage: 10 },
          {
            preferProviderCharLimits: true,
          },
        ),
      ).toEqual({ maxCharsPerMessage: undefined, minCharsPerMessage: 10 });
    } finally {
      cliState.config = originalConfig;
    }
  });

  it('counts input_text parts when enforcing the maximum', () => {
    const prompt = JSON.stringify([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'too long' }],
      },
    ]);

    expect(
      getGeneratedTestCaseLengthViolation({ prompt }, 'prompt', { maxCharsPerMessage: 5 }),
    ).toEqual({ kind: 'max', length: 8, limit: 5, path: '[0].content' });
  });

  it('counts input_text parts when enforcing the minimum', () => {
    const prompt = JSON.stringify([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'enough' }],
      },
    ]);

    expect(
      getGeneratedTestCaseLengthViolation({ prompt }, 'prompt', { minCharsPerMessage: 5 }),
    ).toBeUndefined();
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
