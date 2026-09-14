import { callApiJson, callApiResult } from '@app/utils/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelAuditHistoryStore } from './useModelAuditHistoryStore';

vi.mock('@app/utils/api');

const mockCallApiJson = vi.mocked(callApiJson);
const mockCallApiResult = vi.mocked(callApiResult);

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

      mockCallApiJson.mockResolvedValueOnce({ scans: mockScans, total: 2 } as any);

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
      mockCallApiJson.mockRejectedValueOnce(new Error('Failed to fetch historical scans'));

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
      mockCallApiJson.mockRejectedValueOnce(abortError);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      await act(async () => {
        await result.current.fetchHistoricalScans();
      });

      // Should not set error for abort
      expect(result.current.historyError).toBeNull();
    });

    it('should include search query in request', async () => {
      mockCallApiJson.mockResolvedValueOnce({ scans: [], total: 0 } as any);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setSearchQuery('test query');
      });

      await act(async () => {
        await result.current.fetchHistoricalScans();
      });

      expect(mockCallApiJson.mock.calls[0][2]?.query?.toString()).toContain('search=test+query');
    });

    it('should include pagination params in request', async () => {
      mockCallApiJson.mockResolvedValueOnce({ scans: [], total: 0 } as any);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      act(() => {
        result.current.setPageSize(50);
        result.current.setCurrentPage(2);
      });

      await act(async () => {
        await result.current.fetchHistoricalScans();
      });

      const query = mockCallApiJson.mock.calls[0][2]?.query?.toString();
      expect(query).toContain('limit=50');
      expect(query).toContain('offset=100');
    });
  });

  describe('fetchScanById', () => {
    it('should fetch a single scan by ID', async () => {
      const mockScan = createMockScan('123', 'Test Scan');

      mockCallApiResult.mockResolvedValueOnce({
        ok: true,
        data: mockScan,
      } as any);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      let fetchedScan;
      await act(async () => {
        fetchedScan = await result.current.fetchScanById('123');
      });

      expect(fetchedScan).toEqual(mockScan);
    });

    it('should return null for 404', async () => {
      mockCallApiResult.mockResolvedValueOnce({
        ok: false,
        error: { status: 404 },
      } as any);

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
      mockCallApiResult.mockRejectedValueOnce(abortError);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      // AbortError should be re-thrown so caller can handle it appropriately
      await expect(result.current.fetchScanById('123')).rejects.toThrow('Aborted');
    });

    it('should handle IDs with special characters', async () => {
      const scanId = 'scan-abc-2025-12-06T10:30:45';
      const mockScan = createMockScan(scanId, 'Test Scan');

      mockCallApiResult.mockResolvedValueOnce({
        ok: true,
        data: mockScan,
      } as any);

      const { result } = renderHook(() => useModelAuditHistoryStore());

      await act(async () => {
        await result.current.fetchScanById(scanId);
      });

      // IDs are passed directly - colons are valid in URL paths per RFC 3986
      expect(mockCallApiResult.mock.calls[0][2]?.params).toEqual({ id: scanId });
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

      mockCallApiJson.mockResolvedValueOnce({ success: true, message: 'deleted' });

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

      mockCallApiJson.mockRejectedValueOnce(new Error('Failed to delete scan'));

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

      mockCallApiJson.mockRejectedValueOnce(new Error('Failed to delete scan'));

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
