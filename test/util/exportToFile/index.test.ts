import { describe, expect, it } from 'vitest';
import { ResultFailureReason } from '../../../src/types/index';
import { getHeaderForTable } from '../../../src/util/exportToFile/getHeaderForTable';
import {
  convertEvalResultToTableCell,
  convertTestResultsToTableRow,
  trimTableCellForApi,
} from '../../../src/util/exportToFile/index';

import type Eval from '../../../src/models/eval';
import type EvalResult from '../../../src/models/evalResult';
import type { EvaluateTableOutput } from '../../../src/types/index';

describe('exportToFile utils', () => {
  describe('getHeaderForTable', () => {
    it('should extract vars from defaultTest', () => {
      const eval_: Partial<Eval> = {
        id: 'test-id',
        createdAt: Date.now(),
        config: {
          defaultTest: {
            vars: {
              var1: 'value1',
              var2: 'value2',
            },
          },
        },
        prompts: [],
        results: [],
        persisted: false,
      };

      const result = getHeaderForTable(eval_ as Eval);
      expect(result.vars).toEqual(['var1', 'var2']);
    });

    it('should extract vars from tests array', () => {
      const eval_: Partial<Eval> = {
        id: 'test-id',
        createdAt: Date.now(),
        config: {
          tests: [
            {
              vars: {
                var3: 'value3',
                var4: 'value4',
              },
            },
          ],
        },
        prompts: [],
        results: [],
        persisted: false,
      };

      const result = getHeaderForTable(eval_ as Eval);
      expect(result.vars).toEqual(['var3', 'var4']);
    });

    it('should extract vars from scenarios', () => {
      const eval_: Partial<Eval> = {
        id: 'test-id',
        createdAt: Date.now(),
        config: {
          scenarios: [
            {
              config: [
                {
                  vars: {
                    var5: 'value5',
                  },
                },
              ],
              tests: [
                {
                  vars: {
                    var6: 'value6',
                  },
                },
              ],
            },
          ],
        },
        prompts: [],
        results: [],
        persisted: false,
      };

      const result = getHeaderForTable(eval_ as Eval);
      expect(result.vars).toEqual(['var5', 'var6']);
    });

    it('should handle empty config', () => {
      const eval_: Partial<Eval> = {
        id: 'test-id',
        createdAt: Date.now(),
        config: {},
        prompts: [],
        results: [],
        persisted: false,
      };

      const result = getHeaderForTable(eval_ as Eval);
      expect(result.vars).toEqual([]);
    });
  });

  describe('convertEvalResultToTableCell', () => {
    it('should handle successful assertion result', () => {
      const result: Partial<EvalResult> = {
        id: 'test-1',
        evalId: 'eval-1',
        testCase: {
          assert: [
            {
              type: 'contains',
              value: 'test',
            },
          ],
        },
        success: true,
        response: {
          output: 'test output',
        },
        prompt: {
          raw: 'test prompt',
          label: 'test',
        },
        provider: {
          id: 'test-provider',
        },
        failureReason: ResultFailureReason.NONE,
      };

      const output = convertEvalResultToTableCell(result as EvalResult);
      expect(output.text).toBe('test output');
      expect(output.pass).toBe(true);
    });

    it('should handle failed assertion result', () => {
      const result: Partial<EvalResult> = {
        id: 'test-1',
        evalId: 'eval-1',
        testCase: {
          assert: [
            {
              type: 'contains',
              value: 'test',
            },
          ],
        },
        success: false,
        error: 'test error',
        response: {
          output: 'test output',
        },
        prompt: {
          raw: 'test prompt',
          label: 'test',
        },
        provider: {
          id: 'test-provider',
        },
        gradingResult: {
          pass: false,
          score: 0,
          reason: 'test failure',
          componentResults: [
            {
              pass: false,
              score: 0,
              reason: 'test failure',
            },
          ],
        },
        failureReason: ResultFailureReason.ASSERT,
      };

      const output = convertEvalResultToTableCell(result as EvalResult);
      expect(output.text).toBe('test output');
      expect(output.pass).toBe(false);
    });

    it('should handle error without assertion', () => {
      const result: Partial<EvalResult> = {
        id: 'test-1',
        evalId: 'eval-1',
        testCase: {},
        error: 'test error',
        prompt: {
          raw: 'test prompt',
          label: 'test',
        },
        provider: {
          id: 'test-provider',
        },
        failureReason: ResultFailureReason.ERROR,
      };

      const output = convertEvalResultToTableCell(result as EvalResult);
      expect(output.text).toBe('test error');
    });

    it('should preserve falsy outputs like 0 and false', () => {
      const numericResult: Partial<EvalResult> = {
        id: 'test-1',
        evalId: 'eval-1',
        testCase: {},
        response: {
          output: 0,
        },
        prompt: {
          raw: 'test prompt',
          label: 'test',
        },
        provider: {
          id: 'test-provider',
        },
        failureReason: ResultFailureReason.NONE,
      };

      const booleanResult: Partial<EvalResult> = {
        id: 'test-2',
        evalId: 'eval-1',
        testCase: {},
        response: {
          output: false,
        },
        prompt: {
          raw: 'test prompt',
          label: 'test',
        },
        provider: {
          id: 'test-provider',
        },
        failureReason: ResultFailureReason.NONE,
      };

      const numericOutput = convertEvalResultToTableCell(numericResult as EvalResult);
      const booleanOutput = convertEvalResultToTableCell(booleanResult as EvalResult);

      expect(numericOutput.text).toBe('0');
      expect(booleanOutput.text).toBe('false');
    });

    it('should handle null output by falling back to error', () => {
      const resultWithError: Partial<EvalResult> = {
        id: 'test-1',
        evalId: 'eval-1',
        testCase: {},
        response: {
          output: null,
        },
        error: 'Provider returned null',
        prompt: {
          raw: 'test prompt',
          label: 'test',
        },
        provider: {
          id: 'test-provider',
        },
        failureReason: ResultFailureReason.ERROR,
      };

      const resultWithoutError: Partial<EvalResult> = {
        id: 'test-2',
        evalId: 'eval-1',
        testCase: {},
        response: {
          output: null,
        },
        prompt: {
          raw: 'test prompt',
          label: 'test',
        },
        provider: {
          id: 'test-provider',
        },
        failureReason: ResultFailureReason.NONE,
      };

      const outputWithError = convertEvalResultToTableCell(resultWithError as EvalResult);
      const outputWithoutError = convertEvalResultToTableCell(resultWithoutError as EvalResult);

      expect(outputWithError.text).toBe('Provider returned null');
      expect(outputWithoutError.text).toBe('');
    });
  });

  describe('convertTestResultsToTableRow', () => {
    it('should convert results to table row', () => {
      const results: Partial<EvalResult>[] = [
        {
          id: 'test-1',
          evalId: 'eval-1',
          description: 'test description',
          promptIdx: 0,
          testCase: {
            vars: {
              var1: 'value1',
              var2: 'value2',
            },
          },
          response: {
            output: 'test output',
          },
          prompt: {
            raw: 'test prompt',
            label: 'test',
          },
          provider: {
            id: 'test-provider',
          },
          failureReason: ResultFailureReason.NONE,
        },
      ];

      const varsForHeader = ['var1', 'var2'];

      const row = convertTestResultsToTableRow(results as EvalResult[], varsForHeader);

      expect(row.description).toBe('test description');
      expect(row.vars).toEqual(['value1', 'value2']);
      expect(row.outputs[0].text).toBe('test output');
    });

    it('should handle complex var values', () => {
      const results: Partial<EvalResult>[] = [
        {
          id: 'test-1',
          evalId: 'eval-1',
          promptIdx: 0,
          testCase: {
            vars: {
              var1: { complex: 'object' },
            },
          },
          prompt: {
            raw: 'test prompt',
            label: 'test',
          },
          provider: {
            id: 'test-provider',
          },
          failureReason: ResultFailureReason.NONE,
        },
      ];

      const varsForHeader = ['var1'];

      const row = convertTestResultsToTableRow(results as EvalResult[], varsForHeader);
      expect(row.vars).toEqual(['{"complex":"object"}']);
    });

    it('should preserve falsy var values like 0 and false', () => {
      const results: Partial<EvalResult>[] = [
        {
          id: 'test-1',
          evalId: 'eval-1',
          promptIdx: 0,
          testCase: {
            vars: {
              var1: 0,
              var2: false,
            },
          },
          prompt: {
            raw: 'test prompt',
            label: 'test',
          },
          provider: {
            id: 'test-provider',
          },
          failureReason: ResultFailureReason.NONE,
        },
      ];

      const varsForHeader = ['var1', 'var2'];

      const row = convertTestResultsToTableRow(results as EvalResult[], varsForHeader);
      expect(row.vars).toEqual(['0', 'false']);
    });
  });

  describe('trimTableCellForApi', () => {
    const makeCell = (overrides: Partial<EvaluateTableOutput> = {}): EvaluateTableOutput =>
      ({
        id: 'result-1',
        text: 'denver',
        prompt: 'What is the capital of colorado?',
        provider: 'test-provider',
        pass: true,
        score: 1,
        cost: 0.007,
        latencyMs: 100,
        failureReason: ResultFailureReason.NONE,
        namedScores: {},
        gradingResult: { pass: true, score: 1, reason: 'test' },
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
        metadata: { key: 'value' },
        error: null,
        testCase: { vars: { state: 'colorado' }, provider: 'override-provider' },
        response: {
          output: 'denver',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
          cached: false,
          prompt: 'system prompt content',
          raw: '{"huge": "http response body"}',
          error: 'some error',
          cost: 0.007,
        },
        // Fields that come from ...result spread
        evalId: 'eval-123',
        promptIdx: 0,
        testIdx: 0,
        promptId: 'prompt-1',
        persisted: true,
        pluginId: 'plugin-1',
        description: 'test description',
        ...overrides,
      }) as any;

    it('should strip prompt content', () => {
      const trimmed = trimTableCellForApi(makeCell());
      expect(trimmed.prompt).toBe('');
    });

    it('should preserve essential cell fields', () => {
      const trimmed = trimTableCellForApi(makeCell());
      expect(trimmed.id).toBe('result-1');
      expect(trimmed.text).toBe('denver');
      expect(trimmed.pass).toBe(true);
      expect(trimmed.score).toBe(1);
      expect(trimmed.cost).toBe(0.007);
      expect(trimmed.latencyMs).toBe(100);
      expect(trimmed.namedScores).toEqual({});
      expect(trimmed.gradingResult).toEqual({ pass: true, score: 1, reason: 'test' });
      expect(trimmed.metadata).toEqual({ key: 'value' });
      expect(trimmed.error).toBeNull();
    });

    it('should strip spread fields from EvalResult', () => {
      const trimmed = trimTableCellForApi(makeCell()) as any;
      expect(trimmed).not.toHaveProperty('evalId');
      expect(trimmed).not.toHaveProperty('promptIdx');
      expect(trimmed).not.toHaveProperty('testIdx');
      expect(trimmed).not.toHaveProperty('promptId');
      expect(trimmed).not.toHaveProperty('persisted');
      expect(trimmed).not.toHaveProperty('pluginId');
      expect(trimmed).not.toHaveProperty('description');
    });

    it('should trim response to only essential fields', () => {
      const trimmed = trimTableCellForApi(makeCell());
      expect(trimmed.response).toBeDefined();
      expect(trimmed.response?.tokenUsage).toEqual({
        total: 10,
        prompt: 5,
        completion: 5,
        cached: 0,
      });
      expect(trimmed.response?.cached).toBe(false);
      expect(trimmed.response?.prompt).toBe('system prompt content');
      // Stripped fields
      expect(trimmed.response).not.toHaveProperty('raw');
      expect(trimmed.response).not.toHaveProperty('output');
      expect(trimmed.response).not.toHaveProperty('error');
      expect(trimmed.response).not.toHaveProperty('cost');
    });

    it('should keep testCase.provider for override badge', () => {
      const trimmed = trimTableCellForApi(makeCell());
      expect(trimmed.testCase).toEqual({ provider: 'override-provider' });
    });

    it('should handle testCase without provider', () => {
      const trimmed = trimTableCellForApi(makeCell({ testCase: { vars: { state: 'colorado' } } }));
      expect(trimmed.testCase).toBeDefined();
      expect(trimmed.testCase).not.toHaveProperty('provider');
    });

    it('should handle undefined response', () => {
      const trimmed = trimTableCellForApi(makeCell({ response: undefined }));
      expect(trimmed.response).toBeUndefined();
    });

    it('should preserve audio and video fields', () => {
      const audio = { id: 'audio-1', format: 'mp3' };
      const video = { id: 'video-1', format: 'mp4' };
      const trimmed = trimTableCellForApi(makeCell({ audio, video } as any));
      expect(trimmed.audio).toEqual(audio);
      expect(trimmed.video).toEqual(video);
    });
  });
});
