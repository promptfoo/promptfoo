import { matchesModeration } from '../../src/matchers';
import { OpenAiModerationProvider } from '../../src/providers/openai/moderation';
import { ReplicateModerationProvider } from '../../src/providers/replicate';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from '../../src/redteam/constants';

describe('matchesModeration', () => {
  const mockModerationResponse = {
    flags: [],
    tokenUsage: { total: 5, prompt: 2, completion: 3 },
  };

  beforeEach(() => {
    // Clear all environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.REPLICATE_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should skip moderation when assistant response is empty', async () => {
    const openAiSpy = jest
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
    process.env.OPENAI_API_KEY = 'test-key';
    const openAiSpy = jest
      .spyOn(OpenAiModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    await matchesModeration({
      userPrompt: 'test prompt',
      assistantResponse: 'test response',
    });

    expect(openAiSpy).toHaveBeenCalledWith('test prompt', 'test response');
  });

  it('should fallback to Replicate when only REPLICATE_API_KEY is present', async () => {
    process.env.REPLICATE_API_KEY = 'test-key';
    const replicateSpy = jest
      .spyOn(ReplicateModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue(mockModerationResponse);

    await matchesModeration({
      userPrompt: 'test prompt',
      assistantResponse: 'test response',
    });

    expect(replicateSpy).toHaveBeenCalledWith('test prompt', 'test response');
  });

  it('should respect provider override in grading config', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const replicateSpy = jest
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
});
