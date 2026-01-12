/**
 * useLazyProcessedRows - Hook for lazy row processing in large tables.
 *
 * Features:
 * - Only processes visible rows + buffer (not ALL rows)
 * - Maintains a sparse cache of processed rows
 * - Pre-processes buffer rows in idle time
 * - Cache eviction for memory management
 *
 * This dramatically improves performance for large datasets (1000+ rows)
 * by changing O(n) processing to O(visible) processing.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { LIMITS } from '../../constants';
import { type EvaluateTable, getCellStatus, type TableCellData, type TableRowData } from './types';

/**
 * Truncate text to a maximum length.
 * Handles Unicode properly by not cutting through multi-byte characters.
 */
function truncateText(text: string, maxLength: number): { text: string; truncated: boolean } {
  const normalized = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const codePoints = [...normalized];
  if (codePoints.length <= maxLength) {
    return { text: normalized, truncated: false };
  }
  return { text: codePoints.slice(0, maxLength - 1).join('') + '\u2026', truncated: true };
}

/**
 * Process a single row from raw data to renderable row data.
 */
function processRow(
  row: EvaluateTable['body'][number],
  index: number,
  maxCellLength: number,
): TableRowData {
  const cells: TableCellData[] = row.outputs.map((output) => {
    const { text, truncated } = truncateText(output.text || '', maxCellLength);
    const status = getCellStatus(output.pass, output.failureReason);

    return {
      content: output.text || '',
      displayContent: text,
      status,
      isTruncated: truncated,
      output,
    };
  });

  return {
    index,
    testIdx: row.testIdx,
    cells,
    originalRow: row,
  };
}

/**
 * Evict old entries from cache to keep memory bounded.
 * Keeps rows closest to current position.
 */
function evictOldEntries(
  cache: Map<number, TableRowData>,
  currentIndex: number,
  maxSize: number,
): void {
  if (cache.size <= maxSize) {
    return;
  }

  // Sort entries by distance from current position
  const entries = [...cache.entries()];
  entries.sort((a, b) => Math.abs(a[0] - currentIndex) - Math.abs(b[0] - currentIndex));

  // Remove furthest entries
  const toRemove = entries.slice(maxSize);
  toRemove.forEach(([key]) => cache.delete(key));
}

export interface UseLazyProcessedRowsOptions {
  /** Maximum length for cell content before truncation */
  maxCellLength: number;
  /** Start of visible range (inclusive) */
  visibleStart: number;
  /** End of visible range (exclusive) */
  visibleEnd: number;
}

export interface UseLazyProcessedRowsResult {
  /** Processed rows in the visible range */
  visibleRows: TableRowData[];
  /** Total number of rows in the dataset */
  totalRows: number;
  /** Get a processed row by index (with lazy processing) */
  getProcessedRow: (index: number) => TableRowData | undefined;
  /** Process all rows for filtering/searching (returns indices that match) */
  processAllRowsForFilter: () => TableRowData[];
}

/**
 * Hook for lazy row processing - only processes rows in the visible window.
 *
 * @param data - Raw evaluation table data
 * @param options - Configuration options
 * @returns Processed rows and utilities
 */
export function useLazyProcessedRows(
  data: EvaluateTable,
  options: UseLazyProcessedRowsOptions,
): UseLazyProcessedRowsResult {
  const { maxCellLength, visibleStart, visibleEnd } = options;

  // Cache processed rows in a Map (sparse array alternative)
  // Use ref to persist across renders without triggering re-renders
  const processedCache = useRef<Map<number, TableRowData>>(new Map());
  const dataRef = useRef(data);

  // Clear cache if data changes
  if (dataRef.current !== data) {
    processedCache.current.clear();
    dataRef.current = data;
  }

  // Get a processed row by index (with lazy processing)
  const getProcessedRow = useCallback(
    (index: number): TableRowData | undefined => {
      if (index < 0 || index >= data.body.length) {
        return undefined;
      }

      let processed = processedCache.current.get(index);
      if (!processed) {
        processed = processRow(data.body[index], index, maxCellLength);
        processedCache.current.set(index, processed);
      }
      return processed;
    },
    [data.body, maxCellLength],
  );

  // Process visible rows + buffer
  const visibleRows = useMemo(() => {
    const rows: TableRowData[] = [];
    const start = Math.max(0, visibleStart);
    const end = Math.min(data.body.length, visibleEnd);

    for (let i = start; i < end; i++) {
      const processed = getProcessedRow(i);
      if (processed) {
        rows.push(processed);
      }
    }

    return rows;
  }, [data.body.length, visibleStart, visibleEnd, getProcessedRow]);

  // Pre-process buffer rows in idle time
  useEffect(() => {
    if (typeof requestIdleCallback === 'undefined') {
      return;
    }

    const bufferStart = Math.max(0, visibleStart - LIMITS.ROW_BUFFER_SIZE);
    const bufferEnd = Math.min(data.body.length, visibleEnd + LIMITS.ROW_BUFFER_SIZE);

    const handle = requestIdleCallback(() => {
      // Process buffer rows
      for (let i = bufferStart; i < bufferEnd; i++) {
        if (!processedCache.current.has(i)) {
          processedCache.current.set(i, processRow(data.body[i], i, maxCellLength));
        }
      }

      // Evict old entries to keep memory bounded
      const centerIndex = Math.floor((visibleStart + visibleEnd) / 2);
      evictOldEntries(processedCache.current, centerIndex, LIMITS.MAX_CACHE_SIZE);
    });

    return () => cancelIdleCallback(handle);
  }, [data.body, visibleStart, visibleEnd, maxCellLength]);

  // Process all rows for filtering/searching
  // This is called only when filters are applied, so O(n) is acceptable
  const processAllRowsForFilter = useCallback((): TableRowData[] => {
    const rows: TableRowData[] = [];
    for (let i = 0; i < data.body.length; i++) {
      let processed = processedCache.current.get(i);
      if (!processed) {
        processed = processRow(data.body[i], i, maxCellLength);
        processedCache.current.set(i, processed);
      }
      rows.push(processed);
    }
    return rows;
  }, [data.body, maxCellLength]);

  return {
    visibleRows,
    totalRows: data.body.length,
    getProcessedRow,
    processAllRowsForFilter,
  };
}
