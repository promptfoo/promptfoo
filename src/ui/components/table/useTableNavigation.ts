/**
 * useTableNavigation - Hook for keyboard navigation in the results table.
 *
 * Features:
 * - Arrow key navigation (row and column)
 * - Page up/down for quick scrolling
 * - Home/End for first/last row
 * - Enter to expand cell
 * - Escape to close expanded cell or exit
 * - Q to quit table view
 */

import { useCallback, useEffect, useState } from 'react';
import { isRawModeSupported, useKeypress } from '../../hooks/useKeypress';
import type { TableNavigationState } from './types';

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
  | { type: 'SET_SCROLL'; offset: number };

/**
 * Reduce navigation state based on action.
 */
function navigationReducer(
  state: TableNavigationState,
  action: NavigationAction,
  bounds: { rowCount: number; colCount: number; visibleRows: number },
): TableNavigationState {
  const { rowCount, colCount, visibleRows } = bounds;

  switch (action.type) {
    case 'MOVE_UP': {
      const newRow = Math.max(0, state.selectedRow - 1);
      const newOffset =
        newRow < state.scrollOffset ? newRow : Math.min(state.scrollOffset, newRow);
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'MOVE_DOWN': {
      const newRow = Math.min(rowCount - 1, state.selectedRow + 1);
      const newOffset =
        newRow >= state.scrollOffset + visibleRows
          ? newRow - visibleRows + 1
          : state.scrollOffset;
      return { ...state, selectedRow: newRow, scrollOffset: newOffset };
    }

    case 'MOVE_LEFT':
      return { ...state, selectedCol: Math.max(0, state.selectedCol - 1) };

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

    case 'SET_SCROLL':
      return { ...state, scrollOffset: action.offset };

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
  isActive = true,
  onExit,
  onExpand,
}: UseTableNavigationOptions): TableNavigationState & {
  dispatch: (action: NavigationAction) => void;
} {
  const [state, setState] = useState<TableNavigationState>({
    selectedRow: 0,
    selectedCol: 0,
    expandedCell: null,
    scrollOffset: 0,
  });

  const bounds = { rowCount, colCount, visibleRows };

  const dispatch = useCallback(
    (action: NavigationAction) => {
      setState((prev) => navigationReducer(prev, action, bounds));

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
      selectedCol: Math.min(prev.selectedCol, Math.max(0, colCount - 1)),
      scrollOffset: Math.min(prev.scrollOffset, Math.max(0, rowCount - visibleRows)),
    }));
  }, [rowCount, colCount, visibleRows]);

  // Keyboard handling
  useKeypress(
    (keyInfo) => {
      const { name, key, shift } = keyInfo;

      // Navigation keys
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
          if (state.expandedCell) {
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
          if (!state.expandedCell && onExit) {
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
