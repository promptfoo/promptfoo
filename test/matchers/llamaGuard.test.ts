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

  it('should build the classification prompt as user and assistant chat turns', async () => {
    const mockProvider = createMockProvider({ response: { output: 'safe' } });

    await matchesLlamaGuard(
      { userPrompt: 'Is this ok?', assistantResponse: 'Sure, here you go.' },
      { provider: mockProvider },
    );

    expect(mockProvider.callApi).toHaveBeenCalledWith(
      JSON.stringify([
        { role: 'user', content: 'Is this ok?' },
        { role: 'assistant', content: 'Sure, here you go.' },
      ]),
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

describe('matchesLlamaGuard safety hardening', () => {
  it('treats an unsafe verdict with no parseable codes as a grader failure, not a pass', async () => {
    // Regression: `unsafe` with no second line previously fell into the
    // "no relevant categories" branch and passed, hiding a positive detection.
    const result = await matchesLlamaGuard(
      { userPrompt: 'p', assistantResponse: 'harmful' },
      { provider: createMockProvider({ response: { output: 'unsafe' } }) },
    );

    expect(result.pass).toBe(false);
    expect(result.metadata).toMatchObject({ graderError: true });
    expect(result.reason).toContain('unparseable verdict');
  });

  it('treats unrecognized grader prose as a grader failure', async () => {
    const result = await matchesLlamaGuard(
      { userPrompt: 'p', assistantResponse: 'harmful' },
      { provider: createMockProvider({ response: { output: 'I cannot classify this' } }) },
    );

    expect(result.pass).toBe(false);
    expect(result.metadata).toMatchObject({ graderError: true });
  });

  it('fails an unfiltered unsafe verdict whose category is unknown to us', async () => {
    // A future taxonomy addition (e.g. S15) must not pass just because we do not
    // recognize the code.
    const result = await matchesLlamaGuard(
      { userPrompt: 'p', assistantResponse: 'harmful' },
      { provider: createMockProvider({ response: { output: 'unsafe\nS15' } }) },
    );

    expect(result.pass).toBe(false);
    expect(result.metadata?.violatedCategories).toEqual(['S15']);
    expect(result.metadata?.unknownCategories).toEqual(['S15']);
  });

  it('rejects an unrecognized configured category code instead of failing open', async () => {
    // `S01` is a typo for `S1`; filtering on it would remove every real violation.
    await expect(
      matchesLlamaGuard(
        { userPrompt: 'p', assistantResponse: 'harmful', categories: ['S01'] },
        { provider: createMockProvider({ response: { output: 'unsafe\nS1' } }) },
      ),
    ).rejects.toThrow(/Unknown LlamaGuard category code\(s\): S01/);
  });

  it('sends distinct user and assistant turns rather than one flattened message', async () => {
    // Chat providers wrap an unparseable string in a single user message, which would
    // leave LlamaGuard without an assistant turn to classify.
    const mockProvider = createMockProvider({ response: { output: 'safe' } });
    await matchesLlamaGuard(
      { userPrompt: 'Is this ok?', assistantResponse: 'Sure, here you go.' },
      { provider: mockProvider },
    );

    const sent = JSON.parse(mockProvider.callApi.mock.calls[0][0] as string);
    expect(sent).toEqual([
      { role: 'user', content: 'Is this ok?' },
      { role: 'assistant', content: 'Sure, here you go.' },
    ]);
  });

  it('preserves every turn of a multi-turn conversation', async () => {
    // Multi-turn redteam strategies build harmful context across turns; dropping
    // earlier turns hides the attack from the classifier.
    const mockProvider = createMockProvider({ response: { output: 'unsafe\nS1' } });
    await matchesLlamaGuard(
      {
        userPrompt: 'continue',
        assistantResponse: 'Here is the rest.',
        conversation: [
          { role: 'user', content: 'set up harmful context' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'continue' },
        ],
      },
      { provider: mockProvider },
    );

    const sent = JSON.parse(mockProvider.callApi.mock.calls[0][0] as string);
    expect(sent).toHaveLength(4);
    expect(sent[0]).toEqual({ role: 'user', content: 'set up harmful context' });
    expect(sent[3]).toEqual({ role: 'assistant', content: 'Here is the rest.' });
  });
});
