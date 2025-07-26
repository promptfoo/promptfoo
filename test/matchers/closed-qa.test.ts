import { matchesClosedQa } from '../../src/matchers';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

import type { GradingConfig } from '../../src/types';

describe('matchesClosedQa', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    jest.spyOn(DefaultGradingProvider, 'callApi').mockReset();
    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: 'foo \n \n bar\n Y Y \n',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass when the closed QA check passes', async () => {
    const input = 'Input text';
    const expected = 'Expected output';
    const output = 'Sample output';
    const grading = {};

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
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

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValueOnce({
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

    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation(() => {
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
    jest.spyOn(DefaultGradingProvider, 'callApi').mockImplementation((prompt) => {
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

    jest.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      output: 'Y',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    });

    await matchesClosedQa(input, expected, output, grading);

    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Input {{ var }}'),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Expected {{ var }}'),
    );
    expect(DefaultGradingProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('Output {{ var }}'),
    );

    process.env.PROMPTFOO_DISABLE_TEMPLATING = undefined;
  });
});
