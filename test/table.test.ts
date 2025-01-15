import chalk from 'chalk';
import Table from 'cli-table3';
import { TERMINAL_MAX_WIDTH } from '../src/constants';
import { generateTable, wrapTable } from '../src/table';
import { ResultFailureReason, type EvaluateTable } from '../src/types';

jest.mock('cli-table3', () => {
  return jest.fn().mockImplementation(() => {
    return {
      push: jest.fn(),
      options: {},
      width: 0,
      length: 0,
      pop: jest.fn(),
      concat: jest.fn(),
      join: jest.fn(),
      reverse: jest.fn(),
      shift: jest.fn(),
      slice: jest.fn(),
      splice: jest.fn(),
      toString: jest.fn(),
    };
  });
});

describe('table', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateTable', () => {
    it('should generate table with correct headers and data', () => {
      const evaluateTable: EvaluateTable = {
        head: {
          vars: ['var1', 'var2'],
          prompts: [
            {
              raw: 'test prompt',
              provider: 'test-provider',
              label: 'test-label',
              function: undefined,
              id: 'test-id',
              display: 'test-display',
              config: {},
              metrics: undefined,
            },
          ],
        },
        body: [
          {
            vars: ['value1', 'value2'],
            outputs: [
              {
                pass: true,
                text: 'test output',
                score: 1,
                failureReason: ResultFailureReason.NONE,
                cost: 0,
                id: 'test-1',
                latencyMs: 100,
                namedScores: {},
                prompt: 'test prompt',
                testCase: {
                  vars: {},
                },
              },
            ],
            test: {
              vars: {},
            },
          },
        ],
      };

      generateTable(evaluateTable);

      expect(Table).toHaveBeenCalledWith({
        head: ['var1', 'var2', '[test-provider] test-label'],
        colWidths: [40, 40, 40],
        wordWrap: true,
        wrapOnWordBoundary: true,
        style: {
          head: ['blue', 'bold'],
        },
      });
    });

    it('should handle failed test cases', () => {
      const evaluateTable: EvaluateTable = {
        head: {
          vars: ['var1'],
          prompts: [
            {
              raw: 'test prompt',
              provider: 'test',
              label: 'test',
              function: undefined,
              id: 'test-id',
              display: 'test-display',
              config: {},
              metrics: undefined,
            },
          ],
        },
        body: [
          {
            vars: ['value1'],
            outputs: [
              {
                pass: false,
                text: 'failed output',
                score: 0,
                failureReason: ResultFailureReason.ASSERT,
                cost: 0,
                id: 'test-1',
                latencyMs: 100,
                namedScores: {},
                prompt: 'test prompt',
                testCase: {
                  vars: {},
                },
              },
            ],
            test: {
              vars: {},
            },
          },
        ],
      };

      generateTable(evaluateTable);

      const mockTable = jest.mocked(Table).mock.results[0].value;
      expect(mockTable.push).toHaveBeenCalledWith([
        'value1',
        chalk.red('[FAIL] ') + chalk.red.bold('failed output'),
      ]);
    });

    it('should respect maxRows parameter', () => {
      const evaluateTable: EvaluateTable = {
        head: {
          vars: ['var1'],
          prompts: [
            {
              raw: 'test prompt',
              provider: 'test',
              label: 'test',
              function: undefined,
              id: 'test-id',
              display: 'test-display',
              config: {},
              metrics: undefined,
            },
          ],
        },
        body: Array(10).fill({
          vars: ['value'],
          outputs: [
            {
              pass: true,
              text: 'output',
              score: 1,
              failureReason: ResultFailureReason.NONE,
              cost: 0,
              id: 'test-1',
              latencyMs: 100,
              namedScores: {},
              prompt: 'test prompt',
              testCase: {
                vars: {},
              },
            },
          ],
          test: {
            vars: {},
          },
        }),
      };

      generateTable(evaluateTable, 250, 5);

      const mockTable = jest.mocked(Table).mock.results[0].value;
      expect(mockTable.push).toHaveBeenCalledTimes(5);
    });

    it('should truncate long cell content', () => {
      const longText = 'a'.repeat(300);
      const evaluateTable: EvaluateTable = {
        head: {
          vars: ['var1'],
          prompts: [
            {
              raw: 'test prompt',
              provider: 'test',
              label: 'test',
              function: undefined,
              id: 'test-id',
              display: 'test-display',
              config: {},
              metrics: undefined,
            },
          ],
        },
        body: [
          {
            vars: [longText],
            outputs: [
              {
                pass: true,
                text: longText,
                score: 1,
                failureReason: ResultFailureReason.NONE,
                cost: 0,
                id: 'test-1',
                latencyMs: 100,
                namedScores: {},
                prompt: 'test prompt',
                testCase: {
                  vars: {},
                },
              },
            ],
            test: {
              vars: {},
            },
          },
        ],
      };

      generateTable(evaluateTable, 100);

      const mockTable = jest.mocked(Table).mock.results[0].value;
      const pushedRow = mockTable.push.mock.calls[0][0];
      expect(pushedRow[0].length).toBeLessThanOrEqual(100);
      expect(pushedRow[1].length).toBeLessThanOrEqual(107); // Account for '[PASS] ' prefix
    });
  });

  describe('wrapTable', () => {
    it('should wrap data in table format', () => {
      const rows = [
        { col1: 'value1', col2: 'value2' },
        { col1: 'value3', col2: 'value4' },
      ];

      wrapTable(rows);

      expect(Table).toHaveBeenCalledWith({
        head: ['col1', 'col2'],
        colWidths: [TERMINAL_MAX_WIDTH / 2, TERMINAL_MAX_WIDTH / 2],
        wordWrap: true,
        wrapOnWordBoundary: true,
      });
    });

    it('should handle empty data', () => {
      const result = wrapTable([]);
      expect(result).toBe('No data to display');
    });
  });
});
