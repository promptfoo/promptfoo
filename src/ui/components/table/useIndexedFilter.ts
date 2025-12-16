/**
 * useIndexedFilter - Hook for O(1) filter mode switching.
 *
 * Pre-computes filter indices when data loads, so filter mode switches
 * (all/pass/fail/error) are instant instead of iterating all rows.
 *
 * Text search still requires O(n) but uses progressive batching to
 * avoid blocking the UI.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EvaluateTable, TableRowData } from './types';
import { getCellStatus } from './types';

export type FilterMode = 'all' | 'pass' | 'fail' | 'error' | 'diff';

/**
 * Pre-computed filter indices for instant mode switching.
 */
export interface FilterIndices {
  /** All row indices */
  all: number[];
  /** Rows with at least one pass */
  passes: number[];
  /** Rows with at least one fail */
  failures: number[];
  /** Rows with at least one error */
  errors: number[];
  /** Rows with differing outputs (for diff mode) */
  diffs: number[];
}

/**
 * Build filter indices from raw data.
 * This is O(n) but only runs once when data changes.
 */
function buildFilterIndices(data: EvaluateTable): FilterIndices {
  const indices: FilterIndices = {
    all: [],
    passes: [],
    failures: [],
    errors: [],
    diffs: [],
  };

  data.body.forEach((row, idx) => {
    indices.all.push(idx);

    let hasPass = false;
    let hasFail = false;
    let hasError = false;
    const statusSet = new Set<string>();

    row.outputs.forEach((output) => {
      const status = getCellStatus(output.pass, output.failureReason);
      if (status) {
        statusSet.add(status);
      }

      if (status === 'pass') {
        hasPass = true;
      } else if (status === 'fail') {
        hasFail = true;
      } else if (status === 'error') {
        hasError = true;
      }
    });

    if (hasPass) {
      indices.passes.push(idx);
    }
    if (hasFail) {
      indices.failures.push(idx);
    }
    if (hasError) {
      indices.errors.push(idx);
    }

    // Diff mode: row has different statuses across outputs
    if (statusSet.size > 1) {
      indices.diffs.push(idx);
    }
  });

  return indices;
}

/**
 * Get filtered indices based on mode.
 * O(1) lookup instead of O(n) filtering!
 */
function getFilteredIndices(indices: FilterIndices, mode: FilterMode): number[] {
  switch (mode) {
    case 'all':
      return indices.all;
    case 'pass':
      return indices.passes;
    case 'fail':
      return indices.failures;
    case 'error':
      return indices.errors;
    case 'diff':
      return indices.diffs;
    default:
      return indices.all;
  }
}

export interface UseIndexedFilterOptions {
  /** Current filter mode */
  mode: FilterMode;
  /** Search query (if any) */
  searchQuery?: string;
  /** Column filters (if any) */
  columnFilters?: Array<{ column: number; value: string }>;
  /** Get processed row data for search (lazy) */
  getProcessedRow: (index: number) => TableRowData | undefined;
}

export interface UseIndexedFilterResult {
  /** Filtered row indices */
  filteredIndices: number[];
  /** Whether search is in progress */
  isSearching: boolean;
  /** Number of total rows */
  totalRows: number;
}

/**
 * Check if a row matches a search query.
 */
function rowMatchesQuery(row: TableRowData, query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // Check variables
  for (const varValue of row.originalRow.vars) {
    if (varValue.toLowerCase().includes(lowerQuery)) {
      return true;
    }
  }

  // Check cell contents
  for (const cell of row.cells) {
    if (cell.content.toLowerCase().includes(lowerQuery)) {
      return true;
    }
  }

  return false;
}

/**
 * Hook for indexed filtering with O(1) mode switches.
 */
export function useIndexedFilter(
  data: EvaluateTable,
  options: UseIndexedFilterOptions,
): UseIndexedFilterResult {
  const { mode, searchQuery, columnFilters, getProcessedRow } = options;

  // Build indices once when data changes
  const indices = useMemo(() => buildFilterIndices(data), [data]);

  // Get base indices from filter mode - O(1)!
  const modeIndices = useMemo(() => getFilteredIndices(indices, mode), [indices, mode]);

  // Search state for progressive search
  const [searchResults, setSearchResults] = useState<number[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<boolean>(false);

  // Progressive search - yields to UI between batches
  useEffect(() => {
    // Reset abort flag
    searchAbortRef.current = false;

    // If no search query, use mode indices directly
    if (!searchQuery || searchQuery.trim() === '') {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const BATCH_SIZE = 100;
    let currentBatch = 0;
    const results: number[] = [];

    function processBatch() {
      if (searchAbortRef.current) {
        return;
      }

      const start = currentBatch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, modeIndices.length);

      for (let i = start; i < end; i++) {
        const idx = modeIndices[i];
        const row = getProcessedRow(idx);
        if (row && rowMatchesQuery(row, searchQuery!)) {
          results.push(idx);
        }
      }

      currentBatch++;

      if (end < modeIndices.length) {
        // More to process - update intermediate results and continue
        setSearchResults([...results]);
        setTimeout(processBatch, 0); // Yield to UI
      } else {
        // Done
        setSearchResults(results);
        setIsSearching(false);
      }
    }

    processBatch();

    return () => {
      searchAbortRef.current = true;
    };
  }, [modeIndices, searchQuery, getProcessedRow]);

  // Apply column filters if present
  const filteredIndices = useMemo(() => {
    // Start with search results or mode indices
    let indices = searchResults ?? modeIndices;

    // Apply column filters if present
    if (columnFilters && columnFilters.length > 0) {
      indices = indices.filter((idx) => {
        const row = getProcessedRow(idx);
        if (!row) {
          return false;
        }

        return columnFilters.every((filter) => {
          // Column filter matches cell content
          const cell = row.cells[filter.column];
          if (!cell) {
            return false;
          }
          return cell.content.toLowerCase().includes(filter.value.toLowerCase());
        });
      });
    }

    return indices;
  }, [searchResults, modeIndices, columnFilters, getProcessedRow]);

  return {
    filteredIndices,
    isSearching,
    totalRows: data.body.length,
  };
}

export default useIndexedFilter;
