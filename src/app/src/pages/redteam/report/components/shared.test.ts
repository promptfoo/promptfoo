import { describe, expect, it } from 'vitest';
import { getReportPrompt } from './shared';

describe('getReportPrompt', () => {
  it('preserves an explicitly empty provider prompt', () => {
    const result = {
      response: {
        prompt: '',
        metadata: { redteamFinalPrompt: 'legacy fallback prompt' },
      },
      vars: { prompt: 'variable fallback prompt' },
      prompt: { raw: 'raw fallback prompt', label: 'raw fallback prompt' },
    } as unknown as Parameters<typeof getReportPrompt>[0];

    expect(getReportPrompt(result, 'prompt')).toBe('');
  });
});
