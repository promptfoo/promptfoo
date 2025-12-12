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
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
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

    it('should include search query in request', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ scans: [], total: 0 }),
      } as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setSearchQuery('test query');
      });

      await act(async () => {
        await result.current.fetchHistoricalScans();
      });

      expect(mockCallApi).toHaveBeenCalledWith(
        expect.stringContaining('search=test+query'),
        expect.any(Object),
      );
    });

    it('should include pagination params in request', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ scans: [], total: 0 }),
      } as Response);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setPageSize(50);
        result.current.setCurrentPage(2);
      });

      await act(async () => {
        await result.current.fetchHistoricalScans();
      });

      expect(mockCallApi).toHaveBeenCalledWith(
        expect.stringContaining('limit=50'),
        expect.any(Object),
      );
      expect(mockCallApi).toHaveBeenCalledWith(
        expect.stringContaining('offset=100'),
        expect.any(Object),
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
  });

  describe('pagination and filtering', () => {
    it('should set page size and reset page', () => {
      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setCurrentPage(5);
      });

      expect(result.current.currentPage).toBe(5);

      act(() => {
        result.current.setPageSize(50);
      });

      expect(result.current.pageSize).toBe(50);
      expect(result.current.currentPage).toBe(0); // Reset to first page
    });

    it('should set current page', () => {
      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setCurrentPage(3);
      });

      expect(result.current.currentPage).toBe(3);
    });

    it('should set sort model and reset page', () => {
      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setCurrentPage(5);
      });

      act(() => {
        result.current.setSortModel([{ field: 'name', sort: 'asc' }]);
      });

      expect(result.current.sortModel).toEqual([{ field: 'name', sort: 'asc' }]);
      expect(result.current.currentPage).toBe(0); // Reset to first page
    });

    it('should set search query and reset page', () => {
      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setCurrentPage(5);
      });

      act(() => {
        result.current.setSearchQuery('test');
      });

      expect(result.current.searchQuery).toBe('test');
      expect(result.current.currentPage).toBe(0); // Reset to first page
    });

    it('should reset all filters', () => {
      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setPageSize(100);
        result.current.setCurrentPage(5);
        result.current.setSortModel([{ field: 'name', sort: 'asc' }]);
        result.current.setSearchQuery('test');
      });

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.pageSize).toBe(25);
      expect(result.current.currentPage).toBe(0);
      expect(result.current.sortModel).toEqual([{ field: 'createdAt', sort: 'desc' }]);
      expect(result.current.searchQuery).toBe('');
    });
  });
});
