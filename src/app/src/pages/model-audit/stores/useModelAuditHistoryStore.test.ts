import { act } from '@testing-library/react';
import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useModelAuditHistoryStore } from './useModelAuditHistoryStore';
import type { ScanResult } from '../ModelAudit.types';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const mockedCallApi = callApi as Mock;

interface HistoricalScan {
  id: string;
  createdAt: number;
  updatedAt: number;
  name?: string | null;
  author?: string | null;
  modelPath: string;
  modelType?: string | null;
  results: ScanResult;
  hasErrors: boolean;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
  metadata?: Record<string, any> | null;
}

describe('useModelAuditHistoryStore', () => {
  const initialState = useModelAuditHistoryStore.getState();

  const mockHistoricalScan: HistoricalScan = {
    id: 'scan-123',
    name: 'Test Scan',
    author: 'test@example.com',
    modelPath: '/path/to/model',
    modelType: 'pytorch',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hasErrors: false,
    totalChecks: 10,
    passedChecks: 8,
    failedChecks: 2,
    results: {
      path: '/path/to/model',
      success: true,
      issues: [],
    },
    metadata: { version: '1.0' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useModelAuditHistoryStore.setState(initialState, true);
  });

  describe('initial state', () => {
    it('should have correct initial state values', () => {
      const state = useModelAuditHistoryStore.getState();
      expect(state.historicalScans).toEqual([]);
      expect(state.isLoadingHistory).toBe(false);
      expect(state.historyError).toBeNull();
      expect(state.pageSize).toBe(50);
      expect(state.currentPage).toBe(0);
      expect(state.sortModel).toEqual([
        {
          field: 'createdAt',
          sort: 'desc',
        },
      ]);
      expect(state.filterModel).toEqual({});
      expect(state.searchQuery).toBe('');
    });
  });

  describe('DataGrid state management', () => {
    it('should update page size correctly', () => {
      act(() => {
        useModelAuditHistoryStore.getState().setPageSize(25);
      });

      expect(useModelAuditHistoryStore.getState().pageSize).toBe(25);
    });

    it('should update current page correctly', () => {
      act(() => {
        useModelAuditHistoryStore.getState().setCurrentPage(2);
      });

      expect(useModelAuditHistoryStore.getState().currentPage).toBe(2);
    });

    it('should update sort model correctly', () => {
      const newSortModel = [{ field: 'name', sort: 'asc' as const }];

      act(() => {
        useModelAuditHistoryStore.getState().setSortModel(newSortModel);
      });

      expect(useModelAuditHistoryStore.getState().sortModel).toEqual(newSortModel);
    });

    it('should handle empty sort model', () => {
      act(() => {
        useModelAuditHistoryStore.getState().setSortModel([]);
      });

      expect(useModelAuditHistoryStore.getState().sortModel).toEqual([]);
    });

    it('should update filter model correctly', () => {
      const newFilterModel = {
        hasErrors: true,
        modelType: 'pytorch',
      };

      act(() => {
        useModelAuditHistoryStore.getState().setFilterModel(newFilterModel);
      });

      expect(useModelAuditHistoryStore.getState().filterModel).toEqual(newFilterModel);
    });

    it('should update search query correctly', () => {
      const query = 'test search query';

      act(() => {
        useModelAuditHistoryStore.getState().setSearchQuery(query);
      });

      expect(useModelAuditHistoryStore.getState().searchQuery).toBe(query);
    });
  });

  describe('fetchHistoricalScans', () => {
    it('should fetch scans successfully', async () => {
      const mockResponse = {
        scans: [mockHistoricalScan],
        total: 1,
      };

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await act(async () => {
        await useModelAuditHistoryStore.getState().fetchHistoricalScans();
      });

      const state = useModelAuditHistoryStore.getState();
      expect(state.historicalScans).toEqual([mockHistoricalScan]);
      expect(state.isLoadingHistory).toBe(false);
      expect(state.historyError).toBeNull();
      expect(mockedCallApi).toHaveBeenCalledWith('/model-audit/scans', {
        cache: 'no-store'
      });
    });

    it('should handle API fetch failure', async () => {
      const errorMessage = 'Network error';
      mockedCallApi.mockRejectedValue(new Error(errorMessage));

      await act(async () => {
        await useModelAuditHistoryStore.getState().fetchHistoricalScans();
      });

      const state = useModelAuditHistoryStore.getState();
      expect(state.historyError).toBe('Network error');
      expect(state.isLoadingHistory).toBe(false);
      expect(state.historicalScans).toEqual([]);
    });

    it('should handle API response error', async () => {
      mockedCallApi.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await act(async () => {
        await useModelAuditHistoryStore.getState().fetchHistoricalScans();
      });

      const state = useModelAuditHistoryStore.getState();
      expect(state.historyError).toBe('Failed to fetch historical scans');
      expect(state.isLoadingHistory).toBe(false);
    });

    it('should set loading state during fetch', () => {
      mockedCallApi.mockImplementation(() => new Promise(() => {})); // Never resolves

      act(() => {
        useModelAuditHistoryStore.getState().fetchHistoricalScans();
      });

      expect(useModelAuditHistoryStore.getState().isLoadingHistory).toBe(true);
    });

    it('should clear error before fetching', async () => {
      // Set initial error
      useModelAuditHistoryStore.setState({ historyError: 'Initial error' });

      const mockResponse = {
        scans: [mockHistoricalScan],
        total: 1,
      };

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await act(async () => {
        await useModelAuditHistoryStore.getState().fetchHistoricalScans();
      });

      expect(useModelAuditHistoryStore.getState().historyError).toBeNull();
    });

    it('should handle response without scans array', async () => {
      const mockResponse = {
        // No scans property
        total: 0,
      };

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await act(async () => {
        await useModelAuditHistoryStore.getState().fetchHistoricalScans();
      });

      const state = useModelAuditHistoryStore.getState();
      expect(state.historicalScans).toEqual([]);
      expect(state.isLoadingHistory).toBe(false);
      expect(state.historyError).toBeNull();
    });
  });

  describe('deleteHistoricalScan', () => {
    it('should delete scan successfully', async () => {
      // Set initial scans
      useModelAuditHistoryStore.setState({
        historicalScans: [mockHistoricalScan],
      });

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, message: 'Scan deleted' }),
      });

      await act(async () => {
        await useModelAuditHistoryStore.getState().deleteHistoricalScan('scan-123');
      });

      expect(mockedCallApi).toHaveBeenCalledWith('/model-audit/scans/scan-123', {
        method: 'DELETE',
      });

      // Should remove scan from local state
      const state = useModelAuditHistoryStore.getState();
      expect(state.historicalScans).toEqual([]);
    });

    it('should handle delete scan failure', async () => {
      const errorMessage = 'Failed to delete';
      mockedCallApi.mockRejectedValue(new Error(errorMessage));

      await expect(async () => {
        await useModelAuditHistoryStore.getState().deleteHistoricalScan('scan-123');
      }).rejects.toThrow('Failed to delete');

      const state = useModelAuditHistoryStore.getState();
      expect(state.historyError).toBe('Failed to delete');
    });

    it('should handle API response error for delete', async () => {
      mockedCallApi.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(async () => {
        await useModelAuditHistoryStore.getState().deleteHistoricalScan('scan-123');
      }).rejects.toThrow('Failed to delete scan');

      const state = useModelAuditHistoryStore.getState();
      expect(state.historyError).toBe('Failed to delete scan');
    });

    it('should not remove scan from local state if delete fails', async () => {
      // Set initial scans
      useModelAuditHistoryStore.setState({
        historicalScans: [mockHistoricalScan],
      });

      mockedCallApi.mockRejectedValue(new Error('Delete failed'));

      await expect(async () => {
        await useModelAuditHistoryStore.getState().deleteHistoricalScan('scan-123');
      }).rejects.toThrow('Delete failed');

      // Should keep scan in local state since delete failed
      const state = useModelAuditHistoryStore.getState();
      expect(state.historicalScans).toEqual([mockHistoricalScan]);
    });

    it('should remove correct scan from multiple scans', async () => {
      const scan2: HistoricalScan = {
        ...mockHistoricalScan,
        id: 'scan-456',
        name: 'Test Scan 2',
      };

      // Set initial scans
      useModelAuditHistoryStore.setState({
        historicalScans: [mockHistoricalScan, scan2],
      });

      mockedCallApi.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, message: 'Scan deleted' }),
      });

      await act(async () => {
        await useModelAuditHistoryStore.getState().deleteHistoricalScan('scan-123');
      });

      // Should remove only scan-123, keeping scan-456
      const state = useModelAuditHistoryStore.getState();
      expect(state.historicalScans).toEqual([scan2]);
    });
  });

  describe('resetHistoryState', () => {
    it('should reset all history state to initial values', () => {
      // Set some non-default state
      useModelAuditHistoryStore.setState({
        historicalScans: [mockHistoricalScan],
        isLoadingHistory: true,
        historyError: 'Some error',
        currentPage: 5,
        searchQuery: 'test query',
        filterModel: { hasErrors: true },
      });

      act(() => {
        useModelAuditHistoryStore.getState().resetHistoryState();
      });

      const state = useModelAuditHistoryStore.getState();
      expect(state.historicalScans).toEqual([]);
      expect(state.isLoadingHistory).toBe(false);
      expect(state.historyError).toBeNull();
      expect(state.currentPage).toBe(0);
      expect(state.searchQuery).toBe('');
      expect(state.filterModel).toEqual({});
      // Should NOT reset pageSize and sortModel as they're not included in reset
      expect(state.pageSize).toBe(50);
      expect(state.sortModel).toEqual([{ field: 'createdAt', sort: 'desc' }]);
    });
  });

  describe('error handling edge cases', () => {
    it('should handle non-Error objects in catch blocks', async () => {
      mockedCallApi.mockRejectedValue('String error');

      await act(async () => {
        await useModelAuditHistoryStore.getState().fetchHistoricalScans();
      });

      const state = useModelAuditHistoryStore.getState();
      expect(state.historyError).toBe('Failed to fetch history');
      expect(state.isLoadingHistory).toBe(false);
    });

    it('should handle non-Error objects in delete catch blocks', async () => {
      mockedCallApi.mockRejectedValue('String error');

      await expect(async () => {
        await useModelAuditHistoryStore.getState().deleteHistoricalScan('scan-123');
      }).rejects.toThrow('String error');

      const state = useModelAuditHistoryStore.getState();
      expect(state.historyError).toBe('Failed to delete scan');
    });
  });
});