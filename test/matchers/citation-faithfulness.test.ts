import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesCitationFaithfulness } from '../../src/matchers/rag';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

describe('matchesCitationFaithfulness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const query = 'When was the Eiffel Tower completed and how tall is it?';
  // Passage [1] supports the height claim; passage [2] supports the completion-year claim.
  const context = [
    'The Eiffel Tower stands 330 metres tall in Paris.',
    'The Eiffel Tower was completed in 1889 for the World Fair.',
  ];

  it('fails the misattribution case: claim cited to a passage that does not support it', async () => {
    // The answer cites the completion year to passage [1], which only covers height.
    // The year is supported elsewhere (passage [2]), so ordinary faithfulness would pass,
    // but attribution-aware checking must fail.
    const output = 'The Eiffel Tower was completed in 1889 [1].';

    const mockCallApi = vi.fn().mockResolvedValue({
      output: JSON.stringify({
        verdict: 'unfaithful',
        reasoning:
          'The completion-year claim is cited to passage [1], which only states the height; passage [2] supports it instead.',
      }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(query, output, context, 1);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('passage [1]');
  });

  it('passes the correctly-cited case', async () => {
    const output = 'The Eiffel Tower is 330 metres tall [1] and was completed in 1889 [2].';

    const mockCallApi = vi.fn().mockResolvedValue({
      output: JSON.stringify({
        verdict: 'faithful',
        reasoning: 'Each citation marker points to a passage that supports its claim.',
      }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(query, output, context, 1);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toContain('supports its claim');
  });

  it('numbers array passages and tolerates JSON wrapped in prose', async () => {
    const output = 'The Eiffel Tower is 330 metres tall [1].';

    const mockCallApi = vi.fn().mockResolvedValue({
      output:
        'Here is my judgement: {"verdict": "faithful", "reasoning": "Passage 1 supports the height."} Done.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    const spy = vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(query, output, context, 1);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    // The rendered prompt must contain the numbered passages so [N] markers resolve.
    const renderedPrompt = spy.mock.calls[0][0] as string;
    expect(renderedPrompt).toContain('[1] The Eiffel Tower stands 330 metres tall');
    expect(renderedPrompt).toContain('[2] The Eiffel Tower was completed in 1889');
  });

  it('fails gracefully when the grader returns no parseable verdict', async () => {
    const output = 'The Eiffel Tower is 330 metres tall [1].';

    const mockCallApi = vi.fn().mockResolvedValue({
      output: 'I am not sure how to answer that.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(query, output, context, 1);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('valid verdict');
  });

  it('fails an answer with no [N] citation markers without calling the grader', async () => {
    const spy = vi.spyOn(DefaultGradingProvider, 'callApi');
    const result = await matchesCitationFaithfulness(
      query,
      'The Eiffel Tower is tall and old.',
      context,
      1,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('no [N] citation markers');
    expect(spy).not.toHaveBeenCalled();
  });

  it('tags a malformed grader response as graderError without echoing raw output', async () => {
    const secret = 'SENSITIVE PASSAGE TEXT';
    const mockCallApi = vi.fn().mockResolvedValue({
      output: secret, // not valid JSON
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(query, 'A claim [1].', context, 1);

    expect(result.pass).toBe(false);
    expect(result.reason).not.toContain(secret); // raw grader output not leaked
    expect((result as any).metadata?.graderError).toBe(true);
  });

  it('fails when the grading provider returns an error', async () => {
    const mockCallApi = vi.fn().mockResolvedValue({
      error: 'rate limited',
    });
    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(query, 'A claim [1].', context, 1);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('rate limited');
  });

  it('falls back to a default reason when the grader omits reasoning (unfaithful)', async () => {
    const mockCallApi = vi.fn().mockResolvedValue({
      output: JSON.stringify({ verdict: 'unfaithful' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(query, 'A claim [1].', context, 1);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('does not point to a passage');
  });

  it('falls back to a default reason when the grader omits reasoning (faithful)', async () => {
    const mockCallApi = vi.fn().mockResolvedValue({
      output: JSON.stringify({ verdict: 'FAITHFUL', reasoning: '   ' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(query, 'A claim [1].', context, 1);

    expect(result.pass).toBe(true);
    expect(result.reason).toContain('All citations point to passages');
  });

  it('accepts a single string context and a custom rubric prompt', async () => {
    const mockCallApi = vi.fn().mockResolvedValue({
      output: JSON.stringify({ verdict: 'faithful', reasoning: 'ok' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    const spy = vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(
      query,
      'The tower is tall [1].',
      'The Eiffel Tower stands 330 metres tall in Paris.',
      0.5,
      { rubricPrompt: 'Custom: {{question}} / {{answer}} / {{context}}' },
    );

    expect(result.pass).toBe(true);
    const renderedPrompt = spy.mock.calls[0][0] as string;
    expect(renderedPrompt).toContain('Custom:');
    // A single string context is passed through as-is (caller pre-numbers it).
    expect(renderedPrompt).toContain('The Eiffel Tower stands 330 metres tall in Paris.');
  });

  it('keeps the numbered context even when vars carries an unnumbered context', async () => {
    const output = 'The Eiffel Tower is 330 metres tall [1].';
    const mockCallApi = vi.fn().mockResolvedValue({
      output: JSON.stringify({ verdict: 'faithful', reasoning: 'ok' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    const spy = vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    // The grader receives `vars` including an unnumbered `context`; the numbered
    // passages must still win so [N] markers resolve.
    await matchesCitationFaithfulness(query, output, context, 1, undefined, {
      context: ['The Eiffel Tower stands 330 metres tall in Paris.'],
    });

    const renderedPrompt = spy.mock.calls[0][0] as string;
    expect(renderedPrompt).toContain('[1] The Eiffel Tower stands 330 metres tall');
    expect(renderedPrompt).toContain('[2] The Eiffel Tower was completed in 1889');
  });

  it('accepts a rubricPrompt provided as an array of message strings', async () => {
    const mockCallApi = vi.fn().mockResolvedValue({
      output: JSON.stringify({ verdict: 'faithful', reasoning: 'ok' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
    const spy = vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    const result = await matchesCitationFaithfulness(query, 'The tower is tall [1].', context, 1, {
      rubricPrompt: ['ArrayCustom: {{question}} {{context}}'],
    });

    expect(result.pass).toBe(true);
    const renderedPrompt = spy.mock.calls[0][0] as string;
    expect(renderedPrompt).toContain('ArrayCustom:');
  });
});
