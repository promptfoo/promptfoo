/**
 * useTableNavigation - Hook for keyboard navigation in the results table.
 *
 * Features:
 * - Arrow key navigation (row and column)
 * - Page up/down for quick scrolling
 * - Home/End for first/last row
 * - Enter to expand cell
 * - Q to close expanded cell or exit table
 * - Escape also closes expanded cell or exits
 * - Quick filter modes (a/p/f/e/d)
 * - Search filter (/)
 * - Column filters (:filter command)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseFilterCommand } from './CommandInput';
import { isRawModeSupported, useKeypress } from '../../hooks/useKeypress';
import type { FilterMode, TableFilterState, TableNavigationState } from './types';

/**
 * Default filter state.
 */
const DEFAULT_FILTER_STATE: TableFilterState = {
  mode: 'all',
  searchQuery: null,
  isSearching: false,
  columnFilters: [],
  isCommandMode: false,
  commandInput: '',
  commandError: null,
};

/**
 * Navigation action types.
 */
type NavigationAction =
  | { type: 'MOVE_UP' }
  | { type: 'MOVE_DOWN' }
  | { type: 'MOVE_LEFT' }
  | { type: 'MOVE_RIGHT' }
  | { type: 'PAGE_UP' }
  | { type: 'PAGE_DOWN' }
  | { type: 'GO_FIRST' }
  | { type: 'GO_LAST' }
  | { type: 'TOGGLE_EXPAND' }
  | { type: 'CLOSE_EXPAND' }
  | { type: 'NAVIGATE_EXPANDED'; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'SET_SCROLL'; offset: number }
  // Filter actions
  | { type: 'SET_FILTER_MODE'; mode: FilterMode }
  | { type: 'START_SEARCH' }
  | { type: 'UPDATE_SEARCH'; query: string }
  | { type: 'APPLY_SEARCH' }
  | { type: 'CANCEL_SEARCH' }
  | { type: 'CLEAR_SEARCH' }
  | { type: 'START_COMMAND' }
  | { type: 'UPDATE_COMMAND'; input: string }
  | { type: 'EXECUTE_COMMAND' }
  | { type: 'CANCEL_COMMAND' }
  | { type: 'SET_COMMAND_ERROR'; error: string }
  | { type: 'CLEAR_FILTERS' }
  | {
      type: 'ADD_COLUMN_FILTER';
      filter: { column: string; operator: string; value: string | number };
    }
  | { type: 'CLEAR_COLUMN_FILTERS' }
  | { type: 'CLAMP_SELECTION'; maxRow: number };

/**
 * Export NavigationAction for use in other components.
 */
export type { NavigationAction };

/**
 * Reduce navigation state based on action.
 * Exported for testing.
 */
