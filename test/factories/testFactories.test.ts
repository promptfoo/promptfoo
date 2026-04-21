import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompletedPrompt, createEvaluateResult } from './eval';
import { createFailingGradingResult, createPassingGradingResult } from './gradingResult';
import {
  createMockProvider,
  createProviderResponse,
  createRequiredTokenUsage,
  resetMockProvider,
} from './provider';
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

  // Regression guard for the ...overrides.assertions merge order in
  // createRequiredTokenUsage. An earlier revision spread overrides.assertions
  // *after* the literal completionDetails key, which silently clobbered the
  // fully-populated nested defaults. The spread must happen before the
  // literal so the object-literal key wins — this test locks that ordering.
  it('merges scalar and nested assertion overrides without clobbering completionDetails', () => {
    const result = createRequiredTokenUsage({
      assertions: {
        total: 5,
        prompt: 3,
        completionDetails: { reasoning: 7 },
      },
    });

    expect(result.assertions).toEqual({
      total: 5,
      prompt: 3,
      completion: 0,
      cached: 0,
      numRequests: 0,
      completionDetails: {
        reasoning: 7,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    });
  });

  describe('createMockProvider', () => {
    it('resolves the default callApi to createProviderResponse', async () => {
      const provider = createMockProvider();
      expect(provider.id()).toBe('test-provider');
      await expect(provider.callApi('prompt')).resolves.toEqual(createProviderResponse());
    });

    it('accepts a function id that resolves lazily', () => {
      let counter = 0;
      const provider = createMockProvider({ id: () => `provider-${++counter}` });
      expect(provider.id()).toBe('provider-1');
      expect(provider.id()).toBe('provider-2');
    });

    it('invokes a user-supplied callApi implementation instead of the default', async () => {
      const customCallApi = vi.fn(async () => createProviderResponse({ output: 'custom' }));
      const provider = createMockProvider({ callApi: customCallApi });
      await expect(provider.callApi('prompt')).resolves.toMatchObject({ output: 'custom' });
      expect(customCallApi).toHaveBeenCalledWith('prompt');
    });

    it('wires cleanup as a resolved no-op when cleanup is true', async () => {
      const provider = createMockProvider({ cleanup: true });
      expect(provider.cleanup).toBeDefined();
      await expect(provider.cleanup!()).resolves.toBeUndefined();
    });

    it('wires cleanup to a user-supplied implementation when cleanup is a function', async () => {
      const cleanupImpl = vi.fn(async () => undefined);
      const provider = createMockProvider({ cleanup: cleanupImpl });
      await provider.cleanup!();
      expect(cleanupImpl).toHaveBeenCalledTimes(1);
    });

    it('does not attach cleanup when the option is omitted', () => {
      const provider = createMockProvider();
      expect(provider.cleanup).toBeUndefined();
    });
  });

  describe('resetMockProvider', () => {
    it('re-installs the default id and callApi resolution after reset', async () => {
      const provider = createMockProvider({
        id: 'original',
        callApi: async () => createProviderResponse({ output: 'original' }),
      });
      await provider.callApi('prompt');
      expect(provider.callApi).toHaveBeenCalledTimes(1);

      resetMockProvider(provider);

      expect(provider.callApi).toHaveBeenCalledTimes(0);
      expect(provider.id()).toBe('test-provider');
      await expect(provider.callApi('prompt')).resolves.toEqual(createProviderResponse());
    });

    it('re-installs an explicit response and id override', async () => {
      const provider = createMockProvider();
      resetMockProvider(provider, {
        id: 'reset-provider',
        response: createProviderResponse({ output: 'reset output' }),
      });
      expect(provider.id()).toBe('reset-provider');
      await expect(provider.callApi('prompt')).resolves.toMatchObject({ output: 'reset output' });
    });

    it('re-seeds cleanup when the shared mock was constructed with cleanup: true', async () => {
      const provider = createMockProvider({ cleanup: true });
      const replacement = vi.fn(async () => undefined);
      resetMockProvider(provider, { cleanup: replacement });
      await provider.cleanup!();
      expect(replacement).toHaveBeenCalledTimes(1);
    });
  });
});
