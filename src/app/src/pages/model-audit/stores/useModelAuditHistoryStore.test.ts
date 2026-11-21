import { callApi } from '@app/utils/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelAuditHistoryStore } from './useModelAuditHistoryStore';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const createFailedResponseFixture = () => ({
  ok: false,
});

vi.mock('@app/utils/api');

const mockCallApi = vi.mocked(callApi);

const createMockScan = (id: string, name: string) => ({
  id,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  name,
  modelPath: '/test/model.bin',
  hasErrors: false,
  results: {
    path: '/test',
    success: true,
    issues: [],
  },
  totalChecks: 5,
  passedChecks: 5,
  failedChecks: 0,
});

describe('useModelAuditHistoryStore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset store state between tests
    useModelAuditHistoryStore.setState({
      historicalScans: [],
      isLoadingHistory: false,
      historyError: null,
      totalCount: 0,
      pageSize: 25,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchHistoricalScans', () => {
    it('should fetch historical scans', async () => {
      const mockScans = [createMockScan('1', 'Scan 1'), createMockScan('2', 'Scan 2')];

      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ scans: mockScans, total: 2 }),
      } as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      await act(async () => {
        await result.current.fetchHistoricalScans();
      });

      expect(mockCallApi).toHaveBeenCalledWith(
        '/model-audit/scans?limit=25&offset=0&sort=createdAt&order=desc',
        { signal: undefined },
      );
      await waitFor(() => {
        expect(result.current.historicalScans).toHaveLength(2);
        expect(result.current.totalCount).toBe(2);
        expect(result.current.isLoadingHistory).toBe(false);
      });
    });

    it('should handle fetch error', async () => {
      mockCallApi.mockResolvedValueOnce(createFailedResponseFixture() as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      await act(async () => {
        await result.current.fetchHistoricalScans();
      });

      await waitFor(() => {
        expect(result.current.historyError).toBe('Failed to fetch historical scans');
        expect(result.current.isLoadingHistory).toBe(false);
      });
    });

    it('should ignore abort errors', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockCallApi.mockRejectedValueOnce(abortError);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      await act(async () => {
        await result.current.fetchHistoricalScans();
      });

      // Should not set error for abort
      expect(result.current.historyError).toBeNull();
      expect(result.current.isLoadingHistory).toBe(false);
    });

    it('keeps a newer history request loading when an older request is aborted', async () => {
      const older = createDeferred<Response>();
      const newer = createDeferred<Response>();
      mockCallApi.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      const store = useModelAuditHistoryStore.getState();
      const olderFetch = store.fetchHistoricalScans();
      const newerFetch = store.fetchHistoricalScans();

      older.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      await olderFetch;
      expect(useModelAuditHistoryStore.getState().isLoadingHistory).toBe(true);
      const scans = [createMockScan('new', 'New scan')];
      newer.resolve({ ok: true, json: async () => ({ scans, total: 1 }) } as Response);
      await newerFetch;
      expect(useModelAuditHistoryStore.getState()).toMatchObject({
        historicalScans: scans,
        totalCount: 1,
        isLoadingHistory: false,
        historyError: null,
      });
    });

    it.each(['success', 'error'])(
      'ignores an older %s after a newer history request completes',
      async (outcome) => {
        const older = createDeferred<Response>();
        const scans = [createMockScan('new', 'New scan')];
        mockCallApi.mockReturnValueOnce(older.promise).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ scans, total: 1 }),
        } as Response);
        const store = useModelAuditHistoryStore.getState();
        const olderFetch = store.fetchHistoricalScans();
        await store.fetchHistoricalScans();
        if (outcome === 'success') {
          older.resolve({ ok: true, json: async () => ({ scans: [], total: 0 }) } as Response);
        } else {
          older.reject(new Error('Stale failure'));
        }
        await olderFetch;
        expect(useModelAuditHistoryStore.getState()).toMatchObject({
          historicalScans: scans,
          totalCount: 1,
          isLoadingHistory: false,
          historyError: null,
        });
      },
    );
  });

  describe('fetchHistoricalScanRange', () => {
    it.each([
      {
        sortModel: [],
        startIndex: 25,
        endIndex: 49,
        query: 'limit=25&offset=25&sort=createdAt&order=desc',
      },
      {
        sortModel: [{ field: 'name' as const, sort: 'asc' as const }],
        startIndex: 5,
        endIndex: 9,
        query: 'limit=5&offset=5&sort=name&order=asc',
      },
      {
        sortModel: [],
        startIndex: -5,
        endIndex: -1,
        query: 'limit=1&offset=0&sort=createdAt&order=desc',
      },
    ])(
      'requests $query without replacing the initial rows',
      async ({ sortModel, startIndex, endIndex, query }) => {
        const store = useModelAuditHistoryStore.getState();
        const initialScans = [createMockScan('initial', 'Initial scan')];
        const scans = [createMockScan('range', 'Range scan')];
        const signal = new AbortController().signal;
        useModelAuditHistoryStore.setState({
          historicalScans: initialScans,
          historyError: 'Previous error',
        });
        store.setSortModel(sortModel);
        mockCallApi.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ scans, total: 50 }),
        } as Response);

        await expect(
          store.fetchHistoricalScanRange({ startIndex, endIndex }, signal),
        ).resolves.toEqual({
          scans,
          offset: Math.max(0, startIndex),
          total: 50,
        });
        expect(mockCallApi).toHaveBeenCalledWith(`/model-audit/scans?${query}`, { signal });
        expect(useModelAuditHistoryStore.getState()).toMatchObject({
          historicalScans: initialScans,
          totalCount: 50,
          historyError: null,
          isLoadingHistory: false,
          sortModel,
        });
      },
    );

    it.each([
      { error: new Error('Offline'), historyError: 'Offline' },
      {
        error: Object.assign(new Error('Aborted'), { name: 'AbortError' }),
        historyError: 'Previous error',
      },
      { error: 'Offline', historyError: 'Failed to fetch history' },
    ])(
      'propagates $error and preserves the appropriate error state',
      async ({ error, historyError }) => {
        useModelAuditHistoryStore.setState({ historyError: 'Previous error', totalCount: 10 });
        mockCallApi.mockRejectedValueOnce(error);
        await expect(
          useModelAuditHistoryStore
            .getState()
            .fetchHistoricalScanRange({ startIndex: 0, endIndex: 24 }),
        ).rejects.toBe(error);
        expect(useModelAuditHistoryStore.getState()).toMatchObject({
          historyError,
          totalCount: 10,
          isLoadingHistory: false,
        });
      },
    );

    it('rejects unsuccessful responses', async () => {
      mockCallApi.mockResolvedValueOnce({ ok: false } as Response);
      await expect(
        useModelAuditHistoryStore
          .getState()
          .fetchHistoricalScanRange({ startIndex: 0, endIndex: 24 }),
      ).rejects.toThrow('Failed to fetch historical scans');
      expect(useModelAuditHistoryStore.getState().historyError).toBe(
        'Failed to fetch historical scans',
      );
    });
  });

  describe('fetchScanById', () => {
    it('should fetch a single scan by ID', async () => {
      const mockScan = createMockScan('123', 'Test Scan');

      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockScan),
      } as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      let fetchedScan;
      await act(async () => {
        fetchedScan = await result.current.fetchScanById('123');
      });

      expect(fetchedScan).toEqual(mockScan);
    });

    it('should return null for 404', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      let fetchedScan;
      await act(async () => {
        fetchedScan = await result.current.fetchScanById('nonexistent');
      });

      expect(fetchedScan).toBeNull();
    });

    it('should re-throw AbortError for caller to handle', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockCallApi.mockRejectedValueOnce(abortError);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      // AbortError should be re-thrown so caller can handle it appropriately
      await expect(result.current.fetchScanById('123')).rejects.toThrow('Aborted');
    });

    it('should handle IDs with special characters', async () => {
      const scanId = 'scan-abc-2025-12-06T10:30:45';
      const mockScan = createMockScan(scanId, 'Test Scan');

      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockScan),
      } as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      await act(async () => {
        await result.current.fetchScanById(scanId);
      });

      // IDs are passed directly - colons are valid in URL paths per RFC 3986
      expect(mockCallApi).toHaveBeenCalledWith(`/model-audit/scans/${scanId}`, expect.any(Object));
    });
  });

  describe('deleteHistoricalScan', () => {
    it.each(['initial', 'range'])(
      'preserves the server total when an off-page deletion fails after a %s refresh',
      async (refresh) => {
        const scans = [createMockScan('1', 'Scan 1')];
        useModelAuditHistoryStore.setState({ historicalScans: scans, totalCount: 30 });
        const deletion = createDeferred<Response>();
        mockCallApi.mockReturnValueOnce(deletion.promise).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            scans: refresh === 'range' ? [createMockScan('26', 'Off-page scan')] : scans,
            total: 30,
          }),
        } as Response);
        const store = useModelAuditHistoryStore.getState();
        const deletionResult = expect(store.deleteHistoricalScan('26')).rejects.toThrow(
          'Failed to delete scan',
        );
        if (refresh === 'range') {
          await store.fetchHistoricalScanRange({ startIndex: 25, endIndex: 29 });
        } else {
          await store.fetchHistoricalScans();
        }
        deletion.resolve({ ok: false } as Response);
        await deletionResult;
        expect(useModelAuditHistoryStore.getState()).toMatchObject({
          historicalScans: scans,
          totalCount: 30,
        });
      },
    );

    it.each([true, false])(
      'preserves a refreshed count when the failed deletion is already present (initially visible: %s)',
      async (initiallyVisible) => {
        const scans = [createMockScan('1', 'Scan 1'), createMockScan('2', 'Scan 2')];
        useModelAuditHistoryStore.setState({
          historicalScans: initiallyVisible ? scans : [scans[1]],
          totalCount: 2,
        });
        const deletion = createDeferred<Response>();
        mockCallApi.mockReturnValueOnce(deletion.promise).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ scans, total: 2 }),
        } as Response);
        const store = useModelAuditHistoryStore.getState();
        const deletionResult = expect(store.deleteHistoricalScan('1')).rejects.toThrow(
          'Failed to delete scan',
        );
        await store.fetchHistoricalScans();
        deletion.resolve({ ok: false } as Response);
        await deletionResult;
        expect(useModelAuditHistoryStore.getState()).toMatchObject({
          historicalScans: scans,
          totalCount: 2,
          historyError: 'Failed to delete scan',
        });
      },
    );

    it.each(
      ['failed-first', 'successful-first'].flatMap((completionOrder) =>
        ['1', '2'].flatMap((failedId) =>
          [true, false].map((failedStartsFirst) => ({
            completionOrder,
            failedId,
            failedStartsFirst,
          })),
        ),
      ),
    )(
      'only restores failed scan $failedId when deletion completes $completionOrder (failed starts first: $failedStartsFirst)',
      async ({ completionOrder, failedId, failedStartsFirst }) => {
        const scans = [
          createMockScan('1', 'Scan 1'),
          createMockScan('2', 'Scan 2'),
          createMockScan('3', 'Scan 3'),
        ];
        useModelAuditHistoryStore.setState({ historicalScans: scans, totalCount: 3 });
        const failing = createDeferred<Response>();
        const successful = createDeferred<Response>();
        mockCallApi.mockImplementation((path) =>
          path.endsWith(`/${failedId}`) ? failing.promise : successful.promise,
        );
        const store = useModelAuditHistoryStore.getState();
        const successfulId = failedId === '1' ? '2' : '1';
        const earlier = store.deleteHistoricalScan(failedStartsFirst ? failedId : successfulId);
        const later = store.deleteHistoricalScan(failedStartsFirst ? successfulId : failedId);
        const firstDeletion = failedStartsFirst ? earlier : later;
        const firstResult = expect(firstDeletion).rejects.toThrow('Failed to delete scan');
        const secondDeletion = failedStartsFirst ? later : earlier;
        expect(useModelAuditHistoryStore.getState()).toMatchObject({
          historicalScans: [scans[2]],
          totalCount: 1,
        });

        if (completionOrder === 'successful-first') {
          successful.resolve({ ok: true } as Response);
          await secondDeletion;
        }
        failing.resolve({ ok: false } as Response);
        await firstResult;
        if (completionOrder === 'failed-first') {
          successful.resolve({ ok: true } as Response);
          await secondDeletion;
        }
        expect(useModelAuditHistoryStore.getState()).toMatchObject({
          historicalScans: [scans.find((scan) => scan.id === failedId), scans[2]],
          totalCount: 2,
          historyError: 'Failed to delete scan',
        });
      },
    );

    it.each(
      ['1', '2'].flatMap((firstId) =>
        [true, false].map((firstSettles) => ({ firstId, firstSettles })),
      ),
    )(
      'restores both failed deletions in order (first ID: $firstId, first settles: $firstSettles)',
      async ({ firstId, firstSettles }) => {
        const scans = [
          createMockScan('1', 'Scan 1'),
          createMockScan('2', 'Scan 2'),
          createMockScan('3', 'Scan 3'),
        ];
        useModelAuditHistoryStore.setState({ historicalScans: scans, totalCount: 3 });
        const first = createDeferred<Response>();
        const second = createDeferred<Response>();
        mockCallApi.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const store = useModelAuditHistoryStore.getState();
        const firstResult = expect(store.deleteHistoricalScan(firstId)).rejects.toThrow(
          'Failed to delete scan',
        );
        const secondResult = expect(
          store.deleteHistoricalScan(firstId === '1' ? '2' : '1'),
        ).rejects.toThrow('Failed to delete scan');
        const [early, late] = firstSettles ? [first, second] : [second, first];
        const [earlyResult, lateResult] = firstSettles
          ? [firstResult, secondResult]
          : [secondResult, firstResult];
        early.resolve({ ok: false } as Response);
        await earlyResult;
        late.resolve({ ok: false } as Response);
        await lateResult;
        expect(useModelAuditHistoryStore.getState()).toMatchObject({
          historicalScans: scans,
          totalCount: 3,
        });
      },
    );

    it('captures the current server order for each new batch of concurrent deletions', async () => {
      for (const ids of [
        ['3', '1', '2'],
        ['2', '1', '3'],
      ]) {
        const scans = ids.map((id) => createMockScan(id, `Scan ${id}`));
        useModelAuditHistoryStore.setState({ historicalScans: scans, totalCount: 3 });
        const first = createDeferred<Response>();
        const second = createDeferred<Response>();
        mockCallApi.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const store = useModelAuditHistoryStore.getState();
        const firstResult = expect(store.deleteHistoricalScan(ids[1])).rejects.toThrow(
          'Failed to delete scan',
        );
        const secondResult = expect(store.deleteHistoricalScan(ids[0])).rejects.toThrow(
          'Failed to delete scan',
        );
        first.resolve({ ok: false } as Response);
        await firstResult;
        second.resolve({ ok: false } as Response);
        await secondResult;
        expect(useModelAuditHistoryStore.getState()).toMatchObject({
          historicalScans: scans,
          totalCount: 3,
        });
      }
    });

    it('should delete a scan and update local state', async () => {
      const mockScans = [createMockScan('1', 'Scan 1'), createMockScan('2', 'Scan 2')];

      // First set up some initial state
      useModelAuditHistoryStore.setState({
        historicalScans: mockScans,
        totalCount: 2,
      });

      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      await act(async () => {
        await result.current.deleteHistoricalScan('1');
      });

      expect(result.current.historicalScans).toHaveLength(1);
      expect(result.current.historicalScans[0].id).toBe('2');
      expect(result.current.totalCount).toBe(1);
    });

    it('should handle delete error and rollback state', async () => {
      const mockScans = [createMockScan('1', 'Scan 1'), createMockScan('2', 'Scan 2')];

      // Set up initial state with scans
      useModelAuditHistoryStore.setState({
        historicalScans: mockScans,
        totalCount: 2,
      });

      mockCallApi.mockResolvedValueOnce(createFailedResponseFixture() as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      // Verify initial state
      expect(result.current.historicalScans).toHaveLength(2);
      expect(result.current.totalCount).toBe(2);

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.deleteHistoricalScan('1');
        } catch (error) {
          thrownError = error as Error;
        }
      });

      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toBe('Failed to delete scan');
      expect(result.current.historyError).toBe('Failed to delete scan');

      // Verify rollback: scans should be restored after failed delete
      expect(result.current.historicalScans).toHaveLength(2);
      expect(result.current.historicalScans[0].id).toBe('1');
      expect(result.current.totalCount).toBe(2);
    });

    it('should restore totalCount when an off-page delete fails', async () => {
      const mockScans = [createMockScan('1', 'Scan 1'), createMockScan('2', 'Scan 2')];

      useModelAuditHistoryStore.setState({
        historicalScans: mockScans,
        totalCount: 3,
      });

      mockCallApi.mockResolvedValueOnce(createFailedResponseFixture() as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      await act(async () => {
        await expect(result.current.deleteHistoricalScan('off-page')).rejects.toThrow(
          'Failed to delete scan',
        );
      });

      expect(result.current.historicalScans).toEqual(mockScans);
      expect(result.current.totalCount).toBe(3);
      expect(result.current.historyError).toBe('Failed to delete scan');
    });
  });

  it('should set sort model', () => {
    const { result } = renderHook(() => useModelAuditHistoryStore());

    act(() => {
      result.current.setSortModel([{ field: 'name', sort: 'asc' }]);
    });

    expect(result.current.sortModel).toEqual([{ field: 'name', sort: 'asc' }]);
  });
});
