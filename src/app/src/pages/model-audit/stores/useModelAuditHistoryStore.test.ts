import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useModelAuditHistoryStore } from './useModelAuditHistoryStore';
import { callApi } from '@app/utils/api';

vi.mock('@app/utils/api');

describe('useModelAuditHistoryStore', () => {
  const mockCallApi = vi.mocked(callApi);

  const mockScans = [
    {
      id: '1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelPath: '/path/to/model1',
      results: {
        issues: [],
        path: '/path/to/model1',
        success: true,
      },
      hasErrors: false,
    },
    {
      id: '2',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      modelPath: '/path/to/model2',
      results: {
        issues: [],
        path: '/path/to/model2',
        success: false,
      },
      hasErrors: true,
    },
  ];

  beforeEach(() => {
    act(() => {
      useModelAuditHistoryStore.setState(useModelAuditHistoryStore.getInitialState());
    });
  });

  it('should fetch historical scans successfully', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ scans: mockScans }),
    } as Response);

    const { result } = renderHook(() => useModelAuditHistoryStore());

    await act(async () => {
      await result.current.fetchHistoricalScans();
    });

    expect(result.current.historicalScans).toEqual(mockScans);
    expect(result.current.isLoadingHistory).toBe(false);
    expect(result.current.historyError).toBeNull();
  });

  it('should handle fetch historical scans failure', async () => {
    mockCallApi.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useModelAuditHistoryStore());

    await act(async () => {
      await result.current.fetchHistoricalScans();
    });

    expect(result.current.historicalScans).toEqual([]);
    expect(result.current.isLoadingHistory).toBe(false);
    expect(result.current.historyError).toBe('Failed to fetch');
  });

  it('should delete a historical scan successfully', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: mockScans }),
    } as Response);
    mockCallApi.mockResolvedValueOnce({ ok: true } as Response);

    const { result } = renderHook(() => useModelAuditHistoryStore());

    await act(async () => {
      await result.current.fetchHistoricalScans();
    });

    expect(result.current.historicalScans).toEqual(mockScans);

    await act(async () => {
      await result.current.deleteHistoricalScan('1');
    });

    expect(result.current.historicalScans).toEqual([mockScans[1]]);
  });

  it('should handle delete historical scan failure', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: mockScans }),
    } as Response);
    mockCallApi.mockRejectedValueOnce(new Error('Failed to delete'));

    const { result } = renderHook(() => useModelAuditHistoryStore());

    await act(async () => {
      await result.current.fetchHistoricalScans();
    });

    await act(async () => {
      await expect(result.current.deleteHistoricalScan('1')).rejects.toThrow('Failed to delete');
    });

    expect(result.current.historicalScans).toEqual(mockScans); // Should not be deleted from state
    expect(result.current.historyError).toBe('Failed to delete');
  });

  it('should handle search queries with special characters by encoding them', async () => {
    const searchQuery = 'test&query=with?special characters';
    const encodedSearchQuery = encodeURIComponent(searchQuery);

    mockCallApi.mockImplementation((url: string) => {
      expect(url).toContain(`search=${encodedSearchQuery}`);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ scans: mockScans }),
      } as Response);
    });

    const { result } = renderHook(() => useModelAuditHistoryStore());

    act(() => {
      result.current.setSearchQuery(searchQuery);
    });

    await act(async () => {
      await result.current.fetchHistoricalScans();
    });
  });

  it('should handle API responses with malformed scan objects', async () => {
    const malformedScan = {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelPath: '/path/to/model1',
      results: {
        issues: [],
        path: '/path/to/model1',
        success: true,
      },
      hasErrors: false,
      id: 'generated-id',
    };

    mockCallApi.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          scans: [malformedScan],
        }),
    } as Response);

    const { result } = renderHook(() => useModelAuditHistoryStore());

    await act(async () => {
      await result.current.fetchHistoricalScans();
    });

    expect(result.current.historicalScans).toEqual([malformedScan]);
    expect(result.current.isLoadingHistory).toBe(false);
    expect(result.current.historyError).toBeNull();
  });

  it('should handle delete non-existent historical scan gracefully', async () => {
    mockCallApi.mockResolvedValue({ ok: true } as Response);

    const { result } = renderHook(() => useModelAuditHistoryStore());

    await act(async () => {
      useModelAuditHistoryStore.setState({ historicalScans: mockScans });
    });

    const initialScans = result.current.historicalScans;

    await act(async () => {
      await result.current.deleteHistoricalScan('3');
    });

    expect(result.current.historicalScans).toEqual(initialScans);
    expect(result.current.historyError).toBeNull();
  });

  it('should handle non-JSON API responses', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Unexpected token < in JSON at position 0')),
    } as Response);

    const { result } = renderHook(() => useModelAuditHistoryStore());

    await act(async () => {
      await result.current.fetchHistoricalScans();
    });

    expect(result.current.historicalScans).toEqual([]);
    expect(result.current.isLoadingHistory).toBe(false);
    expect(result.current.historyError).toBe('Unexpected token < in JSON at position 0');
  });

  it('should handle negative pageSize and currentPage by normalizing the values', async () => {
    let calledWithNegativeValues = false;
    mockCallApi.mockImplementation(async (path: string) => {
      const url = new URL(`http://localhost${path}`);
      const limit = parseInt(url.searchParams.get('limit') || '0');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      if (limit < 0 || offset < 0) {
        calledWithNegativeValues = true;
      }

      return {
        ok: true,
        json: () => Promise.resolve({ scans: mockScans }),
      } as Response;
    });

    const { result } = renderHook(() => useModelAuditHistoryStore());

    act(() => {
      result.current.setPageSize(-25);
      result.current.setCurrentPage(-1);
    });

    await act(async () => {
      await result.current.fetchHistoricalScans();
    });

    expect(calledWithNegativeValues).toBe(false);
    expect(mockCallApi).toHaveBeenCalled();
  });

  it('should set page size', () => {
    const { result } = renderHook(() => useModelAuditHistoryStore());
    act(() => {
      result.current.setPageSize(25);
    });
    expect(result.current.pageSize).toBe(25);
  });

  it('should set current page', () => {
    const { result } = renderHook(() => useModelAuditHistoryStore());
    act(() => {
      result.current.setCurrentPage(1);
    });
    expect(result.current.currentPage).toBe(1);
  });

  it('should set sort model', () => {
    const { result } = renderHook(() => useModelAuditHistoryStore());
    const sortModel = [{ field: 'name', sort: 'asc' as const }];
    act(() => {
      result.current.setSortModel(sortModel);
    });
    expect(result.current.sortModel).toEqual(sortModel);
  });

  it('should set filter model', () => {
    const { result } = renderHook(() => useModelAuditHistoryStore());
    const filterModel = { items: [{ field: 'name', operator: 'contains', value: 'test' }] };
    act(() => {
      result.current.setFilterModel(filterModel);
    });
    expect(result.current.filterModel).toEqual(filterModel);
  });

  it('should set search query', () => {
    const { result } = renderHook(() => useModelAuditHistoryStore());
    act(() => {
      result.current.setSearchQuery('query');
    });
    expect(result.current.searchQuery).toBe('query');
  });

  it('should reset history state', () => {
    const { result } = renderHook(() => useModelAuditHistoryStore());
    act(() => {
      result.current.setPageSize(25);
      result.current.setCurrentPage(1);
      result.current.setSearchQuery('query');
      result.current.resetHistoryState();
    });
    expect(result.current.pageSize).toBe(50);
    expect(result.current.currentPage).toBe(0);
    expect(result.current.searchQuery).toBe('');
    expect(result.current.historicalScans).toEqual([]);
    expect(result.current.isLoadingHistory).toBe(false);
    expect(result.current.historyError).toBeNull();
  });
});
