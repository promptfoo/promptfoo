/**
 * Tests for table navigation utilities.
 */

import { describe, expect, it } from 'vitest';
import { getVisibleRowRange } from '../../../../src/ui/components/table/useTableNavigation';
import type { TableNavigationState, FilterMode } from '../../../../src/ui/components/table/types';

/**
 * Helper to create a default navigation state.
 */
function createNavigationState(overrides: Partial<TableNavigationState> = {}): TableNavigationState {
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
