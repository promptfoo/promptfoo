import { describe, expect, it } from 'vitest';
import { ResultFailureReason } from '../../../../src/types';
import {
  areColumnsEqual,
  areCompactRowPropsEqual,
  areRowDataEqual,
  areTableRowPropsEqual,
} from '../../../../src/ui/components/table/rowComparison';

import type {
  TableColumn,
  TableRowData,
  TableRowProps,
} from '../../../../src/ui/components/table/types';

const createMockColumn = (overrides: Partial<TableColumn> = {}): TableColumn => ({
  id: 'col-1',
  header: 'Test Column',
  type: 'output',
  width: 20,
  ...overrides,
});

const createMockRowData = (overrides: Partial<TableRowData> = {}): TableRowData => ({
  index: 0,
  testIdx: 0,
  cells: [
    {
      content: 'Test content',
      displayContent: 'Test content',
      status: 'pass',
      isTruncated: false,
    },
  ],
  originalRow: {
    vars: ['var1'],
    outputs: [
      {
        pass: true,
        score: 1,
        text: 'output',
        failureReason: ResultFailureReason.NONE,
        cost: 0,
        id: 'test-id',
        latencyMs: 100,
        namedScores: {},
        prompt: 'test',
        provider: 'test-provider',
        testCase: { vars: { var1: 'val1' } },
        tokenUsage: {},
      },
    ],
    testIdx: 0,
    test: { vars: { var1: 'val1' } },
  },
  ...overrides,
});

