/**
 * Performance benchmarks for table components.
 *
 * These benchmarks test the performance of filtering, processing,
 * and memoization with large datasets to ensure the UI remains responsive.
 *
 * Run benchmarks: npx vitest bench test/ui/components/table/performance.bench.ts
 *
 * Performance targets:
 * - Filter 1000 rows: < 50ms
 * - Filter 10000 rows: < 500ms
 * - Row comparison: < 0.01ms per row
 * - Process row: < 0.1ms per row
 */

import { bench, describe } from 'vitest';
import { ResultFailureReason } from '../../../../src/types';
import {
  filterRows,
  matchesQuery,
  parseSearchQuery,
} from '../../../../src/ui/components/table/filterUtils';
import {
  areColumnsEqual,
  areRowDataEqual,
  areTableRowPropsEqual,
} from '../../../../src/ui/components/table/rowComparison';
import { getCellStatus } from '../../../../src/ui/components/table/types';

import type {
  TableCellData,
  TableColumn,
  TableFilterState,
  TableRowData,
  TableRowProps,
} from '../../../../src/ui/components/table/types';

/**
 * Generate mock evaluation output data.
 */
function createMockOutput(index: number, pass: boolean) {
  return {
    text: `Output for test ${index}. This is some test content that might be longer for testing truncation behavior.`,
    pass,
    score: pass ? 1 : 0,
    cost: 0.001,
    id: `output-${index}`,
    latencyMs: 100 + Math.random() * 500,
    namedScores: {},
    prompt: `prompt ${index}`,
    provider: 'test-provider',
    testCase: { vars: { var1: `value-${index}` } },
    tokenUsage: { total: 100, prompt: 50, completion: 50 },
    failureReason: pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
  };
}

/**
 * Generate a TableCellData object.
 */
function createMockCellData(index: number, pass: boolean): TableCellData {
  const output = createMockOutput(index, pass);
  return {
    content: output.text,
    displayContent: output.text.slice(0, 100),
    status: getCellStatus(pass, output.failureReason),
    isTruncated: output.text.length > 100,
    output,
  };
}

/**
 * Generate a TableRowData object.
 */
function createMockRowData(index: number): TableRowData {
  const pass = index % 3 !== 0; // 2/3 pass, 1/3 fail
  return {
    index,
    testIdx: index,
    cells: [
      createMockCellData(index, pass),
      createMockCellData(index + 1000, !pass), // Second provider with different result
    ],
    originalRow: {
      vars: [`variable-${index}`, `another-var-${index}`],
      outputs: [createMockOutput(index, pass), createMockOutput(index + 1000, !pass)],
      testIdx: index,
      test: { vars: { var1: `value-${index}`, var2: `value2-${index}` } },
    },
  };
}

/**
 * Generate mock column definitions.
 */
function createMockColumns(): TableColumn[] {
  return [
    { id: 'index', header: '#', type: 'index', width: 5 },
    { id: 'var-0', header: 'Variable 1', type: 'var', width: 30 },
    { id: 'var-1', header: 'Variable 2', type: 'var', width: 30 },
    { id: 'output-0', header: 'Provider 1', type: 'output', width: 50 },
    { id: 'output-1', header: 'Provider 2', type: 'output', width: 50 },
  ];
}

/**
 * Generate a dataset of mock rows.
 */
function generateDataset(size: number): TableRowData[] {
  const rows: TableRowData[] = [];
  for (let i = 0; i < size; i++) {
    rows.push(createMockRowData(i));
  }
  return rows;
}

// Pre-generate datasets for benchmarks
const SMALL_DATASET = generateDataset(100);
const MEDIUM_DATASET = generateDataset(1000);
const LARGE_DATASET = generateDataset(10000);

const DEFAULT_FILTER_STATE: TableFilterState = {
  mode: 'all',
  searchQuery: null,
  isSearching: false,
  columnFilters: [],
  isCommandMode: false,
  commandInput: '',
  commandError: null,
};

