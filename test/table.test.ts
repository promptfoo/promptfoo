import chalk from 'chalk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TERMINAL_MAX_WIDTH } from '../src/constants';
import {
  generateAssertionSummary,
  generateAssertionTable,
  generateTable,
  wrapTable,
} from '../src/table';
import {
  type EvaluateTable,
  type EvaluateTableOutput,
  ResultFailureReason,
} from '../src/types/index';
import {
  createCompletedPrompt,
  createEvaluateTable,
  createEvaluateTableOutput,
  createEvaluateTableRow,
} from './factories/eval';

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
    vi.resetAllMocks();
    mockTableInstances.length = 0;
    mockConstructorCalls.length = 0;
  });

  describe('generateTable', () => {
    const mockEvaluateTable: EvaluateTable = createEvaluateTable({
      head: {
        vars: ['var1', 'var2'],
        prompts: [
          createCompletedPrompt('test prompt', {
            provider: 'test-provider',
            label: 'test-label',
            id: 'test-id',
            display: 'test display',
            config: {},
            metrics: undefined,
          }),
        ],
      },
      body: [
        createEvaluateTableRow({
          vars: ['value1', 'value2'],
          outputs: [createEvaluateTableOutput({ text: 'passing test' })],
          testIdx: 0,
        }),
        createEvaluateTableRow({
          vars: ['value3', 'value4'],
          outputs: [
            createEvaluateTableOutput({
              pass: false,
              score: 0,
              text: 'failing test',
              failureReason: ResultFailureReason.ASSERT,
            }),
          ],
          testIdx: 1,
        }),
      ],
    });

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

      const testTable: EvaluateTable = createEvaluateTable({
        head: { vars: [longText], prompts: [] },
        body: [
          createEvaluateTableRow({
            vars: [longText],
            outputs: [createEvaluateTableOutput({ text: 'test' })],
          }),
        ],
      });

      generateTable(testTable, shortMaxLength);

      expect(mockConstructorCalls[0]).toEqual(
        expect.objectContaining({
          head: [expect.stringMatching(/^a{7}\.{3}$/)],
        }),
      );
    });

    it('should append assertion details when requested', () => {
      const testTable = createEvaluateTable({
        body: [
          createEvaluateTableRow({
            outputs: [
              createEvaluateTableOutput({
                pass: false,
                score: 0,
                text: 'failing test',
                failureReason: ResultFailureReason.ASSERT,
                gradingResult: {
                  pass: false,
                  score: 0,
                  reason: 'failed',
                  componentResults: [
                    {
                      pass: false,
                      score: 0,
                      reason: 'Missing text',
                      assertion: { type: 'contains', metric: 'Correctness' },
                    },
                  ],
                },
              }),
            ],
          }),
        ],
      });

      const result = generateTable(testTable, 250, 25, { showAssertions: true });

      expect(result).toContain('Assertion Details');
      expect(mockTableInstances).toHaveLength(2);
    });
  });

  describe('generateAssertionSummary', () => {
    it('should return empty string for output without component results', () => {
      const output = createEvaluateTableOutput();

      expect(generateAssertionSummary(output)).toBe('');
    });

    it('should generate summary for top-level assertions only', () => {
      const output: EvaluateTableOutput = createEvaluateTableOutput({
        pass: false,
        score: 0.5,
        gradingResult: {
          pass: false,
          score: 0.5,
          reason: 'Some failed',
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'Passed',
              assertion: { type: 'contains', metric: 'Correctness' },
            },
            {
              pass: false,
              score: 0.5,
              reason: 'Failed',
              assertion: { type: 'llm-rubric', metric: 'Tone' },
            },
            {
              pass: false,
              score: 0,
              reason: 'Child failed',
              assertion: { type: 'latency' },
              metadata: { parentAssertSetIndex: 0 },
            },
          ],
        },
      });

      const result = generateAssertionSummary(output);

      expect(result).toContain('Correctness');
      expect(result).toContain('Tone');
      expect(result).not.toContain('latency');
    });
  });

  describe('generateAssertionTable', () => {
    it('should return empty string for output without component results', () => {
      expect(generateAssertionTable(createEvaluateTableOutput())).toBe('');
    });

    it('should render nested assert-set rows recursively', () => {
      const output = createEvaluateTableOutput({
        gradingResult: {
          pass: false,
          score: 0.5,
          reason: 'failed',
          componentResults: [
            {
              pass: false,
              score: 0.5,
              reason: 'Outer failed',
              assertion: { type: 'contains', metric: 'outer' },
              metadata: { isAssertSet: true, childCount: 1 },
            },
            {
              pass: false,
              score: 0.5,
              reason: 'Inner failed',
              assertion: { type: 'contains', metric: 'inner' },
              metadata: { isAssertSet: true, childCount: 1, parentAssertSetIndex: 0 },
            },
            {
              pass: false,
              score: 0,
              reason: 'Leaf failed',
              assertion: { type: 'contains', metric: 'leaf' },
              metadata: { parentAssertSetIndex: 1 },
            },
          ],
        },
      });

      expect(generateAssertionTable(output)).toBe('mocked table string');

      const table = mockTableInstances[mockTableInstances.length - 1];
      expect(table.push).toHaveBeenCalledTimes(3);
      expect(table.push.mock.calls[1][0][0]).toContain('inner');
      expect(table.push.mock.calls[2][0][0]).toContain('leaf');
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
