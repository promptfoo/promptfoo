/**
 * Filter utilities for the results table.
 *
 * Provides functions to filter rows based on:
 * - Quick filter modes (all, passes, failures, errors, different)
 * - Search queries
 * - Column filters
 */

import type { ColumnFilter, FilterMode, TableFilterState, TableRowData } from './types';

/**
 * Check if a row passes the quick filter mode.
 */
function matchesFilterMode(row: TableRowData, mode: FilterMode): boolean {
  switch (mode) {
    case 'all':
      return true;

    case 'passes':
      // All cells must pass
      return row.cells.every((cell) => cell.status === 'pass');

    case 'failures':
      // At least one cell must fail (not error)
      return row.cells.some((cell) => cell.status === 'fail');

    case 'errors':
      // At least one cell must have an error
      return row.cells.some((cell) => cell.status === 'error');

    case 'different':
      // Outputs differ across providers (at least 2 different outputs)
      if (row.cells.length < 2) {
        return false;
      }
      const uniqueOutputs = new Set(row.cells.map((cell) => cell.content));
      return uniqueOutputs.size > 1;

    default:
      return true;
  }
}

/**
 * Check if a row matches the search query.
 */
function matchesSearchQuery(row: TableRowData, query: string | null): boolean {
  if (!query) {
    return true;
  }

  const lowerQuery = query.toLowerCase();

  // Check output cells
  const matchesOutput = row.cells.some((cell) => cell.content.toLowerCase().includes(lowerQuery));

  // Check variable cells
  const matchesVars = row.originalRow.vars.some(
    (v) => v && String(v).toLowerCase().includes(lowerQuery),
  );

  return matchesOutput || matchesVars;
}

/**
 * Check if a row matches column filters.
 */
function matchesColumnFilters(row: TableRowData, filters: ColumnFilter[]): boolean {
  if (filters.length === 0) {
    return true;
  }

  return filters.every((filter) => {
    const { column, operator, value } = filter;

    // Get the value to compare
    let cellValue: string | number | undefined;

    if (column === 'score') {
      // Use the first cell's score, or average score
      const scores = row.cells.map((c) => c.output?.score).filter((s) => s !== undefined);
      cellValue = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
    } else if (column === 'latency') {
      // Use the first cell's latency, or max latency
      const latencies = row.cells.map((c) => c.output?.latencyMs).filter((l) => l !== undefined);
      cellValue = latencies.length > 0 ? Math.max(...latencies) : undefined;
    } else if (column === 'cost') {
      // Sum of all cells' costs
      const costs = row.cells.map((c) => c.output?.cost).filter((c) => c !== undefined);
      cellValue = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : undefined;
    } else if (column === 'provider') {
      // Check if any provider matches
      const providers = row.cells.map((c) => c.output?.provider).filter(Boolean);
      return providers.some((p) => applyOperator(p, operator, value));
    } else if (column.startsWith('var:')) {
      // Variable filter
      const varName = column.slice(4);
      const varIdx = parseInt(varName, 10);
      if (!isNaN(varIdx) && varIdx >= 0 && varIdx < row.originalRow.vars.length) {
        cellValue = row.originalRow.vars[varIdx];
      }
    }

    if (cellValue === undefined) {
      return false;
    }

    return applyOperator(cellValue, operator, value);
  });
}

/**
 * Apply a filter operator to compare values.
 */
function applyOperator(
  cellValue: string | number | undefined,
  operator: ColumnFilter['operator'],
  filterValue: string | number,
): boolean {
  if (cellValue === undefined) {
    return false;
  }

  switch (operator) {
    case '=':
      return String(cellValue) === String(filterValue);
    case '!=':
      return String(cellValue) !== String(filterValue);
    case '>':
      return Number(cellValue) > Number(filterValue);
    case '>=':
      return Number(cellValue) >= Number(filterValue);
    case '<':
      return Number(cellValue) < Number(filterValue);
    case '<=':
      return Number(cellValue) <= Number(filterValue);
    case '~':
      // Contains (case-insensitive)
      return String(cellValue).toLowerCase().includes(String(filterValue).toLowerCase());
    case '!~':
      // Does not contain (case-insensitive)
      return !String(cellValue).toLowerCase().includes(String(filterValue).toLowerCase());
    default:
      return true;
  }
}

/**
 * Filter rows based on the current filter state.
 * Returns filtered rows with their original indices preserved.
 */
export function filterRows(rows: TableRowData[], filterState: TableFilterState): TableRowData[] {
  const { mode, searchQuery, columnFilters } = filterState;

  return rows.filter((row) => {
    // Apply all filters (AND logic)
    return (
      matchesFilterMode(row, mode) &&
      matchesSearchQuery(row, searchQuery) &&
      matchesColumnFilters(row, columnFilters)
    );
  });
}

/**
 * Get a human-readable label for the filter mode.
 */
export function getFilterModeLabel(mode: FilterMode): string {
  switch (mode) {
    case 'all':
      return 'all';
    case 'passes':
      return 'passes';
    case 'failures':
      return 'failures';
    case 'errors':
      return 'errors';
    case 'different':
      return 'different';
    default:
      return mode;
  }
}

/**
 * Check if any filter is active (not in default state).
 */
export function hasActiveFilter(filterState: TableFilterState): boolean {
  return (
    filterState.mode !== 'all' ||
    filterState.searchQuery !== null ||
    filterState.columnFilters.length > 0
  );
}

export { matchesFilterMode, matchesSearchQuery, matchesColumnFilters };
