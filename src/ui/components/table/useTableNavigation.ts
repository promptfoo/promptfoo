/**
 * useTableNavigation - Hook for keyboard navigation in the results table.
 *
 * Navigation (shown in help - universally understood):
 * - ↑↓←→: Move up/down/left/right
 * - PageUp/PageDown: Full page navigation
 * - Home/End: Jump to first/last row
 *
 * Navigation (hidden - for vim/less power users):
 * - hjkl: Same as arrow keys
 * - g/G: Jump to first/last row
 * - Ctrl+d/u: Half page down/up
 *
 * Cell interaction:
 * - Enter: Expand cell details
 * - q: Close detail view or exit table
 * - Escape: Close detail view or exit
 *
 * Filtering & Commands (:):
 * - a/p/f/e/d: All/Pass/Fail/Error/Different filter modes
 * - /: Start search
 * - :: Enter command mode
 *   - :50 → jump to row 50 (1-indexed)
 *   - :$ → jump to last row
 *   - :filter column op value → add column filter
 *   - :clear → clear all filters
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isRawModeSupported, useKeypress } from '../../hooks/useKeypress';
import { parseFilterCommand } from './CommandInput';

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
  | { type: 'HALF_PAGE_UP' }
  | { type: 'HALF_PAGE_DOWN' }
  | { type: 'GO_FIRST' }
  | { type: 'GO_LAST' }
  | { type: 'GO_FIRST_COL' }
  | { type: 'GO_LAST_COL' }
  | { type: 'GO_TO_ROW'; row: number }
  | { type: 'TOGGLE_EXPAND' }
  | { type: 'CLOSE_EXPAND' }
  | { type: 'NAVIGATE_EXPANDED'; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'SET_EXPANDED_POSITION'; row: number; col: number }
  | { type: 'SET_SCROLL'; offset: number }
  | { type: 'NEXT_MATCH' }
  | { type: 'PREV_MATCH' }
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
 * Pure reducer function for table navigation state transitions.
 *
 * Handles all navigation actions (movement, pagination, selection) and
 * maintains scroll offset to keep the selected row visible. This is the
 * core logic for keyboard navigation in the results table.
 *
 * @param state - Current navigation state (selected row/col, scroll offset)
 * @param action - Navigation action to perform (MOVE_UP, MOVE_DOWN, etc.)
 * @param bounds - Table boundaries to constrain navigation:
 *   - rowCount: Total number of rows
 *   - colCount: Total number of columns
 *   - visibleRows: Number of rows visible in viewport
 *   - minCol: Minimum column index (0 if no index column, 1 if index column exists)
 * @returns New navigation state after applying the action
 *
 * @example
 * ```ts
 * const newState = navigationReducer(
 *   { selectedRow: 0, selectedCol: 1, scrollOffset: 0 },
 *   { type: 'MOVE_DOWN' },
 *   { rowCount: 100, colCount: 5, visibleRows: 25, minCol: 0 }
 * );
 * // Returns { selectedRow: 1, selectedCol: 1, scrollOffset: 0 }
 * ```
 *
 * @remarks
 * Exported for unit testing. In production, use the `useTableNavigation` hook
 * which wraps this reducer with React state management.
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

    case 'HALF_PAGE_UP': {
      const halfPage = Math.max(1, Math.floor(visibleRows / 2));
      const newRow = Math.max(0, state.selectedRow - halfPage);
      const newOffset = Math.max(0, state.scrollOffset - halfPage);
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'HALF_PAGE_DOWN': {
      const halfPage = Math.max(1, Math.floor(visibleRows / 2));
      const newRow = Math.min(rowCount - 1, state.selectedRow + halfPage);
      const maxOffset = Math.max(0, rowCount - visibleRows);
      const newOffset = Math.min(maxOffset, state.scrollOffset + halfPage);
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'GO_FIRST':
      return { ...state, selectedRow: 0, scrollOffset: 0 };

    case 'GO_LAST': {
      const newRow = rowCount - 1;
      const newOffset = Math.max(0, rowCount - visibleRows);
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'GO_FIRST_COL':
      return { ...state, selectedCol: minCol };

    case 'GO_LAST_COL':
      return { ...state, selectedCol: colCount - 1 };

    case 'GO_TO_ROW': {
      // Clamp row to valid range
      const targetRow = Math.max(0, Math.min(rowCount - 1, action.row));
      // Calculate scroll offset to center the row if possible
      const halfVisible = Math.floor(visibleRows / 2);
      const idealOffset = targetRow - halfVisible;
      const maxOffset = Math.max(0, rowCount - visibleRows);
      const newOffset = Math.max(0, Math.min(maxOffset, idealOffset));
      return { ...state, selectedRow: targetRow, scrollOffset: newOffset };
    }

    case 'NEXT_MATCH':
      // Placeholder for search match navigation - handled in key handler
      return state;

    case 'PREV_MATCH':
      // Placeholder for search match navigation - handled in key handler
      return state;

    case 'TOGGLE_EXPAND':
      if (state.expandedCell) {
        return { ...state, expandedCell: null };
      }
      return {
        ...state,
        expandedCell: { row: state.selectedRow, col: state.selectedCol },
      };

    case 'CLOSE_EXPAND': {
      // Center selected row in visible area when closing overlay
      // This prevents jarring scroll jumps when returning to table view
      const halfVisible = Math.floor(visibleRows / 2);
      const idealOffset = state.selectedRow - halfVisible;
      const maxOffset = Math.max(0, rowCount - visibleRows);
      const newOffset = Math.max(0, Math.min(maxOffset, idealOffset));
      return { ...state, expandedCell: null, scrollOffset: newOffset };
    }

    case 'NAVIGATE_EXPANDED': {
      // Navigate while keeping detail view open
      // NOTE: scrollOffset is intentionally NOT updated here.
      // The table is not visible during overlay mode, so tracking scroll is pointless.
      // CLOSE_EXPAND will center the selected row when returning to table view.
      const maxCol = colCount - 1;
      const maxRow = rowCount - 1;

      let newRow = state.selectedRow;
      let newCol = state.selectedCol;

      switch (action.direction) {
        case 'up':
          // Wrap to last row if at first row
          newRow = state.selectedRow > 0 ? state.selectedRow - 1 : maxRow;
          break;
        case 'down':
          // Wrap to first row if at last row
          newRow = state.selectedRow < maxRow ? state.selectedRow + 1 : 0;
          break;
        case 'left':
          if (state.selectedCol > minCol) {
            // Move left within row
            newCol = state.selectedCol - 1;
          } else {
            // At leftmost valid column, wrap to last column of previous row
            newCol = maxCol;
            newRow = state.selectedRow > 0 ? state.selectedRow - 1 : maxRow;
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
          }
          break;
      }

      return {
        ...state,
        selectedRow: newRow,
        selectedCol: newCol,
        expandedCell: { row: newRow, col: newCol },
      };
    }

    case 'SET_EXPANDED_POSITION': {
      // Jump directly to a specific row/col while keeping detail view open
      const clampedRow = Math.max(0, Math.min(rowCount - 1, action.row));
      const clampedCol = Math.max(minCol, Math.min(colCount - 1, action.col));
      return {
        ...state,
        selectedRow: clampedRow,
        selectedCol: clampedCol,
        expandedCell: { row: clampedRow, col: clampedCol },
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
  /** Callback when user wants to export (press 'x') */
  onExport?: () => void;
  /** Callback when user wants to copy (press 'y') */
  onCopy?: () => void;
  /** Callback when user wants to browse history (press 'H') */
  onHistory?: () => void;
  /** Callback when user wants to show help (press '?') */
  onHelp?: () => void;
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
  onExport,
  onCopy,
  onHistory,
  onHelp,
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

  const bounds = useMemo(
    () => ({ rowCount, colCount, visibleRows, minCol }),
    [rowCount, colCount, visibleRows, minCol],
  );

  const dispatch = useCallback(
    (action: NavigationAction) => {
      // Capture the pre-action state to check if we're toggling expand
      const wasExpanded = stateRef.current.expandedCell !== null;

      setState((prev) => {
        const newState = navigationReducer(prev, action, bounds);
        // Update ref synchronously to avoid race conditions with rapid key presses
        stateRef.current = newState;
        return newState;
      });

      // Handle expand callback - use stateRef to get the correct position
      // We're expanding if: action is TOGGLE_EXPAND, we weren't expanded, and now we are
      if (action.type === 'TOGGLE_EXPAND' && !wasExpanded && onExpand) {
        // Use stateRef.current which was just updated synchronously in setState
        onExpand(stateRef.current.selectedRow, stateRef.current.selectedCol);
      }
    },
    [bounds, onExpand],
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
          // Parse the command and apply the filter or navigation
          const result = parseFilterCommand(currentState.filter.commandInput);

          // Handle row jump: :50 → go to row 50
          if ('goto' in result) {
            dispatch({ type: 'GO_TO_ROW', row: result.goto });
            dispatch({ type: 'EXECUTE_COMMAND' });
            return;
          }

          // Handle :$ → go to last row
          if ('gotoLast' in result) {
            dispatch({ type: 'GO_LAST' });
            dispatch({ type: 'EXECUTE_COMMAND' });
            return;
          }

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
      // Arrow keys for universal accessibility
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
        case 'pageup':
          dispatch({ type: 'PAGE_UP' });
          return;
        case 'pagedown':
          dispatch({ type: 'PAGE_DOWN' });
          return;
        case 'home':
          dispatch({ type: 'GO_FIRST' });
          return;
        case 'end':
          dispatch({ type: 'GO_LAST' });
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

      // Get lowercase key for comparisons
      const lowerKey = key.toLowerCase();

      // Ctrl key combinations for power users
      if (ctrl) {
        switch (lowerKey) {
          case 'd':
            dispatch({ type: 'HALF_PAGE_DOWN' });
            return;
          case 'u':
            dispatch({ type: 'HALF_PAGE_UP' });
            return;
        }
      }

      // Letter keys (shortcuts)
      switch (lowerKey) {
        // Vim-style navigation (hidden alternatives to arrow keys)
        case 'j':
          dispatch({ type: 'MOVE_DOWN' });
          break;
        case 'k':
          dispatch({ type: 'MOVE_UP' });
          break;
        case 'h':
          // H (shift+h) = open history browser
          if (shift) {
            onHistory?.();
          } else {
            dispatch({ type: 'MOVE_LEFT' });
          }
          break;
        case 'l':
          dispatch({ type: 'MOVE_RIGHT' });
          break;
        case 'g':
          // g = first row, G (shift+g) = last row
          if (shift) {
            dispatch({ type: 'GO_LAST' });
          } else {
            dispatch({ type: 'GO_FIRST' });
          }
          break;

        // Quit
        case 'q':
          if (currentState.expandedCell) {
            dispatch({ type: 'CLOSE_EXPAND' });
          } else if (onExit) {
            onExit();
          }
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
          // Only filter if not ctrl (ctrl+d is half page down)
          if (!ctrl) {
            dispatch({ type: 'SET_FILTER_MODE', mode: 'different' });
          }
          break;

        // Search shortcut
        case '/':
          dispatch({ type: 'START_SEARCH' });
          break;

        // Help shortcut (shift+/ = ?)
        case '?':
          onHelp?.();
          break;

        // Command mode shortcut
        case ':':
          dispatch({ type: 'START_COMMAND' });
          break;

        // Export shortcut
        case 'x':
          onExport?.();
          break;

        // Copy/yank shortcut (vim-style 'y' for yank)
        case 'y':
          onCopy?.();
          break;
      }
    },
    { isActive: isActive && isRawModeSupported() },
  );

  return { ...state, dispatch };
}

/**
 * Calculate the visible row range for virtual scrolling.
 *
 * Used to determine which rows should be rendered based on the current
 * scroll position. Returns indices suitable for array slicing.
 *
 * @param scrollOffset - The current scroll offset (first visible row index)
 * @param visibleRows - Maximum number of rows that can be displayed at once
 * @param totalRows - Total number of rows in the dataset
 * @returns Object with start (inclusive) and end (exclusive) row indices
 *
 * @example
 * ```ts
 * const { start, end } = getVisibleRowRange(10, 25, 100);
 * // Returns { start: 10, end: 35 }
 * const visibleData = allRows.slice(start, end);
 * ```
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
