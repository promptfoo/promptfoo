import { type ResultsFile, ResultFailureReason, type EvaluateResult } from '../../src/types';
import { convertResultsToTable } from '../../src/util/convertEvalResultsToTable';

describe('convertResultsToTable', () => {
  it('should convert results to table format', () => {
    const results: ResultsFile = {
      version: 4,
      createdAt: new Date().toISOString(),
      config: {},
      author: 'test',
      prompts: [
        {
          raw: 'test prompt 1',
          display: 'test prompt 1',
          provider: 'test-provider',
          label: 'Test Prompt 1',
          metrics: {
            cost: 0,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
              assertions: {
                total: 0,
                prompt: 0,
                completion: 0,
                cached: 0,
                numRequests: 0,
                completionDetails: {
                  reasoning: 0,
                  acceptedPrediction: 0,
                  rejectedPrediction: 0,
                },
              },
            },
            score: 0,
            testPassCount: 0,
            testFailCount: 0,
            testErrorCount: 0,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            namedScores: {},
            namedScoresCount: {},
          },
        },
      ],
      results: {
        version: 2,
        timestamp: new Date().toISOString(),
        stats: {
          successes: 1,
          failures: 0,
          errors: 0,
          tokenUsage: {
            total: 10,
            prompt: 5,
            completion: 5,
            cached: 0,
            numRequests: 1,
            completionDetails: {
              reasoning: 0,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
            },
            assertions: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            },
          },
        },
        table: {
          head: {
            prompts: [],
            vars: [],
          },
          body: [],
        },
        results: [
          {
            id: 'test-1',
            testIdx: 0,
            promptIdx: 0,
            promptId: 'prompt-1',
            provider: {
              id: 'test-provider',
              label: 'Test Provider',
            },
            prompt: {
              raw: 'test prompt 1',
              display: 'test prompt 1',
              label: 'Test Prompt 1',
            },
            response: {
              output: 'test output',
              tokenUsage: {
                total: 10,
                prompt: 5,
                completion: 5,
                cached: 0,
              },
            },
            success: true,
            score: 1,
            latencyMs: 100,
            cost: 0.01,
            vars: {
              var1: 'test1',
              var2: 'test2',
            },
            testCase: {
              vars: {
                var1: 'test1',
                var2: 'test2',
              },
            },
            failureReason: ResultFailureReason.NONE,
            namedScores: {},
          } as EvaluateResult,
        ],
      },
    };

    const table = convertResultsToTable(results);

    expect(table.head.prompts).toHaveLength(1);
    expect(table.head.vars).toEqual(['var1', 'var2']);
    expect(table.body).toHaveLength(1);
    expect(table.body[0].outputs[0].text).toBe('test output');
  });

  it('should handle results with errors', () => {
    const results: ResultsFile = {
      version: 4,
      createdAt: new Date().toISOString(),
      config: {},
      author: 'test',
      prompts: [
        {
          raw: 'test prompt 1',
          display: 'test prompt 1',
          provider: 'test-provider',
          label: 'Test Prompt 1',
          metrics: {
            cost: 0,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
              assertions: {
                total: 0,
                prompt: 0,
                completion: 0,
                cached: 0,
                numRequests: 0,
                completionDetails: {
                  reasoning: 0,
                  acceptedPrediction: 0,
                  rejectedPrediction: 0,
                },
              },
            },
            score: 0,
            testPassCount: 0,
            testFailCount: 0,
            testErrorCount: 0,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            namedScores: {},
            namedScoresCount: {},
          },
        },
      ],
      results: {
        version: 2,
        timestamp: new Date().toISOString(),
        stats: {
          successes: 0,
          failures: 0,
          errors: 1,
          tokenUsage: {
            total: 0,
            prompt: 0,
            completion: 0,
            cached: 0,
            numRequests: 0,
            completionDetails: {
              reasoning: 0,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
            },
            assertions: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            },
          },
        },
        table: {
          head: {
            prompts: [],
            vars: [],
          },
          body: [],
        },
        results: [
          {
            id: 'test-1',
            testIdx: 0,
            promptIdx: 0,
            promptId: 'prompt-1',
            provider: {
              id: 'test-provider',
              label: 'Test Provider',
            },
            prompt: {
              raw: 'test prompt 1',
              display: 'test prompt 1',
              label: 'Test Prompt 1',
            },
            error: 'Test error',
            success: false,
            failureReason: ResultFailureReason.ERROR,
            score: 0,
            vars: {},
            latencyMs: 0,
            namedScores: {},
            testCase: {
              vars: {},
            },
          } as EvaluateResult,
        ],
      },
    };

    const table = convertResultsToTable(results);
    expect(table.body[0].outputs[0].text).toBe('Test error');
    expect(table.body[0].outputs[0].pass).toBe(false);
  });

  it('should filter output vars when specified in options', () => {
    const results: ResultsFile = {
      version: 4,
      createdAt: new Date().toISOString(),
      config: {},
      author: 'test',
      prompts: [
        {
          raw: 'test prompt 1',
          display: 'test prompt 1',
          provider: 'test-provider',
          label: 'Test Prompt 1',
          metrics: {
            cost: 0,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
              assertions: {
                total: 0,
                prompt: 0,
                completion: 0,
                cached: 0,
                numRequests: 0,
                completionDetails: {
                  reasoning: 0,
                  acceptedPrediction: 0,
                  rejectedPrediction: 0,
                },
              },
            },
            score: 0,
            testPassCount: 0,
            testFailCount: 0,
            testErrorCount: 0,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            namedScores: {},
            namedScoresCount: {},
          },
        },
      ],
      results: {
        version: 2,
        timestamp: new Date().toISOString(),
        stats: {
          successes: 1,
          failures: 0,
          errors: 0,
          tokenUsage: {
            total: 0,
            prompt: 0,
            completion: 0,
            cached: 0,
            numRequests: 0,
            completionDetails: {
              reasoning: 0,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
            },
            assertions: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            },
          },
        },
        table: {
          head: {
            prompts: [],
            vars: [],
          },
          body: [],
        },
        results: [
          {
            id: 'test-1',
            testIdx: 0,
            promptIdx: 0,
            promptId: 'prompt-1',
            provider: {
              id: 'test-provider',
              label: 'Test Provider',
            },
            prompt: {
              raw: 'test prompt 1',
              display: 'test prompt 1',
              label: 'Test Prompt 1',
            },
            vars: {
              var1: 'test1',
              var2: 'test2',
              var3: 'test3',
            },
            success: true,
            score: 0,
            latencyMs: 0,
            failureReason: ResultFailureReason.NONE,
            namedScores: {},
            testCase: {
              vars: {
                var1: 'test1',
                var2: 'test2',
                var3: 'test3',
              },
            },
          } as EvaluateResult,
        ],
      },
    };

    const table = convertResultsToTable(results, {
      outputVars: ['var1', 'var3'],
    });

    expect(table.head.vars).toEqual(['var1', 'var3']);
    expect(table.body[0].vars).toEqual(['test1', 'test3']);
  });

  it('should throw error if prompts are missing', () => {
    const results: ResultsFile = {
      version: 4,
      createdAt: new Date().toISOString(),
      config: {},
      author: 'test',
      results: {
        version: 2,
        timestamp: new Date().toISOString(),
        stats: {
          successes: 0,
          failures: 0,
          errors: 0,
          tokenUsage: {
            total: 0,
            prompt: 0,
            completion: 0,
            cached: 0,
            numRequests: 0,
            completionDetails: {
              reasoning: 0,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
            },
            assertions: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            },
          },
        },
        table: {
          head: {
            prompts: [],
            vars: [],
          },
          body: [],
        },
        results: [],
      },
    };

    expect(() => convertResultsToTable(results)).toThrow(
      'Prompts are required in this version of the results file',
    );
  });
});
