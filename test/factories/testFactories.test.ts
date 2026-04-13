import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompletedPrompt, createEvaluateResult } from './eval';
import { createFailingGradingResult, createPassingGradingResult } from './gradingResult';
import { createProviderResponse, createRequiredTokenUsage } from './provider';
import { createPrompt } from './testSuite';

describe('test factories', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('uses the effective raw value as the default prompt label', () => {
    expect(createPrompt('base prompt', { raw: 'overridden prompt' })).toMatchObject({
      raw: 'overridden prompt',
      label: 'overridden prompt',
    });

    expect(
      createPrompt('base prompt', { raw: 'overridden prompt', label: 'custom label' }),
    ).toMatchObject({
      raw: 'overridden prompt',
      label: 'custom label',
    });
  });

  it('keeps completed prompt labels aligned with overridden raw values', () => {
    expect(createCompletedPrompt('base prompt', { raw: 'overridden prompt' })).toMatchObject({
      raw: 'overridden prompt',
      label: 'overridden prompt',
    });

    expect(
      createCompletedPrompt('base prompt', { raw: 'overridden prompt', label: 'custom label' }),
    ).toMatchObject({
      raw: 'overridden prompt',
      label: 'custom label',
    });
  });

  it('uses the effective prompt raw value as the default evaluate result prompt id', () => {
    expect(createEvaluateResult({ prompt: createPrompt('overridden prompt') })).toMatchObject({
      prompt: {
        raw: 'overridden prompt',
        label: 'overridden prompt',
      },
      promptId: 'overridden prompt',
    });

    expect(
      createEvaluateResult({
        prompt: createPrompt('overridden prompt'),
        promptId: 'custom prompt id',
      }),
    ).toMatchObject({
      promptId: 'custom prompt id',
    });
  });

  it('keeps grading helper pass and score invariants', () => {
    expect(createPassingGradingResult({ pass: false, score: 0, reason: 'custom' })).toMatchObject({
      pass: true,
      score: 1,
      reason: 'custom',
    });

    expect(createFailingGradingResult({ pass: true, score: 1, reason: 'custom' })).toMatchObject({
      pass: false,
      score: 0,
      reason: 'custom',
    });
  });

  it('deep-merges token usage scaffolding when overriding a subset in createProviderResponse', () => {
    expect(createProviderResponse({ tokenUsage: { total: 5 } }).tokenUsage).toEqual({
      total: 5,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
    });
  });

  it('preserves required nested token usage defaults when overriding assertion details', () => {
    expect(
      createRequiredTokenUsage({
        assertions: {
          completionDetails: {
            reasoning: 7,
          },
        },
      }).assertions.completionDetails,
    ).toEqual({
      reasoning: 7,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });
});
