/**
 * Tests for table filter utilities.
 */

import { describe, expect, it } from 'vitest';
import {
  filterRows,
  getFilterModeLabel,
  hasActiveFilter,
} from '../../../../src/ui/components/table/filterUtils';
import type {
  TableFilterState,
  TableRowData,
} from '../../../../src/ui/components/table/types';

/**
 * Create a mock row for testing.
 */
function createMockRow(
  index: number,
  cells: Array<{ content: string; status: 'pass' | 'fail' | 'error' | null }>,
  vars: string[] = [],
): TableRowData {
  return {
    index,
    testIdx: index,
    cells: cells.map((cell) => ({
      content: cell.content,
      displayContent: cell.content,
      status: cell.status,
      isTruncated: false,
      output: {
        text: cell.content,
        pass: cell.status === 'pass',
        score: cell.status === 'pass' ? 1 : 0,
        cost: 0.01,
        latencyMs: 100,
        provider: 'test-provider',
        failureReason: cell.status === 'error' ? 2 : cell.status === 'fail' ? 1 : 0,
        namedScores: {},
        id: `row-${index}`,
        tokenUsage: {},
      },
    })),
    originalRow: {
      vars: vars,
      outputs: [],
      testIdx: index,
    },
  };
}

/**
 * Create default filter state.
 */
function createFilterState(overrides: Partial<TableFilterState> = {}): TableFilterState {
  return {
    mode: 'all',
    searchQuery: null,
    isSearching: false,
    columnFilters: [],
    isCommandMode: false,
    commandInput: '',
    ...overrides,
  };
}

