import { describe, expect, it } from 'vitest';
import { getPluginIdFromResult, getReportPrompt } from './shared';

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

describe('getPluginIdFromResult', () => {
  it('uses the canonical test-case policy ID when grading details are stripped', () => {
    const result = {
      testCase: { metadata: { pluginId: 'policy', policyId: 'policy-123' } },
      gradingResult: null,
    } as unknown as Parameters<typeof getPluginIdFromResult>[0];

    expect(getPluginIdFromResult(result)).toBe('policy-123');
  });

  it('uses historical test-case plugin identity when other fallbacks are stripped', () => {
    const result = {
      testCase: { metadata: { pluginId: 'harmful:violent-crime' } },
      vars: {},
      gradingResult: null,
    } as unknown as Parameters<typeof getPluginIdFromResult>[0];

    expect(getPluginIdFromResult(result)).toBe('harmful:violent-crime');
  });
});
