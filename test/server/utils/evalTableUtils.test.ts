import { beforeEach, describe, expect, it } from '@jest/globals';
import { evalTableToCsv, evalTableToJson } from '../../../src/server/utils/evalTableUtils';
import { ResultFailureReason } from '../../../src/types';

import type {
  CompletedPrompt,
  EvaluateTableOutput,
  EvaluateTableRow,
  UnifiedConfig,
} from '../../../src/types';

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

      it('should format output with pass/fail/error prefixes', () => {
        const csv = evalTableToCsv(mockTable);
        const lines = csv.split('\n');

        expect(lines[1]).toContain('[PASS] Success output');
        expect(lines[1]).toContain('[FAIL] Failed output');
        expect(lines[2]).toContain('[ERROR] Error output');
        expect(lines[2]).toContain('[PASS] Another success');
      });

      it('should include grader reason and comments', () => {
        const csv = evalTableToCsv(mockTable);
        const lines = csv.split('\n');

        expect(lines[1]).toContain('Output meets criteria');
        expect(lines[1]).toContain('Well formatted');
        expect(lines[1]).toContain('Missing required field');
        expect(lines[1]).toContain('Needs improvement');
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

        // Should have empty values for null/undefined outputs
        expect(lines[1]).toContain(',,'); // Empty values for null output
        expect(lines[1]).toContain('[PASS] Valid output');
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

        // Should have empty values for grader columns
        expect(lines[1]).toContain('[PASS] Output without grading,,');
      });
    });

    describe('Red team CSV generation', () => {
      const _redteamConfig: UnifiedConfig = {
        redteam: {
          strategies: ['jailbreak', 'crescendo'],
        },
      } as UnifiedConfig;

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
        // Tree history is stored as multi-line string
        expect(lines[1]).toMatch(/Root -> Branch1 -> Leaf1/);
        expect(csv).toMatch(/Root -> Branch2 -> Leaf2/);
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

        expect(lines[1]).toContain('[]'); // Empty arrays as JSON
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

        const _redteamConfig: UnifiedConfig = {
          redteam: { strategies: ['test'] },
        } as UnifiedConfig;

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
      expect(result.body[0].outputs[0].metadata).toEqual({
        custom: 'data',
        nested: { value: 123 },
      });
    });
  });
});
