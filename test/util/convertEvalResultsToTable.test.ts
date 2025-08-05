import { convertResultsToTable } from '../../src/util/convertEvalResultsToTable';

import type { CompletedPrompt, EvaluateTable, ResultsFile } from '../../src/types';

describe('convertResultsToTable', () => {
  it('should convert results to table format', () => {
    const resultsFile: ResultsFile = {
      version: 4,
      prompts: [
        {
          raw: 'test prompt',
          display: 'test prompt',
          id: 'prompt1',
        } as CompletedPrompt,
      ],
      results: {
        results: [
          {
            id: 'test1',
            testIdx: 0,
            promptIdx: 0,
            vars: {
              var1: 'value1',
              var2: 'value2',
            },
            prompt: {
              raw: 'test prompt',
              label: 'Test Prompt',
            },
            response: {
              output: 'test output',
            },
            provider: {
              id: 'test-provider',
              label: 'Test Provider',
            },
            success: true,
            promptId: 'prompt1',
            testCase: {},
            // @ts-ignore
            failureReason: 'none',
            score: 1,
            latencyMs: 100,
            namedScores: {},
          },
        ],
      },
    };

    const expected: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'test prompt',
            display: 'test prompt',
            id: 'prompt1',
          } as CompletedPrompt,
        ],
        vars: ['var1', 'var2'],
      },
      body: [
        {
          vars: ['value1', 'value2'],
          outputs: [
            {
              id: 'test1',
              text: 'test output',
              prompt: 'test prompt',
              provider: 'Test Provider',
              pass: true,
              cost: 0,
              success: true,
              response: {
                output: 'test output',
              },
              testCase: {},
              promptId: 'prompt1',
              score: 1,
              latencyMs: 100,
              namedScores: {},
              vars: {
                var1: 'value1',
                var2: 'value2',
              },
              audio: undefined,
              // @ts-ignore
              failureReason: 'none',
              promptIdx: 0,
              testIdx: 0,
            },
          ],
          testIdx: 0,
          test: {},
          description: undefined,
        },
      ],
    };

    const result = convertResultsToTable(resultsFile);
    expect(result).toEqual(expected);
  });

  it('should handle error responses', () => {
    const resultsFile: ResultsFile = {
      version: 4,
      prompts: [
        {
          raw: 'test prompt',
          display: 'test prompt',
          id: 'prompt1',
        } as CompletedPrompt,
      ],
      results: {
        results: [
          {
            id: 'test1',
            testIdx: 0,
            promptIdx: 0,
            prompt: {
              raw: 'test prompt',
              label: 'Test Prompt',
            },
            error: 'Test error',
            provider: {
              id: 'test-provider',
            },
            success: false,
            promptId: 'prompt1',
            testCase: {},
            vars: {},
            // @ts-ignore
            failureReason: 'provider_error',
            score: 0,
            latencyMs: 100,
            namedScores: {},
          },
        ],
      },
    };

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].outputs[0].text).toBe('Test error');
  });

  it('should handle assertion results', () => {
    const resultsFile: ResultsFile = {
      version: 4,
      prompts: [
        {
          raw: 'test prompt',
          display: 'test prompt',
          id: 'prompt1',
        } as CompletedPrompt,
      ],
      results: {
        results: [
          {
            id: 'test1',
            testIdx: 0,
            promptIdx: 0,
            prompt: {
              raw: 'test prompt',
              label: 'Test Prompt',
            },
            response: {
              output: 'test output',
            },
            testCase: {
              assert: [{ type: 'equals', value: 'expected' }],
            },
            gradingResult: {
              pass: false,
              score: 0,
              reason: 'Test failed',
              componentResults: [
                {
                  pass: false,
                  reason: 'Test failed',
                  score: 0,
                },
              ],
            },
            provider: {
              id: 'test-provider',
            },
            success: false,
            promptId: 'prompt1',
            vars: {},
            // @ts-ignore
            failureReason: 'assertion_failed',
            score: 0,
            latencyMs: 100,
            namedScores: {},
          },
        ],
      },
    };

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].outputs[0].text).toBe('Test failed\n---\ntest output');
  });

  it('should handle redteam final prompts', () => {
    const resultsFile: ResultsFile = {
      version: 4,
      prompts: [
        {
          raw: 'test prompt',
          display: 'test prompt',
          id: 'prompt1',
        } as CompletedPrompt,
      ],
      results: {
        results: [
          {
            id: 'test1',
            testIdx: 0,
            promptIdx: 0,
            vars: {
              prompt: 'original prompt',
            },
            metadata: {
              redteamFinalPrompt: 'modified prompt',
            },
            prompt: {
              raw: 'test prompt',
              label: 'Test Prompt',
            },
            provider: {
              id: 'test-provider',
            },
            success: true,
            promptId: 'prompt1',
            testCase: {},
            // @ts-ignore
            failureReason: 'none',
            score: 1,
            latencyMs: 100,
            namedScores: {},
          },
        ],
      },
    };

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].vars[0]).toBe('modified prompt');
  });

  it('should handle multiple redteam final prompts', () => {
    const resultsFile: ResultsFile = {
      version: 4,
      prompts: [
        {
          raw: 'test prompt',
          display: 'test prompt',
          id: 'prompt1',
        } as CompletedPrompt,
      ],
      results: {
        results: [
          {
            id: 'test1',
            testIdx: 0,
            promptIdx: 0,
            vars: {
              prompt: 'original prompt',
              query: 'original query',
              harmCategory: 'test',
            },
            metadata: {
              redteamFinalPrompt: 'modified prompt',
            },
            prompt: {
              raw: 'test prompt',
              label: 'Test Prompt',
            },
            provider: {
              id: 'test-provider',
            },
            success: true,
            promptId: 'prompt1',
            testCase: {},
            // @ts-ignore
            failureReason: 'none',
            score: 1,
            latencyMs: 100,
            namedScores: {},
          },
        ],
      },
    };

    const result = convertResultsToTable(resultsFile);
    const vars = result.body[0].vars;
    expect(vars).toEqual(['test', 'modified prompt', 'original query']);
  });

  it('should handle audio responses', () => {
    const resultsFile: ResultsFile = {
      version: 4,
      prompts: [
        {
          raw: 'test prompt',
          display: 'test prompt',
          id: 'prompt1',
        } as CompletedPrompt,
      ],
      results: {
        results: [
          {
            id: 'test1',
            testIdx: 0,
            promptIdx: 0,
            prompt: {
              raw: 'test prompt',
              label: 'Test Prompt',
            },
            response: {
              output: 'test output',
              audio: {
                id: 'audio1',
                expiresAt: 1748995200000, // 2025-06-01
                data: 'base64data',
                transcript: 'test transcript',
                format: 'mp3',
              },
            },
            provider: {
              id: 'test-provider',
            },
            success: true,
            promptId: 'prompt1',
            testCase: {},
            vars: {},
            // @ts-ignore
            failureReason: 'none',
            score: 1,
            latencyMs: 100,
            namedScores: {},
          },
        ],
      },
    };

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].outputs[0].audio).toEqual({
      id: 'audio1',
      expiresAt: 1748995200000,
      data: 'base64data',
      transcript: 'test transcript',
      format: 'mp3',
    });
  });
});
