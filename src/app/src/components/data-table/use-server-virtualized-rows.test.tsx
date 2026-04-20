import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useServerVirtualizedRows } from './use-server-virtualized-rows';

type TestRow = {
  id: string;
};

function createRows(start: number, count: number): TestRow[] {
  return Array.from({ length: count }, (_, index) => ({ id: `row-${start + index}` }));
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('useServerVirtualizedRows', () => {
  it('indexes seeded rows and skips ranges already covered by the cache', async () => {
    const fetchRows = vi.fn().mockResolvedValue({ rows: [], offset: 0 });
    const { result } = renderHook(() =>
      useServerVirtualizedRows<TestRow>({
        initialRows: createRows(0, 2),
        rowCount: 2,
        pageSize: 2,
        fetchRows,
      }),
    );

    expect(result.current.loadedRowCount).toBe(2);
    expect(result.current.serverVirtualization.getRow(1)).toEqual({ id: 'row-1' });

    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 0,
        endIndex: 1,
        signal: new AbortController().signal,
      });
    });

    expect(fetchRows).not.toHaveBeenCalled();
  });

  it('aligns requests to page boundaries and stores rows at the returned offset', async () => {
    const pendingRows = createDeferred<{ rows: TestRow[]; offset: number }>();
    const fetchRows = vi.fn().mockReturnValue(pendingRows.promise);
    const { result } = renderHook(() =>
      useServerVirtualizedRows<TestRow>({
        rowCount: 100,
        pageSize: 25,
        fetchRows,
      }),
    );
    const controller = new AbortController();
    let loadPromise: Promise<void> = Promise.resolve();

    act(() => {
      loadPromise = Promise.resolve(
        result.current.serverVirtualization.loadRows({
          startIndex: 27,
          endIndex: 30,
          signal: controller.signal,
        }),
      );
    });

    await waitFor(() => expect(fetchRows).toHaveBeenCalledTimes(1));
    expect(fetchRows).toHaveBeenCalledWith({
      startIndex: 25,
      endIndex: 49,
      signal: controller.signal,
    });
    expect(result.current.serverVirtualization.isRowLoading?.(25)).toBe(true);

    await act(async () => {
      pendingRows.resolve({ rows: [{ id: 'loaded-25' }], offset: 25 });
      await loadPromise;
    });

    await waitFor(() =>
      expect(result.current.serverVirtualization.getRow(25)).toEqual({ id: 'loaded-25' }),
    );
    expect(result.current.serverVirtualization.isRowLoading?.(25)).toBe(false);
  });

  it('ignores aborted responses without clearing newer loads for the same indexes', async () => {
    const staleRows = createDeferred<{ rows: TestRow[]; offset: number }>();
    const freshRows = createDeferred<{ rows: TestRow[]; offset: number }>();
    const fetchRows = vi
      .fn()
      .mockReturnValueOnce(staleRows.promise)
      .mockReturnValueOnce(freshRows.promise);
    const { result, rerender } = renderHook(
      ({ resetKey }) =>
        useServerVirtualizedRows<TestRow>({
          rowCount: 50,
          pageSize: 25,
          fetchRows,
          resetKey,
        }),
      { initialProps: { resetKey: 'createdAt-desc' } },
    );
    const staleController = new AbortController();
    const freshController = new AbortController();
    let staleLoad: Promise<void> = Promise.resolve();
    let freshLoad: Promise<void> = Promise.resolve();

    act(() => {
      staleLoad = Promise.resolve(
        result.current.serverVirtualization.loadRows({
          startIndex: 0,
          endIndex: 10,
          signal: staleController.signal,
        }),
      );
    });
    await waitFor(() => expect(fetchRows).toHaveBeenCalledTimes(1));

    staleController.abort();
    rerender({ resetKey: 'name-asc' });

    act(() => {
      freshLoad = Promise.resolve(
        result.current.serverVirtualization.loadRows({
          startIndex: 0,
          endIndex: 10,
          signal: freshController.signal,
        }),
      );
    });
    await waitFor(() => expect(fetchRows).toHaveBeenCalledTimes(2));
    expect(result.current.serverVirtualization.isRowLoading?.(0)).toBe(true);

    await act(async () => {
      staleRows.resolve({ rows: [{ id: 'stale' }], offset: 0 });
      await staleLoad;
    });

    expect(result.current.serverVirtualization.getRow(0)).toBeUndefined();
    expect(result.current.serverVirtualization.isRowLoading?.(0)).toBe(true);

    await act(async () => {
      freshRows.resolve({ rows: [{ id: 'fresh' }], offset: 0 });
      await freshLoad;
    });

    await waitFor(() =>
      expect(result.current.serverVirtualization.getRow(0)).toEqual({ id: 'fresh' }),
    );
    expect(result.current.serverVirtualization.isRowLoading?.(0)).toBe(false);
  });

  it('clears cached rows when the reset key changes', async () => {
    const fetchRows = vi.fn().mockResolvedValue({ rows: [], offset: 0 });
    const seededRows = [{ id: 'seeded' }];
    const { result, rerender } = renderHook(
      ({ resetKey }) =>
        useServerVirtualizedRows<TestRow>({
          initialRows: seededRows,
          rowCount: 1,
          pageSize: 25,
          fetchRows,
          resetKey,
        }),
      { initialProps: { resetKey: 'createdAt-desc' } },
    );

    expect(result.current.serverVirtualization.getRow(0)).toEqual({ id: 'seeded' });

    rerender({ resetKey: 'name-asc' });

    await waitFor(() => expect(result.current.loadedRowCount).toBe(0));
    expect(result.current.serverVirtualization.getRow(0)).toBeUndefined();
  });

  it('does not clobber fetched rows when initialRows rerenders with the same rows', async () => {
    const fetchRows = vi.fn().mockResolvedValue({ rows: [{ id: 'loaded-25' }], offset: 25 });
    const initialRows = createRows(0, 2);
    const { result, rerender } = renderHook(
      ({ rows }) =>
        useServerVirtualizedRows<TestRow>({
          initialRows: rows,
          rowCount: 100,
          pageSize: 25,
          fetchRows,
        }),
      { initialProps: { rows: initialRows } },
    );

    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 25,
        endIndex: 25,
        signal: new AbortController().signal,
      });
    });

    expect(result.current.serverVirtualization.getRow(25)).toEqual({ id: 'loaded-25' });

    rerender({ rows: [...initialRows] });

    expect(result.current.serverVirtualization.getRow(0)).toEqual({ id: 'row-0' });
    expect(result.current.serverVirtualization.getRow(1)).toEqual({ id: 'row-1' });
    expect(result.current.serverVirtualization.getRow(25)).toEqual({ id: 'loaded-25' });
    expect(result.current.loadedRowCount).toBe(3);
  });

  it('rehydrates the seeded prefix and invalidates later cached rows when initialRows change', async () => {
    const fetchRows = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'loaded-25' }], offset: 25 })
      .mockResolvedValueOnce({ rows: [{ id: 'reloaded-25' }], offset: 25 });
    const initialRows = createRows(0, 2);
    const updatedRows = [initialRows[1]];
    const { result, rerender } = renderHook(
      ({ rows }) =>
        useServerVirtualizedRows<TestRow>({
          initialRows: rows,
          rowCount: 100,
          pageSize: 25,
          fetchRows,
        }),
      { initialProps: { rows: initialRows } },
    );

    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 25,
        endIndex: 25,
        signal: new AbortController().signal,
      });
    });

    expect(result.current.serverVirtualization.getRow(25)).toEqual({ id: 'loaded-25' });

    rerender({ rows: updatedRows });

    expect(result.current.serverVirtualization.getRow(0)).toEqual(initialRows[1]);
    expect(result.current.serverVirtualization.getRow(1)).toBeUndefined();
    expect(result.current.serverVirtualization.getRow(25)).toBeUndefined();
    expect(result.current.loadedRowCount).toBe(1);

    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 25,
        endIndex: 25,
        signal: new AbortController().signal,
      });
    });

    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(result.current.serverVirtualization.getRow(25)).toEqual({ id: 'reloaded-25' });
  });

  it('invalidates cached rows beyond the seeded prefix when rowCount changes', async () => {
    const fetchRows = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'loaded-25' }], offset: 25 })
      .mockResolvedValueOnce({ rows: [{ id: 'shifted-25' }], offset: 25 });
    const initialRows = createRows(0, 2);
    const { result, rerender } = renderHook(
      ({ rows, count }) =>
        useServerVirtualizedRows<TestRow>({
          initialRows: rows,
          rowCount: count,
          pageSize: 25,
          fetchRows,
        }),
      { initialProps: { rows: initialRows, count: 100 } },
    );

    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 25,
        endIndex: 25,
        signal: new AbortController().signal,
      });
    });

    expect(result.current.serverVirtualization.getRow(25)).toEqual({ id: 'loaded-25' });

    rerender({ rows: [...initialRows], count: 99 });

    expect(result.current.serverVirtualization.getRow(0)).toEqual(initialRows[0]);
    expect(result.current.serverVirtualization.getRow(1)).toEqual(initialRows[1]);
    expect(result.current.serverVirtualization.getRow(25)).toBeUndefined();
    expect(result.current.loadedRowCount).toBe(2);

    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 25,
        endIndex: 25,
        signal: new AbortController().signal,
      });
    });

    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(result.current.serverVirtualization.getRow(25)).toEqual({ id: 'shifted-25' });
  });

  it('prunes rows outside the configured surrounding page window', async () => {
    const fetchRows = vi.fn().mockResolvedValue({ rows: [{ id: 'loaded-75' }], offset: 75 });
    const seededRows = createRows(0, 50);
    const { result } = renderHook(() =>
      useServerVirtualizedRows<TestRow>({
        initialRows: seededRows,
        rowCount: 100,
        pageSize: 25,
        prunePages: 0,
        fetchRows,
      }),
    );

    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 75,
        endIndex: 75,
        signal: new AbortController().signal,
      });
    });

    expect(result.current.serverVirtualization.getRow(0)).toBeUndefined();
    expect(result.current.serverVirtualization.getRow(75)).toEqual({ id: 'loaded-75' });
  });

  it('does not request rows for empty tables, invalid page sizes, or already-aborted signals', async () => {
    const fetchRows = vi.fn().mockResolvedValue({ rows: [], offset: 0 });
    const controller = new AbortController();
    controller.abort();
    const { result, rerender } = renderHook(
      ({ rowCount, pageSize }) =>
        useServerVirtualizedRows<TestRow>({
          rowCount,
          pageSize,
          fetchRows,
        }),
      { initialProps: { rowCount: 0, pageSize: 25 } },
    );

    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 0,
        endIndex: 10,
        signal: new AbortController().signal,
      });
    });

    rerender({ rowCount: 10, pageSize: 0 });
    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 0,
        endIndex: 10,
        signal: new AbortController().signal,
      });
    });

    rerender({ rowCount: 10, pageSize: 25 });
    await act(async () => {
      await result.current.serverVirtualization.loadRows({
        startIndex: 0,
        endIndex: 10,
        signal: controller.signal,
      });
    });

    expect(fetchRows).not.toHaveBeenCalled();
  });
});
