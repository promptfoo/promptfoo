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

export function useServerVirtualizedRows<TData>({
  initialRows = [],
  rowCount,
  pageSize,
  fetchRows,
  prunePages = 2,
  resetKey,
}: UseServerVirtualizedRowsOptions<TData>): UseServerVirtualizedRowsResult<TData> {
  const [rowsByIndex, setRowsByIndex] = React.useState<Map<number, TData>>(() =>
    indexRows(initialRows),
  );
  const [loadingIndexes, setLoadingIndexes] = React.useState<Set<number>>(new Set());

  const rowsByIndexRef = React.useRef(rowsByIndex);
  rowsByIndexRef.current = rowsByIndex;
  const loadingIndexesRef = React.useRef(loadingIndexes);
  loadingIndexesRef.current = loadingIndexes;
  const hasMountedRef = React.useRef(false);
  const resetKeyRef = React.useRef(resetKey);

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
    setRowsByIndex(new Map());
    setLoadingIndexes(new Set());
  }, [resetKey]);

  React.useLayoutEffect(() => {
    setRowsByIndex((prev) => (indexedRowsEqual(prev, initialRows) ? prev : indexRows(initialRows)));
  }, [initialRows]);

  const loadRows = React.useCallback(
    async ({ startIndex, endIndex, signal }: ServerVirtualizedRowsRange) => {
      if (rowCount <= 0 || pageSize <= 0) {
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

      setLoadingIndexes((prev) => {
        const next = new Set(prev);
        for (let index = alignedStart; index <= cappedEnd; index += 1) {
          next.add(index);
        }
        return next;
      });

      try {
        const { rows, offset = alignedStart } = await fetchRows({
          startIndex: alignedStart,
          endIndex: cappedEnd,
          signal,
        });

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
          const next = new Set(prev);
          for (let index = alignedStart; index <= cappedEnd; index += 1) {
            next.delete(index);
          }
          return next;
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
