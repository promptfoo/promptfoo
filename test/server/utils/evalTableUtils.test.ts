import { beforeEach, describe, expect, it } from 'vitest';
import {
  evalTableToCsv,
  evalTableToJson,
  streamEvalCsv,
} from '../../../src/server/utils/evalTableUtils';
import { ResultFailureReason } from '../../../src/types/index';

import type Eval from '../../../src/models/eval';
import type {
  CompletedPrompt,
  EvaluateTableOutput,
  EvaluateTableRow,
  Prompt,
} from '../../../src/types/index';

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
          {
            provider: 'openai:gpt-4',
            label: 'Prompt 1',
            raw: 'Test prompt {{var1}}',
            display: 'Test prompt',
          } as CompletedPrompt,
          {
            provider: 'anthropic:claude',
            label: 'Prompt 2',
            raw: 'Another prompt {{var2}}',
            display: 'Another prompt',
          } as CompletedPrompt,
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
              {
                provider: 'openai:gpt-4',
                label: 'Prompt 1',
                raw: 'Test prompt 1',
                display: 'Test prompt 1',
              } as CompletedPrompt,
              {
                provider: 'anthropic:claude',
                label: 'Prompt 2',
                raw: 'Test prompt 2',
                display: 'Test prompt 2',
              } as CompletedPrompt,
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

        // Parse CSV to count columns
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
              {
                provider: 'openai:gpt-4',
                label: 'Prompt 1',
                raw: 'Test prompt 1',
                display: 'Test prompt 1',
              } as CompletedPrompt,
              {
                provider: 'anthropic:claude',
                label: 'Prompt 2',
                raw: 'Test prompt 2',
                display: 'Test prompt 2',
              } as CompletedPrompt,
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

        // Parse CSV using a simple comma count approach for validation
        // Count actual CSV fields by splitting on commas not inside quotes
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"' && nextChar === '"') {
              // Escaped quote
              current += '"';
              i++; // Skip next char
            } else if (char === '"') {
              // Toggle quote state
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              // Field separator
              result.push(current);
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current); // Add last field
          return result;
        };

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
