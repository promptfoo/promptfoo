import { callApi } from '@app/utils/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelAuditHistoryStore } from './useModelAuditHistoryStore';

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
    vi.clearAllMocks();
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

      await waitFor(() => {
        expect(result.current.historicalScans).toHaveLength(2);
        expect(result.current.totalCount).toBe(2);
        expect(result.current.isLoadingHistory).toBe(false);
      });
    });

    it('should handle fetch error', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: false,
      } as Response);

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
    });

    it('fetches the first virtualized page', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ scans: [], total: 0 }),
      } as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      await act(async () => {
        await result.current.fetchHistoricalScans();
      });

      expect(mockCallApi).toHaveBeenCalledWith(
        '/model-audit/scans?limit=25&offset=0&sort=createdAt&order=desc',
        expect.any(Object),
      );
    });
  });

  describe('fetchHistoricalScanRange', () => {
    it('preserves server-side virtualization and sorting', async () => {
      const scans = [createMockScan('26', 'Scan 26')];
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ scans, total: 80 }),
      } as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setSortModel([{ field: 'name', sort: 'asc' }]);
      });

      let range;
      await act(async () => {
        range = await result.current.fetchHistoricalScanRange({ startIndex: 25, endIndex: 49 });
      });

      expect(mockCallApi).toHaveBeenCalledWith(
        '/model-audit/scans?limit=25&offset=25&sort=name&order=asc',
        expect.any(Object),
      );
      expect(range).toEqual({ scans, offset: 25, total: 80 });
      expect(result.current.totalCount).toBe(80);
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

      mockCallApi.mockResolvedValueOnce({
        ok: false,
      } as Response);

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

      mockCallApi.mockResolvedValueOnce({
        ok: false,
      } as Response);

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

  describe('server-side sorting', () => {
    it('updates the active sort model', () => {
      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setSortModel([{ field: 'name', sort: 'asc' }]);
      });

      expect(result.current.sortModel).toEqual([{ field: 'name', sort: 'asc' }]);
    });
  });
});
