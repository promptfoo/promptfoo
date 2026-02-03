import { describe, expect, it } from 'vitest';
import { convertResultsToTable } from '../../src/util/convertEvalResultsToTable';

import type { CompletedPrompt, EvaluateTable, ResultsFile } from '../../src/types/index';

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

  it('should handle null output by falling back to error', () => {
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
            vars: {},
            prompt: {
              raw: 'test prompt',
              label: 'Test Prompt',
            },
            response: {
              output: null,
            },
            error: 'Provider returned null',
            provider: {
              id: 'test-provider',
              label: 'Test Provider',
            },
            success: false,
            promptId: 'prompt1',
            testCase: {},
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
    expect(result.body[0].outputs[0].text).toBe('Provider returned null');
  });

  it('should preserve falsy var values like 0 and false', () => {
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
              var1: 0,
              var2: false,
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

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].vars).toEqual(['0', 'false']);
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
    expect(result.body[0].outputs[0].text).toBe('test output');
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

  it('should format object and array variables with pretty-printed JSON', () => {
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
              conversation: [
                { user: 'How do I work with you?' },
                { assistant: 'I can help you understand how to work with me.' },
                { user: 'Tell me more about NDAs' },
              ],
              simpleVar: 'This is a simple string',
              objectVar: { key1: 'value1', key2: 'value2' },
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

    const result = convertResultsToTable(resultsFile);
    const expectedConversation = JSON.stringify(
      [
        { user: 'How do I work with you?' },
        { assistant: 'I can help you understand how to work with me.' },
        { user: 'Tell me more about NDAs' },
      ],
      null,
      2,
    );
    const expectedObject = JSON.stringify({ key1: 'value1', key2: 'value2' }, null, 2);

    // Verify that object/array variables are formatted with pretty-printed JSON
    expect(result.body[0].vars[0]).toBe(expectedConversation);
    expect(result.body[0].vars[1]).toBe(expectedObject);
    expect(result.body[0].vars[2]).toBe('This is a simple string');

    // Verify that pretty-printed JSON has multiple lines
    expect(result.body[0].vars[0]).toContain('\n');
    expect(result.body[0].vars[1]).toContain('\n');
  });

  it('should copy sessionId from metadata to vars when vars.sessionId is not present', () => {
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
              question: 'What is AI?',
            },
            metadata: {
              sessionId: 'session-123',
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
    // sessionId should be copied from metadata to vars
    expect(result.head.vars).toContain('sessionId');
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('session-123');
  });

  it('should not overwrite user-set vars.sessionId with metadata.sessionId', () => {
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
              sessionId: 'user-session-456',
              question: 'What is AI?',
            },
            metadata: {
              sessionId: 'provider-session-123',
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
    // User-set sessionId should be preserved, not overwritten
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('user-session-456');
  });

  it('should handle empty vars.sessionId by populating from metadata.sessionId', () => {
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
              sessionId: '',
              question: 'What is AI?',
            },
            metadata: {
              sessionId: 'session-789',
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
    // Empty sessionId should be populated from metadata
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('session-789');
  });

  it('should not crash when metadata is missing', () => {
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
              question: 'What is AI?',
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

    // Should not throw
    const result = convertResultsToTable(resultsFile);
    expect(result.head.vars).toEqual(['question']);
  });

  it('should create vars object if missing when populating sessionId from metadata', () => {
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
            metadata: {
              sessionId: 'session-abc',
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
    // sessionId should be added even when vars was initially undefined
    expect(result.head.vars).toContain('sessionId');
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('session-abc');
  });

  it('should handle multiple results with varying sessionId configurations', () => {
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
          // Result 0: Only metadata.sessionId (should copy to vars)
          {
            id: 'test1',
            testIdx: 0,
            promptIdx: 0,
            vars: {
              question: 'Question 1',
            },
            metadata: {
              sessionId: 'metadata-session-1',
            },
            prompt: { raw: 'test prompt', label: 'Test Prompt' },
            response: { output: 'output 1' },
            provider: { id: 'test-provider' },
            success: true,
            promptId: 'prompt1',
            testCase: {},
            // @ts-ignore
            failureReason: 'none',
            score: 1,
            latencyMs: 100,
            namedScores: {},
          },
          // Result 1: Only vars.sessionId (should preserve)
          {
            id: 'test2',
            testIdx: 1,
            promptIdx: 0,
            vars: {
              question: 'Question 2',
              sessionId: 'user-session-2',
            },
            prompt: { raw: 'test prompt', label: 'Test Prompt' },
            response: { output: 'output 2' },
            provider: { id: 'test-provider' },
            success: true,
            promptId: 'prompt1',
            testCase: {},
            // @ts-ignore
            failureReason: 'none',
            score: 1,
            latencyMs: 100,
            namedScores: {},
          },
          // Result 2: Both metadata and vars sessionId (should preserve vars)
          {
            id: 'test3',
            testIdx: 2,
            promptIdx: 0,
            vars: {
              question: 'Question 3',
              sessionId: 'user-session-3',
            },
            metadata: {
              sessionId: 'metadata-session-3',
            },
            prompt: { raw: 'test prompt', label: 'Test Prompt' },
            response: { output: 'output 3' },
            provider: { id: 'test-provider' },
            success: true,
            promptId: 'prompt1',
            testCase: {},
            // @ts-ignore
            failureReason: 'none',
            score: 1,
            latencyMs: 100,
            namedScores: {},
          },
          // Result 3: Neither metadata nor vars sessionId
          {
            id: 'test4',
            testIdx: 3,
            promptIdx: 0,
            vars: {
              question: 'Question 4',
            },
            prompt: { raw: 'test prompt', label: 'Test Prompt' },
            response: { output: 'output 4' },
            provider: { id: 'test-provider' },
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

    // sessionId column should exist (added by results that have it)
    expect(result.head.vars).toContain('sessionId');
    const sessionIdIndex = result.head.vars.indexOf('sessionId');

    // Result 0: metadata.sessionId copied to vars
    expect(result.body[0].vars[sessionIdIndex]).toBe('metadata-session-1');

    // Result 1: user-set vars.sessionId preserved
    expect(result.body[1].vars[sessionIdIndex]).toBe('user-session-2');

    // Result 2: user-set vars.sessionId preserved (not overwritten by metadata)
    expect(result.body[2].vars[sessionIdIndex]).toBe('user-session-3');

    // Result 3: no sessionId (empty string in the column)
    expect(result.body[3].vars[sessionIdIndex]).toBe('');
  });

  describe('showVars filtering', () => {
    it('should show all vars when showVars is not provided (default behavior)', () => {
      const resultsFile: ResultsFile = {
        version: 4,
        config: {}, // No defaultTest, so no showVars
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
                language: 'Spanish',
                input: 'Hello',
                sessionId: 'abc-123',
              },
              prompt: {
                raw: 'test prompt',
                label: 'Test Prompt',
              },
              response: {
                output: 'Hola',
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
      expect(result.head.vars).toEqual(['input', 'language', 'sessionId']); // All vars shown, sorted
      expect(result.body[0].vars).toHaveLength(3);
    });

    it('should filter vars when showVars is provided', () => {
      const resultsFile: ResultsFile = {
        version: 4,
        config: {
          defaultTest: {
            options: {
              showVars: ['language', 'input'], // Hide sessionId
            },
          },
        },
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
                language: 'Spanish',
                input: 'Hello',
                sessionId: 'abc-123',
              },
              prompt: {
                raw: 'test prompt',
                label: 'Test Prompt',
              },
              response: {
                output: 'Hola',
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
      expect(result.head.vars).toEqual(['input', 'language']); // Only showVars shown, sorted
      expect(result.body[0].vars).toHaveLength(2);
      expect(result.body[0].vars).toEqual(['Hello', 'Spanish']);
    });

    it('should show all vars when showVars is empty array', () => {
      const resultsFile: ResultsFile = {
        version: 4,
        config: {
          defaultTest: {
            options: {
              showVars: [], // Empty array = show all
            },
          },
        },
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
                language: 'Spanish',
                input: 'Hello',
              },
              prompt: {
                raw: 'test prompt',
                label: 'Test Prompt',
              },
              response: {
                output: 'Hola',
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
      expect(result.head.vars).toEqual(['input', 'language']); // All vars shown
      expect(result.body[0].vars).toHaveLength(2);
    });

    it('should handle showVars with vars that do not exist', () => {
      const resultsFile: ResultsFile = {
        version: 4,
        config: {
          defaultTest: {
            options: {
              showVars: ['language', 'nonexistent'], // nonexistent var ignored
            },
          },
        },
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
                language: 'Spanish',
                input: 'Hello',
              },
              prompt: {
                raw: 'test prompt',
                label: 'Test Prompt',
              },
              response: {
                output: 'Hola',
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
      expect(result.head.vars).toEqual(['language']); // Only existing vars from showVars
      expect(result.body[0].vars).toEqual(['Spanish']);
    });
  });
});
