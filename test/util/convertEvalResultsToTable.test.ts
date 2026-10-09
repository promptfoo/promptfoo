import { describe, expect, it, vi } from 'vitest';
import { convertResultsToTable } from '../../src/util/convertEvalResultsToTable';
import { createCompletedPrompt } from '../factories/eval';

import type { EvaluateResult, EvaluateTable, ResultsFile } from '../../src/types/index';

// These legacy fixtures intentionally omit unrelated summary/file metadata.
function createResultsFile(
  results: EvaluateResult[],
  overrides: Partial<ResultsFile> = {},
): ResultsFile {
  return {
    version: 4,
    prompts: [createCompletedPrompt('test prompt', { display: 'test prompt', id: 'prompt1' })],
    results: { results },
    ...overrides,
  } as ResultsFile;
}

function createResult(overrides: Partial<EvaluateResult>): EvaluateResult {
  return {
    id: 'test1',
    testIdx: 0,
    promptIdx: 0,
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
    score: 1,
    latencyMs: 100,
    namedScores: {},
    ...overrides,
  } as EvaluateResult;
}

describe('convertResultsToTable', () => {
  it('should convert results to table format', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
        response: {
          output: 'test output',
        },
        provider: {
          id: 'test-provider',
          label: 'Test Provider',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const expected: EvaluateTable = {
      head: {
        prompts: [createCompletedPrompt('test prompt', { display: 'test prompt', id: 'prompt1' })],
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
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        error: 'Test error',
        success: false,
        vars: {},
        // @ts-ignore
        failureReason: 'provider_error',
        score: 0,
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].outputs[0].text).toBe('Test error');
  });

  it('should handle null output by falling back to error', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {},
        response: {
          output: null,
        },
        error: 'Provider returned null',
        provider: {
          id: 'test-provider',
          label: 'Test Provider',
        },
        success: false,
        // @ts-ignore
        failureReason: 'provider_error',
        score: 0,
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].outputs[0].text).toBe('Provider returned null');
  });

  it('should preserve falsy var values like 0 and false', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          var1: 0,
          var2: false,
        },
        response: {
          output: 'test output',
        },
        provider: {
          id: 'test-provider',
          label: 'Test Provider',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].vars).toEqual(['0', 'false']);
  });

  it('should handle assertion results', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
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
        success: false,
        vars: {},
        // @ts-ignore
        failureReason: 'assertion_failed',
        score: 0,
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].outputs[0].text).toBe('test output');
  });

  it('should handle redteam final prompts', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          prompt: 'original prompt',
        },
        metadata: {
          redteamFinalPrompt: 'modified prompt',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].vars[0]).toBe('modified prompt');
  });

  it('should handle multiple redteam final prompts', () => {
    const resultsFile: ResultsFile = createResultsFile(
      [
        createResult({
          vars: {
            prompt: 'original prompt',
            query: 'original query',
            harmCategory: 'test',
          },
          metadata: {
            redteamFinalPrompt: 'modified prompt',
          },
          // @ts-ignore
          failureReason: 'none',
        }),
      ],
      { vars: ['prompt', 'query', 'harmCategory'] },
    );

    const result = convertResultsToTable(resultsFile);
    const vars = result.body[0].vars;
    // Persisted config order should be preserved; see #244, #1320.
    expect(result.head.vars).toEqual(['prompt', 'query', 'harmCategory']);
    expect(vars).toEqual(['modified prompt', 'original query', 'test']);
  });

  it('should handle audio responses', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
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
        vars: {},
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    expect(result.body[0].outputs[0].audio).toEqual({
      id: 'audio1',
      expiresAt: 1748995200000,
      data: 'base64data',
      transcript: 'test transcript',
      format: 'mp3',
    });
  });

  it('preserves inline and blob-backed images in table cells without mutating the response', () => {
    const images = [
      { data: 'data:image/png;base64,aW1hZ2U=', mimeType: 'image/png' },
      {
        blobRef: {
          uri: 'promptfoo://blob/image-hash',
          hash: 'image-hash',
          mimeType: 'image/webp',
          sizeBytes: 128,
          provider: 'filesystem',
        },
        mimeType: 'image/webp',
      },
    ];
    const audio = { id: 'audio1', data: 'YXVkaW8=', format: 'mp3', transcript: 'Image summary' };
    const response = { output: 'Generated images', images, audio };
    const originalResponse = structuredClone(response);
    const resultsFile = createResultsFile([createResult({ response, vars: {} })]);

    const cell = convertResultsToTable(resultsFile).body[0].outputs[0];

    expect(cell.text).toBe('Generated images');
    expect(cell.images).toEqual(images);
    expect(cell.audio).toEqual(audio);
    expect(cell.images).not.toBe(images);
    expect(cell.images?.[0]).not.toBe(images[0]);
    expect(response).toEqual(originalResponse);
  });

  it('should format object and array variables with pretty-printed JSON', () => {
    const resultsFile: ResultsFile = createResultsFile(
      [
        createResult({
          vars: {
            conversation: [
              { user: 'How do I work with you?' },
              { assistant: 'I can help you understand how to work with me.' },
              { user: 'Tell me more about NDAs' },
            ],
            simpleVar: 'This is a simple string',
            objectVar: { key1: 'value1', key2: 'value2' },
          },
          response: {
            output: 'test output',
          },
          provider: {
            id: 'test-provider',
            label: 'Test Provider',
          },
          // @ts-ignore
          failureReason: 'none',
        }),
      ],
      { vars: ['conversation', 'simpleVar', 'objectVar'] },
    );

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

    // Persisted config order should be preserved; see #244, #1320.
    expect(result.head.vars).toEqual(['conversation', 'simpleVar', 'objectVar']);
    expect(result.body[0].vars[0]).toBe(expectedConversation);
    expect(result.body[0].vars[1]).toBe('This is a simple string');
    expect(result.body[0].vars[2]).toBe(expectedObject);

    // Verify that pretty-printed JSON has multiple lines
    expect(result.body[0].vars[0]).toContain('\n');
    expect(result.body[0].vars[2]).toContain('\n');
  });

  it('should copy sessionId from metadata to vars when vars.sessionId is not present', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          question: 'What is AI?',
        },
        metadata: {
          sessionId: 'session-123',
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // sessionId should be copied from metadata to vars
    expect(result.head.vars).toContain('sessionId');
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('session-123');
  });

  it('should not overwrite user-set vars.sessionId with metadata.sessionId', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          sessionId: 'user-session-456',
          question: 'What is AI?',
        },
        metadata: {
          sessionId: 'provider-session-123',
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // User-set sessionId should be preserved, not overwritten
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('user-session-456');
  });

  it('should handle empty vars.sessionId by populating from metadata.sessionId', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          sessionId: '',
          question: 'What is AI?',
        },
        metadata: {
          sessionId: 'session-789',
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // Empty sessionId should be populated from metadata
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('session-789');
  });

  it('should not crash when metadata is missing', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          question: 'What is AI?',
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    // Should not throw
    const result = convertResultsToTable(resultsFile);
    expect(result.head.vars).toEqual(['question']);
  });

  it('should create vars object if missing when populating sessionId from metadata', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        metadata: {
          sessionId: 'session-abc',
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // sessionId should be added even when vars was initially undefined
    expect(result.head.vars).toContain('sessionId');
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('session-abc');
  });

  it('should handle multiple results with varying sessionId configurations', () => {
    const resultsFile: ResultsFile = createResultsFile([
      // Result 0: Only metadata.sessionId (should copy to vars)
      createResult({
        vars: {
          question: 'Question 1',
        },
        metadata: {
          sessionId: 'metadata-session-1',
        },
        response: { output: 'output 1' },
        // @ts-ignore
        failureReason: 'none',
      }),
      // Result 1: Only vars.sessionId (should preserve)
      createResult({
        id: 'test2',
        testIdx: 1,
        vars: {
          question: 'Question 2',
          sessionId: 'user-session-2',
        },
        response: { output: 'output 2' },
        // @ts-ignore
        failureReason: 'none',
      }),
      // Result 2: Both metadata and vars sessionId (should preserve vars)
      createResult({
        id: 'test3',
        testIdx: 2,
        vars: {
          question: 'Question 3',
          sessionId: 'user-session-3',
        },
        metadata: {
          sessionId: 'metadata-session-3',
        },
        response: { output: 'output 3' },
        // @ts-ignore
        failureReason: 'none',
      }),
      // Result 3: Neither metadata nor vars sessionId
      createResult({
        id: 'test4',
        testIdx: 3,
        vars: {
          question: 'Question 4',
        },
        response: { output: 'output 4' },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

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

  it('should copy sessionIds array from metadata to vars for multi-turn strategies', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          question: 'What is AI?',
        },
        metadata: {
          sessionIds: ['session-1', 'session-2', 'session-3'],
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // sessionIds array should be joined and copied to vars.sessionId
    expect(result.head.vars).toContain('sessionId');
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('session-1\nsession-2\nsession-3');
  });

  it('should prefer sessionIds array over sessionId when both exist', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          question: 'What is AI?',
        },
        metadata: {
          sessionId: 'single-session',
          sessionIds: ['multi-1', 'multi-2'],
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // sessionIds array should take precedence over sessionId
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('multi-1\nmulti-2');
  });

  it('should fall back to sessionId when sessionIds is empty array', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          question: 'What is AI?',
        },
        metadata: {
          sessionId: 'fallback-session',
          sessionIds: [],
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // Empty sessionIds array should fall back to sessionId
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('fallback-session');
  });

  it('should handle single-element sessionIds array', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          question: 'What is AI?',
        },
        metadata: {
          sessionIds: ['only-session'],
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // Single-element sessionIds should work without trailing comma
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('only-session');
  });

  it('should ignore non-array sessionIds and fall back to sessionId', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          question: 'What is AI?',
        },
        metadata: {
          sessionId: 'fallback-session',
          sessionIds: 'not-an-array' as unknown as string[],
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // Non-array sessionIds should be ignored, falling back to sessionId
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('fallback-session');
  });

  it('should handle multiple results with varying sessionIds array configurations', () => {
    const resultsFile: ResultsFile = createResultsFile([
      // Result 0: Has sessionIds array (multi-turn)
      createResult({
        vars: {
          question: 'Question 1',
        },
        metadata: {
          sessionIds: ['multi-1a', 'multi-1b', 'multi-1c'],
        },
        response: { output: 'output 1' },
        // @ts-ignore
        failureReason: 'none',
      }),
      // Result 1: Has single sessionId (single-turn)
      createResult({
        id: 'test2',
        testIdx: 1,
        vars: {
          question: 'Question 2',
        },
        metadata: {
          sessionId: 'single-session-2',
        },
        response: { output: 'output 2' },
        // @ts-ignore
        failureReason: 'none',
      }),
      // Result 2: Has both sessionIds and sessionId (sessionIds takes precedence)
      createResult({
        id: 'test3',
        testIdx: 2,
        vars: {
          question: 'Question 3',
        },
        metadata: {
          sessionId: 'ignored-session',
          sessionIds: ['multi-3a', 'multi-3b'],
        },
        response: { output: 'output 3' },
        // @ts-ignore
        failureReason: 'none',
      }),
      // Result 3: No sessionId or sessionIds
      createResult({
        id: 'test4',
        testIdx: 3,
        vars: {
          question: 'Question 4',
        },
        response: { output: 'output 4' },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);

    // sessionId column should exist
    expect(result.head.vars).toContain('sessionId');
    const sessionIdIndex = result.head.vars.indexOf('sessionId');

    // Result 0: sessionIds array joined with newlines
    expect(result.body[0].vars[sessionIdIndex]).toBe('multi-1a\nmulti-1b\nmulti-1c');

    // Result 1: single sessionId
    expect(result.body[1].vars[sessionIdIndex]).toBe('single-session-2');

    // Result 2: sessionIds array takes precedence
    expect(result.body[2].vars[sessionIdIndex]).toBe('multi-3a\nmulti-3b');

    // Result 3: no sessionId (empty string)
    expect(result.body[3].vars[sessionIdIndex]).toBe('');
  });

  it('should filter out null, undefined, empty strings, and convert non-strings in sessionIds array', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: {
          question: 'What is AI?',
        },
        metadata: {
          // Array with mixed types: valid strings, null, undefined, empty string, number
          sessionIds: [
            'session-1',
            null,
            undefined,
            '',
            'session-2',
            123,
            'session-3',
          ] as unknown as string[],
        },
        response: {
          output: 'test output',
        },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    const result = convertResultsToTable(resultsFile);
    // Should filter out null, undefined, empty strings and convert number to string
    expect(result.head.vars).toContain('sessionId');
    const sessionIdIndex = result.head.vars.indexOf('sessionId');
    expect(result.body[0].vars[sessionIdIndex]).toBe('session-1\nsession-2\n123\nsession-3');
  });

  it('preserves persisted variable order when loaded results arrive in a different order', () => {
    const resultsFile: ResultsFile = createResultsFile(
      [
        createResult({
          id: 'test2',
          testIdx: 1,
          vars: { zebra: 'z-row2', apple: 'a-row2', mango: 'm-row2', banana: 'b-row2' },
          response: { output: 'test output' },
          provider: { id: 'test-provider', label: 'Test Provider' },
          // @ts-ignore
          failureReason: 'none',
        }),
        createResult({
          vars: { zebra: 'z-row1', apple: 'a-row1', mango: 'm-row1' },
          response: { output: 'test output' },
          provider: { id: 'test-provider', label: 'Test Provider' },
          // @ts-ignore
          failureReason: 'none',
        }),
      ],
      { vars: ['zebra', 'apple', 'mango', 'banana'] },
    );

    const result = convertResultsToTable(resultsFile);
    expect(result.head.vars).toEqual(['zebra', 'apple', 'mango', 'banana']);
    expect(result.body[0].vars).toEqual(['z-row1', 'a-row1', 'm-row1', '']);
    expect(result.body[1].vars).toEqual(['z-row2', 'a-row2', 'm-row2', 'b-row2']);
  });

  it('sorts metadata-only display columns after the persisted variable prefix', () => {
    const resultsFile: ResultsFile = createResultsFile(
      [
        createResult({
          id: 'test2',
          testIdx: 1,
          vars: { prompt: 'row2' },
          response: { output: 'test output', metadata: { transformDisplayVars: { zebra: 'z' } } },
          // @ts-ignore
          failureReason: 'none',
        }),
        createResult({
          vars: { prompt: 'row1' },
          response: { output: 'test output', metadata: { transformDisplayVars: { apple: 'a' } } },
          // @ts-ignore
          failureReason: 'none',
        }),
      ],
      { vars: ['prompt'] },
    );

    const result = convertResultsToTable(resultsFile);
    expect(result.head.vars).toEqual(['prompt', 'apple', 'zebra']);
  });

  it('keeps alphabetical fallback ordering for legacy result files without persisted vars', () => {
    const resultsFile: ResultsFile = createResultsFile([
      createResult({
        vars: { zebra: 'z', apple: 'a' },
        response: { output: 'test output' },
        // @ts-ignore
        failureReason: 'none',
      }),
    ]);

    expect(convertResultsToTable(resultsFile).head.vars).toEqual(['apple', 'zebra']);
  });

  it('appends runtime-only result.vars keys after the persisted prefix in sorted order', () => {
    const resultsFile: ResultsFile = createResultsFile(
      [
        createResult({
          // `zeta`/`alpha` are NOT in persistedVars and NOT transformDisplayVars.
          // They should be appended after `prompt` in alphabetical order.
          vars: { prompt: 'p1', zeta: 'z1', alpha: 'a1' },
          response: { output: 'test output' },
          // @ts-ignore
          failureReason: 'none',
        }),
      ],
      { vars: ['prompt'] },
    );

    const result = convertResultsToTable(resultsFile);
    expect(result.head.vars).toEqual(['prompt', 'alpha', 'zeta']);
    expect(result.body[0].vars).toEqual(['p1', 'a1', 'z1']);
  });

  it.each([
    ['empty string', '', ''],
    ['zero', 0, '0'],
    ['false', false, 'false'],
  ])(
    'does not overwrite a falsy result.vars value (%s) with transformDisplayVars',
    (_label, falsyValue, expectedRendered) => {
      const resultsFile: ResultsFile = createResultsFile(
        [
          createResult({
            // Falsy value for `prompt` must be preserved, not silently
            // replaced by transformDisplayVars.prompt.
            vars: { prompt: falsyValue } as unknown as Record<string, string>,
            response: {
              output: 'test output',
              metadata: { transformDisplayVars: { prompt: 'from-transform' } },
            },
            // @ts-ignore
            failureReason: 'none',
          }),
        ],
        { vars: ['prompt'] },
      );

      const result = convertResultsToTable(resultsFile);
      expect(result.head.vars).toEqual(['prompt']);
      expect(result.body[0].vars).toEqual([expectedRendered]);
    },
  );

  it('treats a malformed non-array vars field as if no order were persisted', () => {
    // Bogus payload from a corrupt store / older writer. Cast via unknown
    // because the malformed shape intentionally does not match the type.
    const resultsFile = {
      version: 4,
      prompts: [createCompletedPrompt('test prompt', { display: 'test prompt', id: 'prompt1' })],
      vars: 'not-an-array',
      results: {
        results: [
          {
            id: 'test1',
            testIdx: 0,
            promptIdx: 0,
            vars: { zebra: 'z', apple: 'a' },
            prompt: { raw: 'test prompt', label: 'Test Prompt' },
            response: { output: 'test output' },
            provider: { id: 'test-provider' },
            success: true,
            promptId: 'prompt1',
            testCase: {},
            failureReason: 'none',
            score: 1,
            latencyMs: 100,
            namedScores: {},
          },
        ],
      },
    } as unknown as ResultsFile;

    expect(convertResultsToTable(resultsFile).head.vars).toEqual(['apple', 'zebra']);
  });

  it('logs a debug breadcrumb when transformDisplayVars collides with a different result.vars value', async () => {
    const logger = (await import('../../src/logger')).default;
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);

    const resultsFile: ResultsFile = createResultsFile(
      [
        createResult({
          vars: { prompt: 'original' },
          response: {
            output: 'test output',
            metadata: { transformDisplayVars: { prompt: 'shadowed' } },
          },
          // @ts-ignore
          failureReason: 'none',
        }),
      ],
      { vars: ['prompt'] },
    );

    const result = convertResultsToTable(resultsFile);

    expect(result.body[0].vars).toEqual(['original']);
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining("key 'prompt' collides"));
    debugSpy.mockRestore();
  });

  it('dedups a corrupt persisted vars list so duplicate header columns are not rendered', () => {
    const resultsFile: ResultsFile = createResultsFile(
      [
        createResult({
          vars: { prompt: 'p', foo: 'f' },
          response: { output: 'test output' },
          // @ts-ignore
          failureReason: 'none',
        }),
      ],
      { vars: ['prompt', 'prompt', 'foo'] },
    );

    const result = convertResultsToTable(resultsFile);
    expect(result.head.vars).toEqual(['prompt', 'foo']);
    expect(result.body[0].vars).toEqual(['p', 'f']);
  });
});
