/**
 * Filter utilities for the results table.
 *
 * Provides functions to filter rows based on:
 * - Quick filter modes (all, passes, failures, errors, different)
 * - Search queries (supports regex with /pattern/ syntax)
 * - Column filters
 */

import type { ColumnFilter, FilterMode, TableFilterState, TableRowData } from './types';

/**
 * Parse a search query to determine if it's a regex pattern.
 * Regex patterns are wrapped in forward slashes: /pattern/flags
 *
 * @returns Object with isRegex flag and the pattern/flags or null if invalid regex
 */
export function parseSearchQuery(query: string): {
  isRegex: boolean;
  pattern: string;
  flags: string;
  regex: RegExp | null;
  error: string | null;
} {
  // Check for regex syntax: /pattern/ or /pattern/flags
  // Allow any characters after the trailing slash for flags (will validate later)
  const regexMatch = query.match(/^\/(.+)\/([a-zA-Z]*)$/);

  if (!regexMatch) {
    // Not a regex pattern, use as literal search
    return {
      isRegex: false,
      pattern: query,
      flags: 'i', // case-insensitive by default for literal search
      regex: null,
      error: null,
    };
  }

  const [, pattern, flags] = regexMatch;
  // For regex, respect user's flags - no default (empty string = case-sensitive)

  try {
    const regex = new RegExp(pattern, flags);
    return {
      isRegex: true,
      pattern,
      flags,
      regex,
      error: null,
    };
  } catch (err) {
    // Invalid regex - return error info for display
    return {
      isRegex: true,
      pattern,
      flags,
      regex: null,
      error: err instanceof Error ? err.message : 'Invalid regex pattern',
    };
  }
}

/**
 * Test if a string matches a search query (supports regex).
 */
export function matchesQuery(
  content: string,
  query: string,
  parsedQuery?: ReturnType<typeof parseSearchQuery>,
): boolean {
  const parsed = parsedQuery || parseSearchQuery(query);

  if (parsed.isRegex && parsed.regex) {
    // Use regex matching
    return parsed.regex.test(content);
  }

  // Fall back to case-insensitive substring matching
  return content.toLowerCase().includes(parsed.pattern.toLowerCase());
}

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
 * Supports regex patterns with /pattern/flags syntax.
 */
function matchesSearchQuery(row: TableRowData, query: string | null): boolean {
  if (!query) {
    return true;
  }

  // Parse the query once for efficiency
  const parsedQuery = parseSearchQuery(query);

  // If regex is invalid, no matches (user will see error indicator)
  if (parsedQuery.isRegex && parsedQuery.error) {
    return false;
  }

  // Check output cells
  const matchesOutput = row.cells.some((cell) => matchesQuery(cell.content, query, parsedQuery));

  // Check variable cells
  const matchesVars = row.originalRow.vars.some(
    (v) => v && matchesQuery(String(v), query, parsedQuery),
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
    } else if (column === 'status') {
      // Check cell status (pass, fail, error)
      const statuses = row.cells
        .map((c) => c.status)
        .filter((s): s is NonNullable<typeof s> => s !== null);
      return statuses.some((s) => applyOperator(s, operator, value));
    } else if (column === 'output') {
      // Check output content
      const outputs = row.cells.map((c) => c.content);
      return outputs.some((o) => applyOperator(o, operator, value));
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