describe('filterRows performance', () => {
  bench('filter 100 rows - all', () => {
    filterRows(SMALL_DATASET, DEFAULT_FILTER_STATE);
  });

  bench('filter 1000 rows - all', () => {
    filterRows(MEDIUM_DATASET, DEFAULT_FILTER_STATE);
  });

  bench('filter 10000 rows - all', () => {
    filterRows(LARGE_DATASET, DEFAULT_FILTER_STATE);
  });

  bench('filter 1000 rows - passes', () => {
    filterRows(MEDIUM_DATASET, { ...DEFAULT_FILTER_STATE, mode: 'passes' });
  });

  bench('filter 1000 rows - failures', () => {
    filterRows(MEDIUM_DATASET, { ...DEFAULT_FILTER_STATE, mode: 'failures' });
  });

  bench('filter 1000 rows - different', () => {
    filterRows(MEDIUM_DATASET, { ...DEFAULT_FILTER_STATE, mode: 'different' });
  });

  bench('filter 1000 rows - search query', () => {
    filterRows(MEDIUM_DATASET, { ...DEFAULT_FILTER_STATE, searchQuery: 'variable-500' });
  });

  bench('filter 1000 rows - regex search', () => {
    filterRows(MEDIUM_DATASET, { ...DEFAULT_FILTER_STATE, searchQuery: '/variable-5\\d+/i' });
  });

  bench('filter 10000 rows - search query', () => {
    filterRows(LARGE_DATASET, { ...DEFAULT_FILTER_STATE, searchQuery: 'variable-5000' });
  });

  bench('filter 10000 rows - combined filters', () => {
    filterRows(LARGE_DATASET, {
      ...DEFAULT_FILTER_STATE,
      mode: 'failures',
      searchQuery: 'output',
      columnFilters: [{ column: 'score', operator: '<', value: 0.5 }],
    });
  });
});

describe('matchesQuery performance', () => {
  const longContent = 'x'.repeat(10000) + 'needle' + 'x'.repeat(10000);
  const shortContent = 'This is a short test string with needle in it';

  bench('short string - literal match', () => {
    matchesQuery(shortContent, 'needle');
  });

  bench('long string (20k chars) - literal match', () => {
    matchesQuery(longContent, 'needle');
  });

  bench('short string - regex match', () => {
    const parsed = parseSearchQuery('/need\\w+/i');
    matchesQuery(shortContent, '/need\\w+/i', parsed);
  });

  bench('long string - regex match', () => {
    const parsed = parseSearchQuery('/need\\w+/i');
    matchesQuery(longContent, '/need\\w+/i', parsed);
  });
});

describe('row comparison performance', () => {
  const columns = createMockColumns();
  const rowData1 = createMockRowData(0);
  const rowData2 = createMockRowData(0); // Same data, different object

  bench('areColumnsEqual - same reference', () => {
    areColumnsEqual(columns, columns);
  });

  bench('areColumnsEqual - equal arrays', () => {
    const columns2 = createMockColumns();
    areColumnsEqual(columns, columns2);
  });

  bench('areRowDataEqual - same reference', () => {
    areRowDataEqual(rowData1, rowData1);
  });

  bench('areRowDataEqual - equal data', () => {
    areRowDataEqual(rowData1, rowData2);
  });

  bench('areTableRowPropsEqual - no change', () => {
    const props: TableRowProps = {
      rowData: rowData1,
      columns,
      isSelected: false,
      selectedCol: 0,
      isCompact: false,
    };
    areTableRowPropsEqual(props, props);
  });

  bench('areTableRowPropsEqual - selection change', () => {
    const props1: TableRowProps = {
      rowData: rowData1,
      columns,
      isSelected: false,
      selectedCol: 0,
      isCompact: false,
    };
    const props2: TableRowProps = {
      rowData: rowData1,
      columns,
      isSelected: true,
      selectedCol: 0,
      isCompact: false,
    };
    areTableRowPropsEqual(props1, props2);
  });

  // Benchmark batch comparisons (typical use case)
  const batchRows = MEDIUM_DATASET.slice(0, 100);
  bench('compare 100 rows for memoization', () => {
    const prevProps: TableRowProps = {
      rowData: batchRows[0],
      columns,
      isSelected: false,
      selectedCol: 0,
      isCompact: false,
    };
    for (let i = 0; i < batchRows.length; i++) {
      const nextProps: TableRowProps = {
        rowData: batchRows[i],
        columns,
        isSelected: i === 50,
        selectedCol: 0,
        isCompact: false,
      };
      areTableRowPropsEqual(prevProps, nextProps);
    }
  });
});

describe('getCellStatus performance', () => {
  bench('getCellStatus - pass', () => {
    getCellStatus(true, ResultFailureReason.NONE);
  });

  bench('getCellStatus - fail', () => {
    getCellStatus(false, ResultFailureReason.ASSERT);
  });

  bench('getCellStatus - error', () => {
    getCellStatus(false, ResultFailureReason.ERROR);
  });

  // Batch processing
  bench('getCellStatus - 1000 calls', () => {
    for (let i = 0; i < 1000; i++) {
      getCellStatus(
        i % 2 === 0,
        i % 3 === 0 ? ResultFailureReason.ASSERT : ResultFailureReason.NONE,
      );
    }
  });
});
