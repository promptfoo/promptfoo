import { describe, expect, it } from 'vitest';
import { matchesLlamaGuard } from '../../src/matchers/llamaGuard';
import { createMockProvider } from '../factories/provider';

describe('matchesLlamaGuard', () => {
  it('should skip classification when assistant response is empty', async () => {
    const mockProvider = createMockProvider();

    const result = await matchesLlamaGuard(
      { userPrompt: 'test prompt', assistantResponse: '' },
      { provider: mockProvider },
    );

    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'No output to classify',
    });
    expect(mockProvider.callApi).not.toHaveBeenCalled();
  });

  it('should throw a clear error when no LlamaGuard-capable provider is configured', async () => {
    // Unlike llm-rubric/factuality/context-relevance, this matcher has NO default
    // provider fallback: a generic text-grading provider cannot produce
    // LlamaGuard-shaped output, so silently using one would misclassify every
    // response. It must fail loudly instead.
    await expect(
      matchesLlamaGuard({ userPrompt: 'test prompt', assistantResponse: 'test response' }),
    ).rejects.toThrow(/No provider of type text found for 'llama-guard check'/);
  });

  it('should pass and report no violated categories for a safe verdict', async () => {
    const mockProvider = createMockProvider({
      response: { output: 'safe', tokenUsage: { total: 10, prompt: 5, completion: 5 } },
    });

    const result = await matchesLlamaGuard(
      { userPrompt: 'test prompt', assistantResponse: 'test response' },
      { provider: mockProvider },
    );

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('LlamaGuard classified the response as safe');
    expect(result.metadata?.violatedCategories).toEqual([]);
  });

  it('should fail and report violated categories for an unsafe verdict', async () => {
    const mockProvider = createMockProvider({
      response: { output: 'unsafe\nS1,S10', tokenUsage: { total: 10, prompt: 5, completion: 5 } },
    });

    const result = await matchesLlamaGuard(
      { userPrompt: 'test prompt', assistantResponse: 'test response' },
      { provider: mockProvider },
    );

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe('LlamaGuard flagged: Violent Crimes (S1), Hate (S10)');
    expect(result.metadata?.violatedCategories).toEqual(['S1', 'S10']);
    expect(result.metadata?.categoryDescriptions).toMatchObject({ S1: 'Violent Crimes' });
  });

  it('should filter violated categories down to the requested allow-list', async () => {
    const mockProvider = createMockProvider({
      response: { output: 'unsafe\nS1,S10' },
    });

    const result = await matchesLlamaGuard(
      { userPrompt: 'test prompt', assistantResponse: 'test response', categories: ['S1'] },
      { provider: mockProvider },
    );

    expect(result.pass).toBe(false);
    expect(result.metadata?.violatedCategories).toEqual(['S1']);
  });

  it('should pass when the unsafe verdict has no categories in the requested allow-list', async () => {
    const mockProvider = createMockProvider({
      response: { output: 'unsafe\nS1' },
    });

    const result = await matchesLlamaGuard(
      { userPrompt: 'test prompt', assistantResponse: 'test response', categories: ['S10'] },
      { provider: mockProvider },
    );

    expect(result.pass).toBe(true);
    expect(result.reason).toBe('No relevant LlamaGuard categories detected');
  });

  it('should build the classification prompt from the Human/Assistant turns', async () => {
    const mockProvider = createMockProvider({ response: { output: 'safe' } });

    await matchesLlamaGuard(
      { userPrompt: 'Is this ok?', assistantResponse: 'Sure, here you go.' },
      { provider: mockProvider },
    );

    expect(mockProvider.callApi).toHaveBeenCalledWith(
      'Human: Is this ok?\n\nAssistant: Sure, here you go.',
      expect.anything(),
    );
  });

  it('should tag a provider/transport error as a grader failure', async () => {
    const mockProvider = createMockProvider({
      response: { error: 'connection reset' },
    });

    const result = await matchesLlamaGuard(
      { userPrompt: 'test prompt', assistantResponse: 'test response' },
      { provider: mockProvider },
    );

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('connection reset');
    expect(result.metadata).toEqual({ graderError: true });
  });

  it('should tag a non-string response as a grader failure without throwing', async () => {
    const mockProvider = createMockProvider({
      response: { output: { unexpected: 'object' } as unknown as string },
    });

    const result = await matchesLlamaGuard(
      { userPrompt: 'test prompt', assistantResponse: 'test response' },
      { provider: mockProvider },
    );

    expect(result.pass).toBe(false);
    expect(result.metadata).toEqual({ graderError: true });
  });

  it('should preserve token usage from the classification call', async () => {
    const mockProvider = createMockProvider({
      response: { output: 'safe', tokenUsage: { total: 12, prompt: 8, completion: 4 } },
    });

    const result = await matchesLlamaGuard(
      { userPrompt: 'test prompt', assistantResponse: 'test response' },
      { provider: mockProvider },
    );

    expect(result.tokensUsed).toMatchObject({ total: 12, prompt: 8, completion: 4 });
  });
});
