import chalk from 'chalk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TERMINAL_MAX_WIDTH } from '../src/constants';
import { generateTable, wrapTable } from '../src/table';
import { type EvaluateTable, ResultFailureReason } from '../src/types/index';

// Track all created instances and constructor calls
const mockTableInstances: any[] = [];
const mockConstructorCalls: any[] = [];

// Create a hoisted mock class for Table - must be an actual class to work with `new`
const MockTable = vi.hoisted(() => {
  return class MockTable {
    push: ReturnType<typeof vi.fn>;
    toString: ReturnType<typeof vi.fn>;
    options: object;
    width: number;
    length: number;
    pop: ReturnType<typeof vi.fn>;

    constructor(options: any) {
      mockConstructorCalls.push(options);
      this.push = vi.fn();
      this.toString = vi.fn().mockReturnValue('mocked table string');
      this.options = options || {};
      this.width = 0;
      this.length = 0;
      this.pop = vi.fn();
      mockTableInstances.push(this);
    }
  };
});

vi.mock('cli-table3', () => ({
  default: MockTable,
}));

describe('table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTableInstances.length = 0;
    mockConstructorCalls.length = 0;
  });

  describe('generateTable', () => {
    const mockEvaluateTable: EvaluateTable = {
      head: {
        vars: ['var1', 'var2'],
        prompts: [
          {
            provider: 'test-provider',
            label: 'test-label',
            raw: 'test prompt',
            id: 'test-id',
            display: 'test display',
            config: {},
            // @ts-ignore
            metrics: {},
          },
        ],
      },
      body: [
        {
          vars: ['value1', 'value2'],
          outputs: [
            {
              pass: true,
              score: 1,
              text: 'passing test',
              failureReason: ResultFailureReason.NONE,
              cost: 0,
              id: 'test',
              latencyMs: 0,
              namedScores: {},
              tokenUsage: {},
              metadata: {},
              prompt: 'test prompt',
              testCase: {},
            },
          ],
          test: {},
          testIdx: 0,
        },
        {
          vars: ['value3', 'value4'],
          outputs: [
            {
              pass: false,
              score: 0,
              text: 'failing test',
              failureReason: ResultFailureReason.ASSERT,
              cost: 0,
              id: 'test',
              latencyMs: 0,
              namedScores: {},
              tokenUsage: {},
              metadata: {},
              prompt: 'test prompt',
              testCase: {},
            },
          ],
          test: {},
          testIdx: 1,
        },
      ],
    };

    it('should generate table with correct headers', () => {
      generateTable(mockEvaluateTable);

      expect(mockConstructorCalls[0]).toEqual({
        head: ['var1', 'var2', '[test-provider] test-label'],
        colWidths: expect.any(Array),
        wordWrap: true,
        wrapOnWordBoundary: true,
        style: { head: ['blue', 'bold'] },
      });
    });

    it('should handle passing and failing rows correctly', () => {
      generateTable(mockEvaluateTable);

      const table = mockTableInstances[0];
      expect(table.push).toHaveBeenCalledWith([
        'value1',
        'value2',
        chalk.green('[PASS] ') + 'passing test',
      ]);

      expect(table.push).toHaveBeenCalledWith([
        'value3',
        'value4',
        chalk.red('[FAIL] ') + chalk.red.bold('failing test'),
      ]);
    });

    it('should respect maxRows parameter', () => {
      generateTable(mockEvaluateTable, 250, 1);

      const table = mockTableInstances[0];
      expect(table.push).toHaveBeenCalledTimes(1);
    });

    it('should respect tableCellMaxLength parameter', () => {
      const longText = 'a'.repeat(300);
      const shortMaxLength = 10;

      const testTable: EvaluateTable = {
        head: {
          vars: [longText],
          prompts: [],
        },
        body: [
          {
            vars: [longText],
            outputs: [
              {
                pass: true,
                score: 1,
                text: 'test',
                failureReason: ResultFailureReason.NONE,
                cost: 0,
                id: 'test',
                latencyMs: 0,
                namedScores: {},
                tokenUsage: {},
                metadata: {},
                prompt: 'test prompt',
                testCase: {},
              },
            ],
            test: {},
            testIdx: 0,
          },
        ],
      };

      generateTable(testTable, shortMaxLength);

      expect(mockConstructorCalls[0]).toEqual(
        expect.objectContaining({
          head: [expect.stringMatching(/^a{7}\.{3}$/)],
        }),
      );
    });
  });

  describe('wrapTable', () => {
    it('should return message when no rows provided', () => {
      const result = wrapTable([]);
      expect(result).toBe('No data to display');
    });

    it('should create table with correct headers and data', () => {
      const rows = [
        { col1: 'value1', col2: 'value2' },
        { col1: 'value3', col2: 'value4' },
      ];

      wrapTable(rows);

      expect(mockConstructorCalls[0]).toEqual({
        head: ['col1', 'col2'],
        colWidths: expect.any(Array),
        wordWrap: true,
        wrapOnWordBoundary: true,
      });

      const table = mockTableInstances[0];
      expect(table.push).toHaveBeenCalledWith(['value1', 'value2']);
      expect(table.push).toHaveBeenCalledWith(['value3', 'value4']);
    });

    it('should create table with custom column widths', () => {
      const rows = [
        { col1: 'value1', col2: 'value2', col3: 'value3' },
        { col1: 'value4', col2: 'value5', col3: 'value6' },
      ];
      const columnWidths = {
        col1: 10,
        col2: 20,
        col3: 15,
      };

      wrapTable(rows, columnWidths);

      expect(mockConstructorCalls[0]).toEqual({
        head: ['col1', 'col2', 'col3'],
        colWidths: [10, 20, 15],
        wordWrap: true,
        wrapOnWordBoundary: true,
      });

      const table = mockTableInstances[0];
      expect(table.push).toHaveBeenCalledWith(['value1', 'value2', 'value3']);
      expect(table.push).toHaveBeenCalledWith(['value4', 'value5', 'value6']);
    });

    it('should use default width for columns not specified in columnWidths', () => {
      const rows = [{ col1: 'value1', col2: 'value2', col3: 'value3' }];
      const columnWidths = {
        col1: 10,
        // col2 not specified
        col3: 15,
      };

      wrapTable(rows, columnWidths);

      const defaultWidth = Math.floor(TERMINAL_MAX_WIDTH / 3); // 3 columns
      expect(mockConstructorCalls[0]).toEqual({
        head: ['col1', 'col2', 'col3'],
        colWidths: [10, defaultWidth, 15],
        wordWrap: true,
        wrapOnWordBoundary: true,
      });
    });

    it('should return a string representation of the table', () => {
      const rows = [
        { col1: 'value1', col2: 'value2' },
        { col1: 'value3', col2: 'value4' },
      ];

      const result = wrapTable(rows);

      expect(typeof result).toBe('string');
      expect(result).toBe('mocked table string');
      const table = mockTableInstances[0];
      expect(table.toString).toHaveBeenCalled();
    });

    it('should return string for single row', () => {
      const rows = [{ name: 'John', age: 30 }];

      const result = wrapTable(rows);

      expect(typeof result).toBe('string');
      expect(result).toBe('mocked table string');
    });
  });
});