export function navigationReducer(
  state: TableNavigationState,
  action: NavigationAction,
  bounds: { rowCount: number; colCount: number; visibleRows: number; minCol: number },
): TableNavigationState {
  const { rowCount, colCount, visibleRows, minCol } = bounds;

  switch (action.type) {
    case 'MOVE_UP': {
      const newRow = Math.max(0, state.selectedRow - 1);
      const newOffset = newRow < state.scrollOffset ? newRow : Math.min(state.scrollOffset, newRow);
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'MOVE_DOWN': {
      const newRow = Math.min(rowCount - 1, state.selectedRow + 1);
      const newOffset =
        newRow >= state.scrollOffset + visibleRows ? newRow - visibleRows + 1 : state.scrollOffset;
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'MOVE_LEFT':
      // Minimum column depends on whether there's an index column
      return { ...state, selectedCol: Math.max(minCol, state.selectedCol - 1) };

    case 'MOVE_RIGHT':
      return { ...state, selectedCol: Math.min(colCount - 1, state.selectedCol + 1) };

    case 'PAGE_UP': {
      const newRow = Math.max(0, state.selectedRow - visibleRows);
      const newOffset = Math.max(0, state.scrollOffset - visibleRows);
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'PAGE_DOWN': {
      const newRow = Math.min(rowCount - 1, state.selectedRow + visibleRows);
      const maxOffset = Math.max(0, rowCount - visibleRows);
      const newOffset = Math.min(maxOffset, state.scrollOffset + visibleRows);
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'GO_FIRST':
      return { ...state, selectedRow: 0, scrollOffset: 0 };

    case 'GO_LAST': {
      const newRow = rowCount - 1;
      const newOffset = Math.max(0, rowCount - visibleRows);
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'TOGGLE_EXPAND':
      if (state.expandedCell) {
        return { ...state, expandedCell: null };
      }
      return {
        ...state,
        expandedCell: { row: state.selectedRow, col: state.selectedCol },
      };

    case 'CLOSE_EXPAND':
      return { ...state, expandedCell: null };

    case 'NAVIGATE_EXPANDED': {
      // Navigate while keeping detail view open
      // Skip index column if present
      const maxCol = colCount - 1;
      const maxRow = rowCount - 1;

      let newRow = state.selectedRow;
      let newCol = state.selectedCol;
      let newOffset = state.scrollOffset;

      switch (action.direction) {
        case 'up':
          // Wrap to last row if at first row
          newRow = state.selectedRow > 0 ? state.selectedRow - 1 : maxRow;
          if (newRow < newOffset) {
            newOffset = newRow;
          } else if (newRow >= newOffset + visibleRows) {
            // Wrapped to bottom, adjust scroll
            newOffset = Math.max(0, newRow - visibleRows + 1);
          }
          break;
        case 'down':
          // Wrap to first row if at last row
          newRow = state.selectedRow < maxRow ? state.selectedRow + 1 : 0;
          if (newRow >= newOffset + visibleRows) {
            newOffset = newRow - visibleRows + 1;
          } else if (newRow < newOffset) {
            // Wrapped to top, adjust scroll
            newOffset = 0;
          }
          break;
        case 'left':
          if (state.selectedCol > minCol) {
            // Move left within row
            newCol = state.selectedCol - 1;
          } else {
            // At leftmost valid column, wrap to last column of previous row
            newCol = maxCol;
            newRow = state.selectedRow > 0 ? state.selectedRow - 1 : maxRow;
            if (newRow < newOffset) {
              newOffset = newRow;
            } else if (newRow >= newOffset + visibleRows) {
              newOffset = Math.max(0, newRow - visibleRows + 1);
            }
          }
          break;
        case 'right':
          if (state.selectedCol < maxCol) {
            // Move right within row
            newCol = state.selectedCol + 1;
          } else {
            // At rightmost column, wrap to first valid column of next row
            newCol = minCol;
            newRow = state.selectedRow < maxRow ? state.selectedRow + 1 : 0;
            if (newRow >= newOffset + visibleRows) {
              newOffset = newRow - visibleRows + 1;
            } else if (newRow < newOffset) {
              newOffset = 0;
            }
          }
          break;
      }

      return {
        ...state,
        selectedRow: newRow,
        selectedCol: newCol,
        scrollOffset: newOffset,
        expandedCell: { row: newRow, col: newCol },
      };
    }

    case 'SET_SCROLL':
      return { ...state, scrollOffset: action.offset };

    // Filter actions
    case 'SET_FILTER_MODE':
      // Reset selection when filter changes
      // When setting to 'all', also clear search and column filters for easy reset
      if (action.mode === 'all') {
        return {
          ...state,
          selectedRow: 0,
          scrollOffset: 0,
          filter: DEFAULT_FILTER_STATE,
        };
      }
      return {
        ...state,
        selectedRow: 0,
        scrollOffset: 0,
        filter: { ...state.filter, mode: action.mode },
      };

    case 'START_SEARCH':
      return {
        ...state,
        filter: { ...state.filter, isSearching: true, searchQuery: '' },
      };

    case 'UPDATE_SEARCH':
      return {
        ...state,
        filter: { ...state.filter, searchQuery: action.query },
      };

    case 'APPLY_SEARCH':
      // Apply search and reset selection
      return {
        ...state,
        selectedRow: 0,
        scrollOffset: 0,
        filter: { ...state.filter, isSearching: false },
      };

    case 'CANCEL_SEARCH':
      // Cancel without applying - restore previous query
      return {
        ...state,
        filter: { ...state.filter, isSearching: false },
      };

    case 'CLEAR_SEARCH':
      return {
        ...state,
        selectedRow: 0,
        scrollOffset: 0,
        filter: { ...state.filter, searchQuery: null, isSearching: false },
      };

    case 'START_COMMAND':
      return {
        ...state,
        filter: { ...state.filter, isCommandMode: true, commandInput: '' },
      };

    case 'UPDATE_COMMAND':
      return {
        ...state,
        filter: { ...state.filter, commandInput: action.input, commandError: null },
      };

    case 'EXECUTE_COMMAND':
      // Command execution is handled outside the reducer
      return {
        ...state,
        filter: { ...state.filter, isCommandMode: false, commandInput: '' },
      };

    case 'CANCEL_COMMAND':
      return {
        ...state,
        filter: { ...state.filter, isCommandMode: false, commandInput: '', commandError: null },
      };

    case 'SET_COMMAND_ERROR':
      return {
        ...state,
        filter: { ...state.filter, commandError: action.error },
      };

    case 'CLEAR_FILTERS':
      return {
        ...state,
        selectedRow: 0,
        scrollOffset: 0,
        filter: DEFAULT_FILTER_STATE,
      };

    case 'ADD_COLUMN_FILTER':
      return {
        ...state,
        selectedRow: 0,
        scrollOffset: 0,
        filter: {
          ...state.filter,
          columnFilters: [
            ...state.filter.columnFilters,
            action.filter as {
              column: string;
              operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | '~' | '!~';
              value: string | number;
            },
          ],
        },
      };

    case 'CLEAR_COLUMN_FILTERS':
      return {
        ...state,
        selectedRow: 0,
        scrollOffset: 0,
        filter: {
          ...state.filter,
          columnFilters: [],
        },
      };

    case 'CLAMP_SELECTION': {
      const maxValidRow = Math.max(0, action.maxRow - 1);
      if (state.selectedRow <= maxValidRow) {
        return state; // No change needed
      }
      // Clamp selection to valid range
      const newRow = Math.min(state.selectedRow, maxValidRow);
      const newOffset = Math.min(state.scrollOffset, Math.max(0, action.maxRow - visibleRows));
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    default:
      return state;
  }
}

/**
 * Options for useTableNavigation hook.
 */
export interface UseTableNavigationOptions {
  /** Total number of rows */
  rowCount: number;
  /** Total number of columns */
  colCount: number;
  /** Number of visible rows */
  visibleRows: number;
  /** Whether there is an index column at position 0 (default: true) */
  hasIndexColumn?: boolean;
  /** Whether navigation is active */
  isActive?: boolean;
  /** Callback when user wants to exit */
  onExit?: () => void;
  /** Callback when cell is expanded */
  onExpand?: (row: number, col: number) => void;
}

/**
 * Hook for table keyboard navigation.
 */
export function useTableNavigation({
  rowCount,
  colCount,
  visibleRows,
  hasIndexColumn = true,
  isActive = true,
  onExit,
  onExpand,
}: UseTableNavigationOptions): TableNavigationState & {
  dispatch: (action: NavigationAction) => void;
} {
  // Minimum column: skip index column (0) if present, otherwise start at 0
  const minCol = hasIndexColumn ? 1 : 0;

  const [state, setState] = useState<TableNavigationState>({
    selectedRow: 0,
    selectedCol: minCol, // Start at first data column
    expandedCell: null,
    scrollOffset: 0,
    filter: DEFAULT_FILTER_STATE,
  });

  // Keep ref for latest state to avoid stale closures in keypress handler
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const bounds = { rowCount, colCount, visibleRows, minCol };

  const dispatch = useCallback(
    (action: NavigationAction) => {
      setState((prev) => {
        const newState = navigationReducer(prev, action, bounds);
        // Update ref synchronously to avoid race conditions with rapid key presses
        stateRef.current = newState;
        return newState;
      });

      // Handle expand callback
      if (action.type === 'TOGGLE_EXPAND' && !state.expandedCell && onExpand) {
        onExpand(state.selectedRow, state.selectedCol);
      }
    },
    [bounds, state.selectedRow, state.selectedCol, state.expandedCell, onExpand],
  );

  // Reset state when row/col count changes
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      selectedRow: Math.min(prev.selectedRow, Math.max(0, rowCount - 1)),
      // Clamp column between minCol and max column
      selectedCol: Math.min(Math.max(prev.selectedCol, minCol), Math.max(minCol, colCount - 1)),
      scrollOffset: Math.min(prev.scrollOffset, Math.max(0, rowCount - visibleRows)),
    }));
  }, [rowCount, colCount, visibleRows, minCol]);

  // Keyboard handling
  useKeypress(
    (keyInfo) => {
      const { name, key, shift, ctrl, meta } = keyInfo;
      const currentState = stateRef.current;

      // When in search mode, handle all input here (not in SearchInput)
      // This avoids timing issues with multiple useInput hooks
      if (currentState.filter.isSearching) {
        if (name === 'escape') {
          dispatch({ type: 'CANCEL_SEARCH' });
          return;
        }
        if (name === 'return') {
          dispatch({ type: 'APPLY_SEARCH' });
          return;
        }
        if (name === 'backspace' || name === 'delete') {
          const currentQuery = currentState.filter.searchQuery || '';
          dispatch({ type: 'UPDATE_SEARCH', query: currentQuery.slice(0, -1) });
          return;
        }
        // Regular character input - add to search query
        // key is the character typed (from Ink's useInput)
        if (key && key.length === 1 && !ctrl && !meta) {
          const currentQuery = currentState.filter.searchQuery || '';
          dispatch({ type: 'UPDATE_SEARCH', query: currentQuery + key });
        }
        return;
      }

      // When in command mode, handle all input here (not in CommandInput)
      // This avoids timing issues with multiple useInput hooks
      if (currentState.filter.isCommandMode) {
        if (name === 'escape') {
          dispatch({ type: 'CANCEL_COMMAND' });
          return;
        }
        if (name === 'return') {
          // Parse the command and apply the filter
          const result = parseFilterCommand(currentState.filter.commandInput);

          if ('clear' in result) {
            dispatch({ type: 'CLEAR_COLUMN_FILTERS' });
            dispatch({ type: 'EXECUTE_COMMAND' });
            return;
          }

          if ('error' in result && result.error) {
            dispatch({ type: 'SET_COMMAND_ERROR', error: result.error });
            return;
          }

          if ('filter' in result && result.filter) {
            dispatch({ type: 'ADD_COLUMN_FILTER', filter: result.filter });
            dispatch({ type: 'EXECUTE_COMMAND' });
          }
          return;
        }
        if (name === 'backspace' || name === 'delete') {
          const currentInput = currentState.filter.commandInput || '';
          dispatch({ type: 'UPDATE_COMMAND', input: currentInput.slice(0, -1) });
          return;
        }
        // Regular character input - add to command
        if (key && key.length === 1 && !ctrl && !meta) {
          const currentInput = currentState.filter.commandInput || '';
          dispatch({ type: 'UPDATE_COMMAND', input: currentInput + key });
        }
        return;
      }

      // Navigation keys (only when not in search/command mode)
      switch (name) {
        case 'up':
          dispatch({ type: 'MOVE_UP' });
          return;
        case 'down':
          dispatch({ type: 'MOVE_DOWN' });
          return;
        case 'left':
          dispatch({ type: 'MOVE_LEFT' });
          return;
        case 'right':
          dispatch({ type: 'MOVE_RIGHT' });
          return;
        case 'pageUp':
          dispatch({ type: 'PAGE_UP' });
          return;
        case 'pageDown':
          dispatch({ type: 'PAGE_DOWN' });
          return;
        case 'return':
          dispatch({ type: 'TOGGLE_EXPAND' });
          return;
        case 'escape':
          if (currentState.expandedCell) {
            dispatch({ type: 'CLOSE_EXPAND' });
          } else if (onExit) {
            onExit();
          }
          return;
      }

      // Letter keys (vim bindings and shortcuts)

      const lowerKey = key.toLowerCase();
      switch (lowerKey) {
        case 'q':
          // 'q' closes detail view if open, otherwise exits
          if (currentState.expandedCell) {
            dispatch({ type: 'CLOSE_EXPAND' });
          } else if (onExit) {
            onExit();
          }
          break;
        case 'g':
          if (shift) {
            dispatch({ type: 'GO_LAST' });
          } else {
            dispatch({ type: 'GO_FIRST' });
          }
          break;
        case 'j':
          dispatch({ type: 'MOVE_DOWN' });
          break;
        case 'k':
          dispatch({ type: 'MOVE_UP' });
          break;
        case 'h':
          dispatch({ type: 'MOVE_LEFT' });
          break;
        case 'l':
          dispatch({ type: 'MOVE_RIGHT' });
          break;
        // Filter mode shortcuts
        case 'a':
          dispatch({ type: 'SET_FILTER_MODE', mode: 'all' });
          break;
        case 'p':
          dispatch({ type: 'SET_FILTER_MODE', mode: 'passes' });
          break;
        case 'f':
          dispatch({ type: 'SET_FILTER_MODE', mode: 'failures' });
          break;
        case 'e':
          dispatch({ type: 'SET_FILTER_MODE', mode: 'errors' });
          break;
        case 'd':
          dispatch({ type: 'SET_FILTER_MODE', mode: 'different' });
          break;
        // Search shortcut (vim-style)
        case '/':
          dispatch({ type: 'START_SEARCH' });
          break;
        // Command mode shortcut (vim-style)
        case ':':
          dispatch({ type: 'START_COMMAND' });
          break;
        // Clear search with 'n' when no search active (consistent with vim)
        case 'n':
          if (currentState.filter.searchQuery) {
            // In future: cycle to next match
          }
          break;
      }
    },
    { isActive: isActive && isRawModeSupported() },
  );

  return { ...state, dispatch };
}

/**
 * Calculate visible row range based on scroll offset.
 */
export function getVisibleRowRange(
  scrollOffset: number,
  visibleRows: number,
  totalRows: number,
): { start: number; end: number } {
  const start = scrollOffset;
  const end = Math.min(scrollOffset + visibleRows, totalRows);
  return { start, end };
}

export default useTableNavigation;