describe('rowComparison', () => {
  describe('areColumnsEqual', () => {
    it('returns true for reference-equal columns', () => {
      const columns = [createMockColumn()];
      expect(areColumnsEqual(columns, columns)).toBe(true);
    });

    it('returns true for structurally equal columns', () => {
      const columns1 = [createMockColumn({ id: 'col-1', width: 20 })];
      const columns2 = [createMockColumn({ id: 'col-1', width: 20 })];
      expect(areColumnsEqual(columns1, columns2)).toBe(true);
    });

    it('returns false for different length arrays', () => {
      const columns1 = [createMockColumn()];
      const columns2 = [createMockColumn(), createMockColumn({ id: 'col-2' })];
      expect(areColumnsEqual(columns1, columns2)).toBe(false);
    });

    it('returns false for different column widths', () => {
      const columns1 = [createMockColumn({ width: 20 })];
      const columns2 = [createMockColumn({ width: 30 })];
      expect(areColumnsEqual(columns1, columns2)).toBe(false);
    });

    it('returns false for different column types', () => {
      const columns1 = [createMockColumn({ type: 'output' })];
      const columns2 = [createMockColumn({ type: 'var' })];
      expect(areColumnsEqual(columns1, columns2)).toBe(false);
    });

    it('returns false for different column ids', () => {
      const columns1 = [createMockColumn({ id: 'col-1' })];
      const columns2 = [createMockColumn({ id: 'col-2' })];
      expect(areColumnsEqual(columns1, columns2)).toBe(false);
    });
  });

  describe('areRowDataEqual', () => {
    it('returns true for reference-equal row data', () => {
      const rowData = createMockRowData();
      expect(areRowDataEqual(rowData, rowData)).toBe(true);
    });

    it('returns false for different testIdx', () => {
      const row1 = createMockRowData({ testIdx: 0 });
      const row2 = createMockRowData({ testIdx: 1 });
      expect(areRowDataEqual(row1, row2)).toBe(false);
    });

    it('returns false for different index', () => {
      const row1 = createMockRowData({ index: 0 });
      const row2 = createMockRowData({ index: 1 });
      expect(areRowDataEqual(row1, row2)).toBe(false);
    });

    it('returns true for reference-equal cells', () => {
      const cells = [
        { content: 'test', displayContent: 'test', status: 'pass' as const, isTruncated: false },
      ];
      const row1 = createMockRowData({ cells });
      const row2 = { ...row1, cells };
      expect(areRowDataEqual(row1, row2)).toBe(true);
    });

    it('returns false for different cell count', () => {
      const row1 = createMockRowData({
        cells: [{ content: 'test', displayContent: 'test', status: 'pass', isTruncated: false }],
      });
      const row2 = createMockRowData({
        cells: [
          { content: 'test', displayContent: 'test', status: 'pass', isTruncated: false },
          { content: 'test2', displayContent: 'test2', status: 'pass', isTruncated: false },
        ],
      });
      expect(areRowDataEqual(row1, row2)).toBe(false);
    });

    it('returns false for different cell status', () => {
      const row1 = createMockRowData({
        cells: [{ content: 'test', displayContent: 'test', status: 'pass', isTruncated: false }],
      });
      const row2 = createMockRowData({
        cells: [{ content: 'test', displayContent: 'test', status: 'fail', isTruncated: false }],
      });
      expect(areRowDataEqual(row1, row2)).toBe(false);
    });

    it('returns false for different displayContent', () => {
      const row1 = createMockRowData({
        cells: [{ content: 'test', displayContent: 'test', status: 'pass', isTruncated: false }],
      });
      const row2 = createMockRowData({
        cells: [
          { content: 'test', displayContent: 'different', status: 'pass', isTruncated: false },
        ],
      });
      expect(areRowDataEqual(row1, row2)).toBe(false);
    });

    it('returns false for different isTruncated', () => {
      const row1 = createMockRowData({
        cells: [{ content: 'test', displayContent: 'test', status: 'pass', isTruncated: false }],
      });
      const row2 = createMockRowData({
        cells: [{ content: 'test', displayContent: 'test', status: 'pass', isTruncated: true }],
      });
      expect(areRowDataEqual(row1, row2)).toBe(false);
    });
  });

  describe('areTableRowPropsEqual', () => {
    const createMockProps = (overrides: Partial<TableRowProps> = {}): TableRowProps => ({
      rowData: createMockRowData(),
      columns: [createMockColumn()],
      isSelected: false,
      selectedCol: 0,
      isCompact: false,
      ...overrides,
    });

    it('returns true for equal props', () => {
      const rowData = createMockRowData();
      const columns = [createMockColumn()];
      const props1 = createMockProps({ rowData, columns });
      const props2 = createMockProps({ rowData, columns });
      expect(areTableRowPropsEqual(props1, props2)).toBe(true);
    });

    it('returns false for different isSelected', () => {
      const rowData = createMockRowData();
      const columns = [createMockColumn()];
      const props1 = createMockProps({ rowData, columns, isSelected: false });
      const props2 = createMockProps({ rowData, columns, isSelected: true });
      expect(areTableRowPropsEqual(props1, props2)).toBe(false);
    });

    it('returns false for different selectedCol when selected', () => {
      const rowData = createMockRowData();
      const columns = [createMockColumn()];
      const props1 = createMockProps({ rowData, columns, isSelected: true, selectedCol: 0 });
      const props2 = createMockProps({ rowData, columns, isSelected: true, selectedCol: 1 });
      expect(areTableRowPropsEqual(props1, props2)).toBe(false);
    });

    it('ignores selectedCol when not selected', () => {
      const rowData = createMockRowData();
      const columns = [createMockColumn()];
      const props1 = createMockProps({ rowData, columns, isSelected: false, selectedCol: 0 });
      const props2 = createMockProps({ rowData, columns, isSelected: false, selectedCol: 1 });
      expect(areTableRowPropsEqual(props1, props2)).toBe(true);
    });

    it('returns false for different isCompact', () => {
      const rowData = createMockRowData();
      const columns = [createMockColumn()];
      const props1 = createMockProps({ rowData, columns, isCompact: false });
      const props2 = createMockProps({ rowData, columns, isCompact: true });
      expect(areTableRowPropsEqual(props1, props2)).toBe(false);
    });
  });

  describe('areCompactRowPropsEqual', () => {
    it('returns true for equal props', () => {
      const rowData = createMockRowData();
      const props1 = { rowData, isSelected: false };
      const props2 = { rowData, isSelected: false };
      expect(areCompactRowPropsEqual(props1, props2)).toBe(true);
    });

    it('returns false for different isSelected', () => {
      const rowData = createMockRowData();
      const props1 = { rowData, isSelected: false };
      const props2 = { rowData, isSelected: true };
      expect(areCompactRowPropsEqual(props1, props2)).toBe(false);
    });

    it('returns false for different row data', () => {
      const props1 = { rowData: createMockRowData({ testIdx: 0 }), isSelected: false };
      const props2 = { rowData: createMockRowData({ testIdx: 1 }), isSelected: false };
      expect(areCompactRowPropsEqual(props1, props2)).toBe(false);
    });
  });
});
