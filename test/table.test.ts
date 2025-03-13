import chalk from 'chalk';
import Table from 'cli-table3';
import { TERMINAL_MAX_WIDTH } from '../src/constants';
import { generateTable, wrapTable } from '../src/table';
import { ResultFailureReason, type EvaluateTable } from '../src/types';

jest.mock('cli-table3');

describe('table', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-ignore
    jest.mocked(Table).mockImplementation(() => ({
      push: jest.fn(),
      toString: jest.fn().mockReturnValue('mocked table string'),
      options: {},
      width: 0,
      length: 0,
      pop: jest.fn(),
    }));
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

      expect(Table).toHaveBeenCalledWith({
        head: ['var1', 'var2', '[test-provider] test-label'],
        colWidths: [40, 40, 40],
        wordWrap: true,
        wrapOnWordBoundary: true,
        style: { head: ['blue', 'bold'] },
      });
    });

    it('should handle passing and failing rows correctly', () => {
      const table = new Table({});
      jest.mocked(Table).mockReturnValue(table);

      generateTable(mockEvaluateTable);

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
      const table = new Table({});
      jest.mocked(Table).mockReturnValue(table);

      generateTable(mockEvaluateTable, 250, 1);

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

      expect(Table).toHaveBeenCalledWith(
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

      const table = new Table({});
      jest.mocked(Table).mockReturnValue(table);

      wrapTable(rows);

      expect(Table).toHaveBeenCalledWith({
        head: ['col1', 'col2'],
        colWidths: expect.any(Array),
        wordWrap: true,
        wrapOnWordBoundary: true,
      });

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

      const table = new Table({});
      jest.mocked(Table).mockReturnValue(table);

      wrapTable(rows, columnWidths);

      expect(Table).toHaveBeenCalledWith({
        head: ['col1', 'col2', 'col3'],
        colWidths: [10, 20, 15],
        wordWrap: true,
        wrapOnWordBoundary: true,
      });

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

      const table = new Table({});
      jest.mocked(Table).mockReturnValue(table);

      wrapTable(rows, columnWidths);

      const defaultWidth = Math.floor(TERMINAL_MAX_WIDTH / 3); // 3 columns
      expect(Table).toHaveBeenCalledWith({
        head: ['col1', 'col2', 'col3'],
        colWidths: [10, defaultWidth, 15],
        wordWrap: true,
        wrapOnWordBoundary: true,
      });
    });
  });
});
