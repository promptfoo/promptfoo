/**
 * Row comparison utilities for React.memo optimization.
 *
 * These functions provide efficient shallow comparison for table rows,
 * avoiding unnecessary re-renders while still detecting meaningful changes.
 */

import type { TableColumn, TableRowData, TableRowProps } from './types';

/**
 * Compare two TableColumn arrays for equality.
 * Uses reference equality first, then shallow comparison of column properties.
 */
export function areColumnsEqual(prevColumns: TableColumn[], nextColumns: TableColumn[]): boolean {
  // Reference equality check (common case)
  if (prevColumns === nextColumns) {
    return true;
  }

  // Length check
  if (prevColumns.length !== nextColumns.length) {
    return false;
  }

  // Shallow comparison of column properties
  for (let i = 0; i < prevColumns.length; i++) {
    const prev = prevColumns[i];
    const next = nextColumns[i];
    if (
      prev.id !== next.id ||
      prev.width !== next.width ||
      prev.type !== next.type ||
      prev.header !== next.header
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Compare two TableRowData objects for equality.
 * Checks identifiers and cell statuses for changes.
 */
export function areRowDataEqual(prev: TableRowData, next: TableRowData): boolean {
  // Check stable identifiers
  if (prev.testIdx !== next.testIdx || prev.index !== next.index) {
    return false;
  }

  // Reference equality for cells (common case when row hasn't changed)
  if (prev.cells === next.cells) {
    return true;
  }

  // Check cell count
  if (prev.cells.length !== next.cells.length) {
    return false;
  }

  // Check cell statuses (most important for visual updates)
  for (let i = 0; i < prev.cells.length; i++) {
    const prevCell = prev.cells[i];
    const nextCell = next.cells[i];

    // Status change requires re-render (pass/fail/error indicator)
    if (prevCell.status !== nextCell.status) {
      return false;
    }

    // Truncation change affects display
    if (prevCell.isTruncated !== nextCell.isTruncated) {
      return false;
    }

    // Content reference check (content changes are rare after initial render)
    if (prevCell.displayContent !== nextCell.displayContent) {
      return false;
    }
  }

  return true;
}

/**
 * Custom comparison function for TableRow memo.
 *
 * Returns true if props are equal (no re-render needed).
 * Returns false if props differ (re-render required).
 *
 * Optimized for common cases:
 * - Selection changes (frequent)
 * - Row data updates (rare after initial render)
 * - Column layout changes (very rare)
 */
export function areTableRowPropsEqual(prevProps: TableRowProps, nextProps: TableRowProps): boolean {
  // Selection state (most frequent change)
  if (prevProps.isSelected !== nextProps.isSelected) {
    return false;
  }

  // Selected column (only relevant when row is selected)
  if (prevProps.isSelected && prevProps.selectedCol !== nextProps.selectedCol) {
    return false;
  }

  // Compact mode (rare change)
  if (prevProps.isCompact !== nextProps.isCompact) {
    return false;
  }

  // Row data comparison
  if (!areRowDataEqual(prevProps.rowData, nextProps.rowData)) {
    return false;
  }

  // Column layout (very rare change)
  if (!areColumnsEqual(prevProps.columns, nextProps.columns)) {
    return false;
  }

  return true;
}

/**
 * Custom comparison function for CompactRow memo.
 */
export function areCompactRowPropsEqual(
  prevProps: { rowData: TableRowData; isSelected?: boolean },
  nextProps: { rowData: TableRowData; isSelected?: boolean },
): boolean {
  if (prevProps.isSelected !== nextProps.isSelected) {
    return false;
  }

  return areRowDataEqual(prevProps.rowData, nextProps.rowData);
}
