import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesFactuality } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

import type { GradingConfig } from '../../src/types/index';

describe('matchesFactuality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output:
        '(A) The submitted answer is a subset of the expert answer and is fully consistent with it.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass when the factuality check passes with legacy format', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    const mockCallApi = vi.fn().mockResolvedValue({
      output:
        '(A) The submitted answer is a subset of the expert answer and is fully consistent with it.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason:
        'The submitted answer is a subset of the expert answer and is fully consistent with it.',
      score: 1,
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });
  });

  it('should pass when the factuality check passes with JSON format', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    const mockCallApi = vi.fn().mockResolvedValue({
      output:
        '{"category": "A", "reason": "The submitted answer is a subset of the expert answer and is fully consistent with it."}',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason:
        'The submitted answer is a subset of the expert answer and is fully consistent with it.',
      score: 1,
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });
  });

  it('should fall back to pattern match response', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    const mockCallApi = vi.fn().mockResolvedValue({
      output: '(A) This is a custom reason for category A.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason: 'This is a custom reason for category A.',
      score: 1,
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });
  });

  it('should fail when the factuality check fails with legacy format', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    const mockCallApi = vi.fn().mockResolvedValue({
      output: '(D) There is a disagreement between the submitted answer and the expert answer.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: false,
      reason: 'There is a disagreement between the submitted answer and the expert answer.',
      score: 0,
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });
  });

  it('should fail when the factuality check fails with JSON format', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    const mockCallApi = vi.fn().mockResolvedValue({
      output:
        '{"category": "D", "reason": "There is a disagreement between the submitted answer and the expert answer."}',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: false,
      reason: 'There is a disagreement between the submitted answer and the expert answer.',
      score: 0,
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });
  });

  it('should use the overridden factuality grading config', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {
      factuality: {
        subset: 0.8,
        superset: 0.9,
        agree: 1,
        disagree: 0,
        differButFactual: 0.7,
      },
    };

    const mockCallApi = vi.fn().mockResolvedValue({
      output:
        '{"category": "A", "reason": "The submitted answer is a subset of the expert answer and is fully consistent with it."}',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason:
        'The submitted answer is a subset of the expert answer and is fully consistent with it.',
      score: 0.8,
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });
  });

  it('should use category description as fallback when no reason is provided in JSON', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    const mockCallApi = vi.fn().mockResolvedValue({
      output: '{"category": "A"}',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason:
        'Category A: The submitted answer is a subset of the expert answer and is fully consistent with it.',
      score: 1,
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });
  });

  it('should fail when JSON has invalid category', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    const mockCallApi = vi.fn().mockResolvedValue({
      output: '{"category": "Z", "reason": "Invalid category"}',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(mockCallApi);

    await expect(matchesFactuality(input, expected, output, grading)).resolves.toEqual({
      pass: false,
      score: 0,
      reason: 'Invalid category value: Z',
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });
  });

  it('should use custom prompt override when provided', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';

    const customPrompt = JSON.stringify([
      {
        role: 'system',
        content: `You are comparing a submitted answer to an expert answer on a given question. Here is the data:
[BEGIN DATA]
************
[Question]: {{input}}
************
[Expert]: {{ideal}}
************
[Submission]: {{completion}}
************
[END DATA]

Compare the factual content of the submitted answer with the expert answer. Ignore any differences in style, grammar, or punctuation.
The submitted answer may either be a subset or superset of the expert answer, or it may conflict with it. Determine which case applies. Answer the question by selecting one of the following options:
(A) The submitted answer is a subset of the expert answer and is fully consistent with it.
(B) The submitted answer is a superset of the expert answer and is fully consistent with it.
(C) The submitted answer contains all the same details as the expert answer.
(D) There is a disagreement between the submitted answer and the expert answer.
(E) The answers differ, but these differences don't matter from the perspective of factuality.`,
      },
    ]);

    const mockCallApi = vi.fn().mockResolvedValue({
      output: '(B) The submitted answer is a superset of the expert answer.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const grading = {
      rubricPrompt: customPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: mockCallApi,
      },
    };

    const result = await matchesFactuality(input, expected, output, grading);

    expect(result).toEqual({
      pass: true,
      reason: 'The submitted answer is a superset of the expert answer.',
      score: 1,
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });

    // Verify the custom prompt was used
    expect(mockCallApi).toHaveBeenCalledWith(
      expect.stringContaining(
        'The submitted answer may either be a subset or superset of the expert answer',
      ),
      expect.any(Object),
    );
  });

  it('should throw an error when an error occurs', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(() => {
      throw new Error('An error occurred');
    });

    await expect(matchesFactuality(input, expected, output, grading)).rejects.toThrow(
      'An error occurred',
    );
  });

  it('should use Nunjucks templating when PROMPTFOO_DISABLE_TEMPLATING is set', async () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const input = 'Input {{ var }}';
    const expected = 'Expected {{ var }}';
    const output = 'Output {{ var }}';
    const grading: GradingConfig = {
      provider: DefaultGradingProvider,
    };

    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: '{"category": "A", "reason": "The submitted answer is correct."}',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await matchesFactuality(input, expected, output, grading);

    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        vars: expect.objectContaining({
          input: 'Input {{ var }}',
          ideal: 'Expected {{ var }}',
          completion: 'Output {{ var }}',
        }),
      }),
    );

    process.env.PROMPTFOO_DISABLE_TEMPLATING = undefined;
  });

  it('should correctly substitute variables in custom rubricPrompt', async () => {
    const input = 'What is the capital of France?';
    const expected = 'Paris';
    const output = 'The capital of France is Paris.';

    const customPrompt = `Compare these answers:
Question: {{input}}
Reference: {{ideal}}
Submitted: {{completion}}

Determine if submitted answer is factually correct.
Choose: (A) subset, (B) superset, (C) same, (D) disagree, (E) differ but factual`;

    const mockCallApi = vi.fn().mockResolvedValue({
      output: '(A) The submitted answer is correct.',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const grading = {
      rubricPrompt: customPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: mockCallApi,
      },
    };

    const result = await matchesFactuality(input, expected, output, grading);

    expect(result).toEqual({
      pass: true,
      reason: 'The submitted answer is correct.',
      score: 1,
      tokensUsed: expect.objectContaining({
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    });

    // Verify all variables were substituted in the prompt
    expect(mockCallApi).toHaveBeenCalledTimes(1);
    const actualPrompt = mockCallApi.mock.calls[0][0];
    expect(actualPrompt).toContain('Question: What is the capital of France?');
    expect(actualPrompt).toContain('Reference: Paris');
    expect(actualPrompt).toContain('Submitted: The capital of France is Paris.');
    expect(actualPrompt).not.toContain('{{input}}');
    expect(actualPrompt).not.toContain('{{ideal}}');
    expect(actualPrompt).not.toContain('{{completion}}');
  });
});
