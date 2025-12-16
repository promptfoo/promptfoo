/**
 * Tests for table navigation utilities.
 */

import { describe, expect, it } from 'vitest';
import {
  getVisibleRowRange,
  navigationReducer,
} from '../../../../src/ui/components/table/useTableNavigation';
import type { TableNavigationState, FilterMode } from '../../../../src/ui/components/table/types';

/**
 * Helper to create a default navigation state.
 */
function createNavigationState(
  overrides: Partial<TableNavigationState> = {},
): TableNavigationState {
  return {
    selectedRow: 0,
    selectedCol: 0,
    expandedCell: null,
    scrollOffset: 0,
    filter: {
      mode: 'all',
      searchQuery: null,
      isSearching: false,
      columnFilters: [],
      isCommandMode: false,
      commandInput: '',
      commandError: null,
    },
    ...overrides,
  };
}

describe('getVisibleRowRange', () => {
  it('returns correct range from start', () => {
    const { start, end } = getVisibleRowRange(0, 10, 100);
    expect(start).toBe(0);
    expect(end).toBe(10);
  });

  it('returns correct range when scrolled', () => {
    const { start, end } = getVisibleRowRange(5, 10, 100);
    expect(start).toBe(5);
    expect(end).toBe(15);
  });

  it('caps end at total rows', () => {
    const { start, end } = getVisibleRowRange(95, 10, 100);
    expect(start).toBe(95);
    expect(end).toBe(100);
  });

  it('handles small datasets', () => {
    const { start, end } = getVisibleRowRange(0, 10, 5);
    expect(start).toBe(0);
    expect(end).toBe(5);
  });

  it('handles zero visible rows', () => {
    const { start, end } = getVisibleRowRange(0, 0, 100);
    expect(start).toBe(0);
    expect(end).toBe(0);
  });

  it('handles empty dataset', () => {
    const { start, end } = getVisibleRowRange(0, 10, 0);
    expect(start).toBe(0);
    expect(end).toBe(0);
  });
});

describe('TableNavigationState', () => {
  describe('default state', () => {
    it('has correct default filter state', () => {
      const state = createNavigationState();
      expect(state.filter.mode).toBe('all');
      expect(state.filter.searchQuery).toBeNull();
      expect(state.filter.isSearching).toBe(false);
      expect(state.filter.columnFilters).toEqual([]);
      expect(state.filter.isCommandMode).toBe(false);
      expect(state.filter.commandInput).toBe('');
    });

    it('has correct default navigation values', () => {
      const state = createNavigationState();
      expect(state.selectedRow).toBe(0);
      expect(state.selectedCol).toBe(0);
      expect(state.expandedCell).toBeNull();
      expect(state.scrollOffset).toBe(0);
    });
  });

  describe('filter state structure', () => {
    it('allows setting filter mode', () => {
      const state = createNavigationState({
        filter: {
          mode: 'passes',
          searchQuery: null,
          isSearching: false,
          columnFilters: [],
          isCommandMode: false,
          commandInput: '',
          commandError: null,
        },
      });
      expect(state.filter.mode).toBe('passes');
    });

    it('allows setting search query', () => {
      const state = createNavigationState({
        filter: {
          mode: 'all',
          searchQuery: 'test query',
          isSearching: false,
          columnFilters: [],
          isCommandMode: false,
          commandInput: '',
          commandError: null,
        },
      });
      expect(state.filter.searchQuery).toBe('test query');
    });

    it('allows setting column filters', () => {
      const state = createNavigationState({
        filter: {
          mode: 'all',
          searchQuery: null,
          isSearching: false,
          columnFilters: [{ column: 'score', operator: '>', value: 0.5 }],
          isCommandMode: false,
          commandInput: '',
          commandError: null,
        },
      });
      expect(state.filter.columnFilters).toHaveLength(1);
      expect(state.filter.columnFilters[0].column).toBe('score');
    });

    it('supports all filter modes', () => {
      const modes: FilterMode[] = ['all', 'passes', 'failures', 'errors', 'different'];
      modes.forEach((mode) => {
        const state = createNavigationState({
          filter: {
            mode,
            searchQuery: null,
            isSearching: false,
            columnFilters: [],
            isCommandMode: false,
            commandInput: '',
            commandError: null,
          },
        });
        expect(state.filter.mode).toBe(mode);
      });
    });
  });
});

