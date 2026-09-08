import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesModeration } from '../../src/matchers/moderation';
import { OpenAiModerationProvider } from '../../src/providers/openai/moderation';
import { ReplicateModerationProvider } from '../../src/providers/replicate';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from '../../src/redteam/constants';
import {
  withProviderCallExecutionContext,
  withProviderCallTracingContext,
} from '../../src/scheduler/providerCallExecutionContext';
import { mockProcessEnv } from '../util/utils';

import type { ProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';

describe('matchesModeration', () => {
  const mockModerationResponse = {
    flags: [],
    tokenUsage: { total: 5, prompt: 2, completion: 3 },
  };
  const normalizedTokenUsage = {
    total: 5,
    prompt: 2,
    completion: 3,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };
  let restoreProcessEnv = () => {};

  function setTestEnv(overrides: Record<string, string | undefined> = {}) {
    restoreProcessEnv();
    restoreProcessEnv = mockProcessEnv({
      OPENAI_API_KEY: undefined,
      REPLICATE_API_KEY: undefined,
      REPLICATE_API_TOKEN: undefined,
      ...overrides,
    });
  }

  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreProcessEnv();
    restoreProcessEnv = () => {};
  });

  it('forwards the evaluator abort signal to the moderation provider', async () => {
    const abortSignal = new AbortController().signal;
    const provider = new ReplicateModerationProvider('fixture/model');
    const call = vi.spyOn(provider, 'callModerationApi').mockResolvedValue(mockModerationResponse);
    await withProviderCallExecutionContext({ abortSignal }, () =>
      matchesModeration(
        { userPrompt: 'test prompt', assistantResponse: 'test response' },
        { provider },
      ),
    );
    expect(call).toHaveBeenCalledWith('test prompt', 'test response', undefined, { abortSignal });
  });

  it('should skip moderation when assistant response is empty', async () => {
    const openAiSpy = vi
      .spyOn(OpenAiModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    const result = await matchesModeration({
      userPrompt: 'test prompt',
      assistantResponse: '',
    });

    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: expect.any(String),
    });
    expect(openAiSpy).not.toHaveBeenCalled();
  });

  it('should use OpenAI when OPENAI_API_KEY is present', async () => {
    setTestEnv({ OPENAI_API_KEY: 'test-key' });
    const openAiSpy = vi
      .spyOn(OpenAiModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    await matchesModeration({
      userPrompt: 'test prompt',
      assistantResponse: 'test response',
    });

    expect(openAiSpy).toHaveBeenCalledWith('test prompt', 'test response');
  });

  it.each([false, true])(
    'preserves traced context and call arity, signal=%s',
    async (withSignal) => {
      setTestEnv({ OPENAI_API_KEY: 'test-key' });
      const abortSignal = withSignal ? new AbortController().signal : undefined;
      const tracedContext = {
        vars: {},
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      };
      const call = vi
        .spyOn(OpenAiModerationProvider.prototype, 'callModerationApi')
        .mockResolvedValue(mockModerationResponse);
      const providerSpan = vi.fn<ProviderCallTracingContext['withProviderSpan']>(
        async (_options, invoke) => invoke(tracedContext),
      );

      await withProviderCallExecutionContext({ abortSignal }, () =>
        withProviderCallTracingContext(
          {
            getActiveTraceparent: () => tracedContext.traceparent,
            withGraderSpan: async (_options, invoke) => invoke(),
            withProviderSpan: providerSpan,
          },
          () =>
            matchesModeration({ userPrompt: 'test prompt', assistantResponse: 'test response' }),
        ),
      );

      expect(providerSpan).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'grader', promptLabel: 'moderation' }),
        expect.any(Function),
      );
      expect(call.mock.calls[0]).toEqual([
        'test prompt',
        'test response',
        ...(abortSignal ? [tracedContext, { abortSignal }] : []),
      ]);
    },
  );

  it('should propagate token usage returned by moderation provider', async () => {
    setTestEnv({ OPENAI_API_KEY: 'test-key' });
    vi.spyOn(OpenAiModerationProvider.prototype, 'callModerationApi').mockResolvedValue(
      mockModerationResponse,
    );

    const result = await matchesModeration({
      userPrompt: 'test prompt',
      assistantResponse: 'test response',
    });

    expect(result.tokensUsed).toEqual(normalizedTokenUsage);
  });

  it('should fall back to Replicate when only REPLICATE_API_KEY is present', async () => {
    setTestEnv({ REPLICATE_API_KEY: 'test-key' });
    const replicateSpy = vi
      .spyOn(ReplicateModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    await matchesModeration({
      userPrompt: 'test prompt',
      assistantResponse: 'test response',
    });

    expect(replicateSpy).toHaveBeenCalledWith('test prompt', 'test response');
  });

  it('should respect provider override in grading config', async () => {
    setTestEnv({ OPENAI_API_KEY: 'test-key' });
    const replicateSpy = vi
      .spyOn(ReplicateModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    await matchesModeration(
      {
        userPrompt: 'test prompt',
        assistantResponse: 'test response',
      },
      {
        provider: LLAMA_GUARD_REPLICATE_PROVIDER,
      },
    );

    expect(replicateSpy).toHaveBeenCalledWith('test prompt', 'test response');
  });

  it('should fail when the moderation API returns an error', async () => {
    setTestEnv({ OPENAI_API_KEY: 'test-key' });
    vi.spyOn(OpenAiModerationProvider.prototype, 'callModerationApi').mockResolvedValue({
      error: 'provider unavailable',
      tokenUsage: mockModerationResponse.tokenUsage,
    });

    await expect(
      matchesModeration({
        userPrompt: 'test prompt',
        assistantResponse: 'test response',
      }),
    ).resolves.toEqual({
      pass: false,
      score: 0,
      reason: 'Moderation API error: provider unavailable',
      tokensUsed: normalizedTokenUsage,
      // Tagged so inverse-aware callers (not-moderation) don't flip a transport
      // error into a spurious pass.
      metadata: { graderError: true },
    });
  });

  it('should fail when moderation flags match the requested categories', async () => {
    setTestEnv({ OPENAI_API_KEY: 'test-key' });
    vi.spyOn(OpenAiModerationProvider.prototype, 'callModerationApi').mockResolvedValue({
      flags: [
        { code: 'violence', description: 'Violence', confidence: 1 },
        { code: 'hate', description: 'Hate', confidence: 1 },
      ],
    });

    await expect(
      matchesModeration({
        userPrompt: 'test prompt',
        assistantResponse: 'test response',
        categories: ['hate'],
      }),
    ).resolves.toEqual({
      pass: false,
      score: 0,
      reason: 'Moderation flags detected: Hate',
    });
  });

  it('should pass when flags do not match the requested categories', async () => {
    setTestEnv({ OPENAI_API_KEY: 'test-key' });
    vi.spyOn(OpenAiModerationProvider.prototype, 'callModerationApi').mockResolvedValue({
      flags: [{ code: 'violence', description: 'Violence', confidence: 1 }],
    });

    await expect(
      matchesModeration({
        userPrompt: 'test prompt',
        assistantResponse: 'test response',
        categories: ['hate'],
      }),
    ).resolves.toEqual({
      pass: true,
      score: 1,
      reason: 'No relevant moderation flags detected',
    });
  });
});
