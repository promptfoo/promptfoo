import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesModeration } from '../../src/matchers/moderation';
import { OpenAiModerationProvider } from '../../src/providers/openai/moderation';
import { ReplicateModerationProvider } from '../../src/providers/replicate';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from '../../src/redteam/constants';
import { mockProcessEnv } from '../util/utils';

describe('matchesModeration', () => {
  const mockModerationResponse = {
    flags: [],
    tokenUsage: { total: 5, prompt: 2, completion: 3 },
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

  it('should fallback to Replicate when only REPLICATE_API_KEY is present', async () => {
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
    });
  });

  it('should fail when moderation flags match the requested categories', async () => {
    setTestEnv({ OPENAI_API_KEY: 'test-key' });
    vi.spyOn(OpenAiModerationProvider.prototype, 'callModerationApi').mockResolvedValue({
      flags: [
        { code: 'violence', description: 'Violence' },
        { code: 'hate', description: 'Hate' },
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
      flags: [{ code: 'violence', description: 'Violence' }],
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