describe('filterRows', () => {
  const testRows: TableRowData[] = [
    createMockRow(0, [{ content: 'pass result 1', status: 'pass' }], ['input1']),
    createMockRow(1, [{ content: 'fail result 1', status: 'fail' }], ['input2']),
    createMockRow(2, [{ content: 'error result', status: 'error' }], ['input3']),
    createMockRow(3, [{ content: 'pass result 2', status: 'pass' }], ['input4']),
    createMockRow(4, [{ content: 'fail result 2', status: 'fail' }], ['input5']),
  ];

  describe('filter mode: all', () => {
    it('returns all rows when mode is all', () => {
      const filterState = createFilterState({ mode: 'all' });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(5);
    });
  });

  describe('filter mode: passes', () => {
    it('returns only rows where all cells pass', () => {
      const filterState = createFilterState({ mode: 'passes' });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.index)).toEqual([0, 3]);
    });

    it('returns empty array when no passes', () => {
      const rows = [
        createMockRow(0, [{ content: 'fail', status: 'fail' }]),
        createMockRow(1, [{ content: 'error', status: 'error' }]),
      ];
      const filterState = createFilterState({ mode: 'passes' });
      const result = filterRows(rows, filterState);
      expect(result).toHaveLength(0);
    });
  });

  describe('filter mode: failures', () => {
    it('returns only rows with at least one failure', () => {
      const filterState = createFilterState({ mode: 'failures' });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.index)).toEqual([1, 4]);
    });

    it('does not include errors as failures', () => {
      const rows = [
        createMockRow(0, [{ content: 'error', status: 'error' }]),
      ];
      const filterState = createFilterState({ mode: 'failures' });
      const result = filterRows(rows, filterState);
      expect(result).toHaveLength(0);
    });
  });

  describe('filter mode: errors', () => {
    it('returns only rows with at least one error', () => {
      const filterState = createFilterState({ mode: 'errors' });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(2);
    });
  });

  describe('filter mode: different', () => {
    it('returns rows where outputs differ across providers', () => {
      const multiProviderRows = [
        createMockRow(
          0,
          [
            { content: 'same', status: 'pass' },
            { content: 'same', status: 'pass' },
          ],
          [],
        ),
        createMockRow(
          1,
          [
            { content: 'different1', status: 'pass' },
            { content: 'different2', status: 'pass' },
          ],
          [],
        ),
        createMockRow(
          2,
          [
            { content: 'also same', status: 'fail' },
            { content: 'also same', status: 'fail' },
          ],
          [],
        ),
      ];
      const filterState = createFilterState({ mode: 'different' });
      const result = filterRows(multiProviderRows, filterState);
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(1);
    });

    it('returns empty for single-provider results', () => {
      const singleProviderRows = [
        createMockRow(0, [{ content: 'only one', status: 'pass' }]),
      ];
      const filterState = createFilterState({ mode: 'different' });
      const result = filterRows(singleProviderRows, filterState);
      expect(result).toHaveLength(0);
    });
  });

  describe('search query', () => {
    it('filters by search query in output content', () => {
      const filterState = createFilterState({ searchQuery: 'pass result' });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.index)).toEqual([0, 3]);
    });

    it('is case-insensitive', () => {
      const filterState = createFilterState({ searchQuery: 'PASS RESULT' });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(2);
    });

    it('searches in variable content', () => {
      const filterState = createFilterState({ searchQuery: 'input3' });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(2);
    });

    it('returns all rows when search query is null', () => {
      const filterState = createFilterState({ searchQuery: null });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(5);
    });
  });

  describe('combined filters', () => {
    it('applies mode and search query together (AND logic)', () => {
      const filterState = createFilterState({
        mode: 'passes',
        searchQuery: 'result 1',
      });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(0);
    });

    it('returns empty when no rows match all filters', () => {
      const filterState = createFilterState({
        mode: 'errors',
        searchQuery: 'nonexistent',
      });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(0);
    });
  });

  describe('search state integration', () => {
    it('filters correctly during active search', () => {
      const filterState = createFilterState({
        searchQuery: 'error',
        isSearching: true, // Search is active
      });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(2);
    });

    it('preserves original indices after search', () => {
      const filterState = createFilterState({
        searchQuery: 'fail',
      });
      const result = filterRows(testRows, filterState);
      expect(result).toHaveLength(2);
      // Original indices should be preserved
      expect(result[0].index).toBe(1);
      expect(result[1].index).toBe(4);
    });

    it('filters by partial match', () => {
      const filterState = createFilterState({
        searchQuery: 'res', // Partial match for 'result'
      });
      const result = filterRows(testRows, filterState);
      // All rows contain 'res' in their content
      expect(result).toHaveLength(5);
    });

    it('handles empty search query', () => {
      const filterState = createFilterState({
        searchQuery: '',
        isSearching: true,
      });
      const result = filterRows(testRows, filterState);
      // Empty query should match all (treated as null internally)
      expect(result).toHaveLength(5);
    });
  });
});

describe('getFilterModeLabel', () => {
  it('returns correct labels', () => {
    expect(getFilterModeLabel('all')).toBe('all');
    expect(getFilterModeLabel('passes')).toBe('passes');
    expect(getFilterModeLabel('failures')).toBe('failures');
    expect(getFilterModeLabel('errors')).toBe('errors');
    expect(getFilterModeLabel('different')).toBe('different');
  });
});

describe('hasActiveFilter', () => {
  it('returns false for default state', () => {
    const filterState = createFilterState();
    expect(hasActiveFilter(filterState)).toBe(false);
  });

  it('returns true when mode is not all', () => {
    const filterState = createFilterState({ mode: 'passes' });
    expect(hasActiveFilter(filterState)).toBe(true);
  });

  it('returns true when search query is set', () => {
    const filterState = createFilterState({ searchQuery: 'test' });
    expect(hasActiveFilter(filterState)).toBe(true);
  });

  it('returns true when column filters are set', () => {
    const filterState = createFilterState({
      columnFilters: [{ column: 'score', operator: '>', value: 0.5 }],
    });
    expect(hasActiveFilter(filterState)).toBe(true);
  });

  it('returns true when multiple filters are active', () => {
    const filterState = createFilterState({
      mode: 'failures',
      searchQuery: 'error',
    });
    expect(hasActiveFilter(filterState)).toBe(true);
  });
});