describe('navigationReducer', () => {
  const defaultBounds = { rowCount: 10, colCount: 5, visibleRows: 5, minCol: 1 };
  const boundsNoIndex = { rowCount: 10, colCount: 5, visibleRows: 5, minCol: 0 };

  describe('MOVE_LEFT', () => {
    it('stops at minCol when index column exists', () => {
      const state = createNavigationState({ selectedCol: 2 });
      const result1 = navigationReducer(state, { type: 'MOVE_LEFT' }, defaultBounds);
      expect(result1.selectedCol).toBe(1);

      const result2 = navigationReducer(result1, { type: 'MOVE_LEFT' }, defaultBounds);
      expect(result2.selectedCol).toBe(1); // Stops at minCol=1
    });

    it('allows column 0 when no index column', () => {
      const state = createNavigationState({ selectedCol: 1 });
      const result1 = navigationReducer(state, { type: 'MOVE_LEFT' }, boundsNoIndex);
      expect(result1.selectedCol).toBe(0);

      const result2 = navigationReducer(result1, { type: 'MOVE_LEFT' }, boundsNoIndex);
      expect(result2.selectedCol).toBe(0); // Stops at minCol=0
    });
  });

  describe('NAVIGATE_EXPANDED - wrapping behavior', () => {
    it('wraps from first row to last row on up', () => {
      const state = createNavigationState({
        selectedRow: 0,
        selectedCol: 2,
        expandedCell: { row: 0, col: 2 },
      });
      const result = navigationReducer(
        state,
        { type: 'NAVIGATE_EXPANDED', direction: 'up' },
        defaultBounds,
      );
      expect(result.selectedRow).toBe(9); // Wrapped to last row
      expect(result.expandedCell).toEqual({ row: 9, col: 2 });
    });

    it('wraps from last row to first row on down', () => {
      const state = createNavigationState({
        selectedRow: 9,
        selectedCol: 2,
        expandedCell: { row: 9, col: 2 },
      });
      const result = navigationReducer(
        state,
        { type: 'NAVIGATE_EXPANDED', direction: 'down' },
        defaultBounds,
      );
      expect(result.selectedRow).toBe(0); // Wrapped to first row
      expect(result.expandedCell).toEqual({ row: 0, col: 2 });
    });

    it('wraps from first column to last column of previous row on left', () => {
      const state = createNavigationState({
        selectedRow: 5,
        selectedCol: 1,
        expandedCell: { row: 5, col: 1 },
      });
      const result = navigationReducer(
        state,
        { type: 'NAVIGATE_EXPANDED', direction: 'left' },
        defaultBounds,
      );
      expect(result.selectedRow).toBe(4); // Moved to previous row
      expect(result.selectedCol).toBe(4); // Wrapped to last column
      expect(result.expandedCell).toEqual({ row: 4, col: 4 });
    });

    it('wraps from last column to first valid column of next row on right', () => {
      const state = createNavigationState({
        selectedRow: 5,
        selectedCol: 4,
        expandedCell: { row: 5, col: 4 },
      });
      const result = navigationReducer(
        state,
        { type: 'NAVIGATE_EXPANDED', direction: 'right' },
        defaultBounds,
      );
      expect(result.selectedRow).toBe(6); // Moved to next row
      expect(result.selectedCol).toBe(1); // Wrapped to minCol
      expect(result.expandedCell).toEqual({ row: 6, col: 1 });
    });

    it('wraps around entire table from first cell', () => {
      const state = createNavigationState({
        selectedRow: 0,
        selectedCol: 1,
        expandedCell: { row: 0, col: 1 },
      });
      const result = navigationReducer(
        state,
        { type: 'NAVIGATE_EXPANDED', direction: 'left' },
        defaultBounds,
      );
      expect(result.selectedRow).toBe(9); // Wrapped to last row
      expect(result.selectedCol).toBe(4); // Last column
      expect(result.expandedCell).toEqual({ row: 9, col: 4 });
    });

    it('wraps around entire table from last cell', () => {
      const state = createNavigationState({
        selectedRow: 9,
        selectedCol: 4,
        expandedCell: { row: 9, col: 4 },
      });
      const result = navigationReducer(
        state,
        { type: 'NAVIGATE_EXPANDED', direction: 'right' },
        defaultBounds,
      );
      expect(result.selectedRow).toBe(0); // Wrapped to first row
      expect(result.selectedCol).toBe(1); // First valid column (minCol)
      expect(result.expandedCell).toEqual({ row: 0, col: 1 });
    });

    it('respects minCol=0 when no index column', () => {
      const state = createNavigationState({
        selectedRow: 5,
        selectedCol: 4,
        expandedCell: { row: 5, col: 4 },
      });
      const result = navigationReducer(
        state,
        { type: 'NAVIGATE_EXPANDED', direction: 'right' },
        boundsNoIndex,
      );
      expect(result.selectedRow).toBe(6);
      expect(result.selectedCol).toBe(0); // Wrapped to column 0
    });
  });

  describe('edge cases', () => {
    it('handles single row table', () => {
      const singleRowBounds = { rowCount: 1, colCount: 5, visibleRows: 1, minCol: 1 };
      const state = createNavigationState({ selectedRow: 0, selectedCol: 2 });

      const upResult = navigationReducer(state, { type: 'MOVE_UP' }, singleRowBounds);
      expect(upResult.selectedRow).toBe(0); // Stays at 0

      const downResult = navigationReducer(state, { type: 'MOVE_DOWN' }, singleRowBounds);
      expect(downResult.selectedRow).toBe(0); // Stays at 0
    });

    it('handles single column table (with index)', () => {
      const singleColBounds = { rowCount: 5, colCount: 2, visibleRows: 5, minCol: 1 };
      const state = createNavigationState({ selectedRow: 2, selectedCol: 1 });

      const leftResult = navigationReducer(state, { type: 'MOVE_LEFT' }, singleColBounds);
      expect(leftResult.selectedCol).toBe(1); // Stays at minCol

      const rightResult = navigationReducer(state, { type: 'MOVE_RIGHT' }, singleColBounds);
      expect(rightResult.selectedCol).toBe(1); // Can't go past col 1
    });

    it('handles NAVIGATE_EXPANDED with single row (wraps to same row)', () => {
      const singleRowBounds = { rowCount: 1, colCount: 5, visibleRows: 1, minCol: 1 };
      const state = createNavigationState({
        selectedRow: 0,
        selectedCol: 2,
        expandedCell: { row: 0, col: 2 },
      });

      const upResult = navigationReducer(
        state,
        { type: 'NAVIGATE_EXPANDED', direction: 'up' },
        singleRowBounds,
      );
      expect(upResult.selectedRow).toBe(0); // Wraps back to row 0

      const leftResult = navigationReducer(
        createNavigationState({ selectedRow: 0, selectedCol: 1, expandedCell: { row: 0, col: 1 } }),
        { type: 'NAVIGATE_EXPANDED', direction: 'left' },
        singleRowBounds,
      );
      expect(leftResult.selectedRow).toBe(0); // Still row 0
      expect(leftResult.selectedCol).toBe(4); // Wrapped to last column
    });
  });
});
