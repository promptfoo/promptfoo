import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesClosedQa } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

import type { GradingConfig } from '../../src/types/index';

describe('matchesClosedQa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    vi.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: 'foo \n \n bar\n Y Y \n',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass when the closed QA check passes', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: 'foo \n \n bar\n Y Y \n',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await expect(matchesClosedQa(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason: 'The submission meets the criterion:\nfoo \n \n bar\n Y Y \n',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
  });

  it('should fail when the closed QA check fails', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
      output: 'foo bar N \n',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await expect(matchesClosedQa(input, expected, output, grading)).resolves.toEqual({
      pass: false,
      reason: 'The submission does not meet the criterion:\nfoo bar N \n',
      score: 0,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
  });

  it('should throw an error when an error occurs', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(() => {
      throw new Error('An error occurred');
    });

    await expect(matchesClosedQa(input, expected, output, grading)).rejects.toThrow(
      'An error occurred',
    );
  });

  it('should handle input, criteria, and completion that need escaping', async () => {
    const input = 'Input "text" with \\ escape characters and \\"nested\\" escapes';
    const expected = 'Expected "output" with \\\\ escape characters and \\"nested\\" escapes';
    const output = 'Sample "output" with \\\\ escape characters and \\"nested\\" escapes';
    const grading = {};

    let isJson = false;
    vi.spyOn(DefaultGradingProvider, 'callApi').mockImplementation((prompt) => {
      try {
        JSON.parse(prompt);
        isJson = true;
      } catch {
        isJson = false;
      }
      return Promise.resolve({
        output: 'foo \n \n bar\n Y Y',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });
    });
    await expect(matchesClosedQa(input, expected, output, grading)).resolves.toEqual({
      pass: true,
      reason: 'The submission meets the criterion:\nfoo \n \n bar\n Y Y',
      score: 1,
      tokensUsed: {
        total: expect.any(Number),
        prompt: expect.any(Number),
        completion: expect.any(Number),
        cached: expect.any(Number),
        completionDetails: expect.any(Object),
        numRequests: 0,
      },
    });
    expect(isJson).toBeTruthy();
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
      output: 'Y',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await matchesClosedQa(input, expected, output, grading);

    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Input {{ var }}'),
      expect.any(Object),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Expected {{ var }}'),
      expect.any(Object),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Output {{ var }}'),
      expect.any(Object),
    );

    process.env.PROMPTFOO_DISABLE_TEMPLATING = undefined;
  });

  it('should correctly substitute variables in custom rubricPrompt', async () => {
    const input = 'What is the largest ocean?';
    const expected = 'Pacific Ocean';
    const output = 'The largest ocean is the Pacific Ocean.';

    const customPrompt = `Compare these answers:
Question: {{input}}
Criteria: {{criteria}}
Answer: {{completion}}

Does the answer meet the criteria? Answer Y or N.`;

    const mockCallApi = vi.fn().mockResolvedValue({
      output: 'Y',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    const grading = {
      rubricPrompt: customPrompt,
      provider: {
        id: () => 'test-provider',
        callApi: mockCallApi,
      },
    };

    const result = await matchesClosedQa(input, expected, output, grading);

    expect(result).toEqual({
      pass: true,
      reason: expect.any(String),
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
    expect(actualPrompt).toContain('Question: What is the largest ocean?');
    expect(actualPrompt).toContain('Criteria: Pacific Ocean');
    expect(actualPrompt).toContain('Answer: The largest ocean is the Pacific Ocean.');
    expect(actualPrompt).not.toContain('{{input}}');
    expect(actualPrompt).not.toContain('{{criteria}}');
    expect(actualPrompt).not.toContain('{{completion}}');
  });
});
