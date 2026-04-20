import * as React from 'react';

import type { DataTableServerVirtualization } from './types';

type ServerVirtualizedRowsRange = {
  startIndex: number;
  endIndex: number;
  signal: AbortSignal;
};

type ServerVirtualizedRowsResult<TData> = {
  rows: TData[];
  offset?: number;
};

const EMPTY_INITIAL_ROWS: never[] = [];

interface UseServerVirtualizedRowsOptions<TData> {
  initialRows?: TData[];
  rowCount: number;
  pageSize: number;
  fetchRows: (range: ServerVirtualizedRowsRange) => Promise<ServerVirtualizedRowsResult<TData>>;
  prunePages?: number;
  resetKey?: unknown;
}

interface UseServerVirtualizedRowsResult<TData> {
  serverVirtualization: DataTableServerVirtualization<TData>;
  loadedRowCount: number;
}

function indexRows<TData>(rows: TData[] = []) {
  return new Map(rows.map((row, index) => [index, row]));
}

function indexedRowsEqual<TData>(indexedRows: Map<number, TData>, rows: TData[] = []) {
  if (indexedRows.size !== rows.length) {
    return false;
  }

  for (let index = 0; index < rows.length; index += 1) {
    if (indexedRows.get(index) !== rows[index]) {
      return false;
    }
  }

  return true;
}

function findFirstChangedIndex<TData>(previousRows: TData[] = [], nextRows: TData[] = []) {
  const sharedLength = Math.min(previousRows.length, nextRows.length);

  for (let index = 0; index < sharedLength; index += 1) {
    if (previousRows[index] !== nextRows[index]) {
      return index;
    }
  }

  if (previousRows.length !== nextRows.length) {
    return sharedLength;
  }

  return -1;
}

export function useServerVirtualizedRows<TData>({
  initialRows = EMPTY_INITIAL_ROWS,
  rowCount,
  pageSize,
  fetchRows,
  prunePages = 2,
  resetKey,
}: UseServerVirtualizedRowsOptions<TData>): UseServerVirtualizedRowsResult<TData> {
  const [rowsByIndex, setRowsByIndex] = React.useState<Map<number, TData>>(() =>
    indexRows(initialRows),
  );
  const [loadingIndexes, setLoadingIndexes] = React.useState<Map<number, number>>(new Map());

  const rowsByIndexRef = React.useRef(rowsByIndex);
  rowsByIndexRef.current = rowsByIndex;
  const loadingIndexesRef = React.useRef(loadingIndexes);
  loadingIndexesRef.current = loadingIndexes;
  const hasMountedRef = React.useRef(false);
  const initialRowsRef = React.useRef(initialRows);
  const rowCountRef = React.useRef(rowCount);
  const resetKeyRef = React.useRef(resetKey);
  const requestIdRef = React.useRef(0);
  const resetGenerationRef = React.useRef(0);

  React.useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      resetKeyRef.current = resetKey;
      return;
    }

    if (Object.is(resetKeyRef.current, resetKey)) {
      return;
    }

    resetKeyRef.current = resetKey;
    resetGenerationRef.current += 1;
    setRowsByIndex(new Map());
    setLoadingIndexes(new Map());
  }, [resetKey]);

  React.useLayoutEffect(() => {
    const previousInitialRows = initialRowsRef.current;
    const previousRowCount = rowCountRef.current;
    initialRowsRef.current = initialRows;
    rowCountRef.current = rowCount;

    if (rowsByIndexRef.current.size === 0) {
      setRowsByIndex((prev) =>
        indexedRowsEqual(prev, initialRows) ? prev : indexRows(initialRows),
      );
      return;
    }

    const firstChangedIndex = findFirstChangedIndex(previousInitialRows, initialRows);
    const rowCountChanged = previousRowCount !== rowCount;
    if (firstChangedIndex === -1 && !rowCountChanged) {
      return;
    }
    const invalidationIndex = firstChangedIndex === -1 ? initialRows.length : firstChangedIndex;

    resetGenerationRef.current += 1;
    setLoadingIndexes((prev) => {
      if (prev.size === 0) {
        return prev;
      }

      const next = new Map<number, number>();
      for (const [index, requestId] of prev) {
        if (index < invalidationIndex) {
          next.set(index, requestId);
        }
      }
      return next.size === prev.size ? prev : next;
    });

    setRowsByIndex((prev) => {
      if (prev.size === 0) {
        return indexedRowsEqual(prev, initialRows) ? prev : indexRows(initialRows);
      }

      const next = new Map<number, TData>();
      for (const [index, row] of prev) {
        if (index < invalidationIndex) {
          next.set(index, row);
        }
      }
      initialRows.forEach((row, index) => {
        next.set(index, row);
      });
      return next;
    });
  }, [initialRows, rowCount]);

  const loadRows = React.useCallback(
    async ({ startIndex, endIndex, signal }: ServerVirtualizedRowsRange) => {
      if (rowCount <= 0 || pageSize <= 0 || signal.aborted) {
        return;
      }

      const alignedStart = Math.max(0, Math.floor(startIndex / pageSize) * pageSize);
      const alignedEnd = Math.ceil((endIndex + 1) / pageSize) * pageSize - 1;
      const cappedEnd = Math.min(Math.max(alignedStart, alignedEnd), rowCount - 1);
      if (cappedEnd < alignedStart) {
        return;
      }

      let needsLoad = false;
      for (let index = alignedStart; index <= cappedEnd; index += 1) {
        if (!rowsByIndexRef.current.has(index) && !loadingIndexesRef.current.has(index)) {
          needsLoad = true;
          break;
        }
      }
      if (!needsLoad) {
        return;
      }

      const requestId = (requestIdRef.current += 1);
      const requestGeneration = resetGenerationRef.current;

      setLoadingIndexes((prev) => {
        const next = new Map(prev);
        for (let index = alignedStart; index <= cappedEnd; index += 1) {
          next.set(index, requestId);
        }
        return next;
      });

      try {
        const { rows, offset = alignedStart } = await fetchRows({
          startIndex: alignedStart,
          endIndex: cappedEnd,
          signal,
        });

        if (signal.aborted || requestGeneration !== resetGenerationRef.current) {
          return;
        }

        setRowsByIndex((prev) => {
          const next = new Map(prev);
          rows.forEach((row, index) => {
            next.set(offset + index, row);
          });

          const pruneStart = Math.max(0, alignedStart - pageSize * prunePages);
          const pruneEnd = cappedEnd + pageSize * prunePages;
          for (const index of next.keys()) {
            if (index < pruneStart || index > pruneEnd) {
              next.delete(index);
            }
          }
          return next;
        });
      } finally {
        setLoadingIndexes((prev) => {
          const next = new Map(prev);
          let changed = false;
          for (let index = alignedStart; index <= cappedEnd; index += 1) {
            if (next.get(index) === requestId) {
              next.delete(index);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    },
    [fetchRows, pageSize, prunePages, rowCount],
  );

  const serverVirtualization = React.useMemo<DataTableServerVirtualization<TData>>(
    () => ({
      rowCount,
      pageSize,
      getRow: (index) => rowsByIndex.get(index),
      loadRows,
      isRowLoading: (index) => loadingIndexes.has(index),
    }),
    [loadRows, loadingIndexes, pageSize, rowCount, rowsByIndex],
  );

  return {
    serverVirtualization,
    loadedRowCount: rowsByIndex.size,
  };
}
