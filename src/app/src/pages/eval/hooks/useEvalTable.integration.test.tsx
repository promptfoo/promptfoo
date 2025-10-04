/**
 * Integration tests for useEvalTable hook.
 * These tests verify the complete data flow including:
 * - React Query caching behavior
 * - Request deduplication
 * - Filter changes and refetching
 * - Cache invalidation
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEvalTable, normalizeEvalTableOptions } from './useEvalTable';
import { callApi } from '@app/utils/api';
import { createTestQueryClient, createQueryClientWrapper } from '@app/test/queryClientWrapper';

vi.mock('@app/utils/api');

describe('useEvalTable Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should deduplicate simultaneous requests for the same eval', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        table: { head: { prompts: [], vars: [] }, body: [] },
        config: {},
        filteredCount: 0,
        totalCount: 0,
      }),
    };

    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    const queryClient = createTestQueryClient();

    // Render the hook twice simultaneously with the same evalId
    const { result: result1 } = renderHook(() => useEvalTable('eval-1'), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    const { result: result2 } = renderHook(() => useEvalTable('eval-1'), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
      expect(result2.current.isLoading).toBe(false);
    });

    // CRITICAL: Should only call API once due to request deduplication
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result1.current.data).toBeDefined();
    expect(result2.current.data).toBeDefined();
  });

  it('should NOT refetch when filters array reference changes but content is same', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        table: { head: { prompts: [], vars: [] }, body: [] },
        config: {},
        filteredCount: 0,
        totalCount: 0,
      }),
    };

    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    const queryClient = createTestQueryClient();

    const filter1 = [{ type: 'plugin', operator: 'equals', value: 'test', logicOperator: 'and' }];

    const { result, rerender } = renderHook(({ filters }) => useEvalTable('eval-1', { filters }), {
      initialProps: { filters: filter1 as any },
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialCallCount = vi.mocked(callApi).mock.calls.length;

    // Create a new array with identical content
    const filter2 = [{ type: 'plugin', operator: 'equals', value: 'test', logicOperator: 'and' }];

    rerender({ filters: filter2 as any });

    // Wait a bit to ensure no refetch happens
    await new Promise((resolve) => setTimeout(resolve, 100));

    // CRITICAL: Should NOT refetch because serialized filters are the same
    expect(callApi).toHaveBeenCalledTimes(initialCallCount);
  });

  it('should refetch when filter content actually changes', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        table: { head: { prompts: [], vars: [] }, body: [] },
        config: {},
        filteredCount: 0,
        totalCount: 0,
      }),
    };

    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    const queryClient = createTestQueryClient();

    const filter1 = [{ type: 'plugin', operator: 'equals', value: 'test1', logicOperator: 'and' }];

    const { result, rerender } = renderHook(({ filters }) => useEvalTable('eval-1', { filters }), {
      initialProps: { filters: filter1 as any },
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialCallCount = vi.mocked(callApi).mock.calls.length;

    // Change filter value
    const filter2 = [{ type: 'plugin', operator: 'equals', value: 'test2', logicOperator: 'and' }];

    rerender({ filters: filter2 as any });

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(initialCallCount + 1);
    });
  });

  it('should use cache when staleTime has not elapsed', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        table: { head: { prompts: [], vars: [] }, body: [] },
        config: {},
        filteredCount: 0,
        totalCount: 0,
      }),
    };

    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    const queryClient = createTestQueryClient();

    // First render
    const { result: result1, unmount } = renderHook(() => useEvalTable('eval-1'), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
    });

    expect(callApi).toHaveBeenCalledTimes(1);

    unmount();

    // Second render immediately (within 30s staleTime)
    const { result: result2 } = renderHook(() => useEvalTable('eval-1'), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result2.current.isLoading).toBe(false);
    });

    // Should still be 1 because data is not stale yet
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result2.current.data).toBeDefined();
  });

  it('should handle API errors gracefully', async () => {
    const mockErrorResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
    };

    vi.mocked(callApi).mockResolvedValue(mockErrorResponse as any);

    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEvalTable('eval-1'), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
      expect(result.current.data).toBeNull();
    });

    expect(result.current.error).toBeDefined();
    if (result.current.error?.message) {
      expect(result.current.error.message).toContain('404');
    }
    expect(result.current.data).toBeNull();
  });

  it('should normalize options consistently', () => {
    const options1 = { pageIndex: 0, pageSize: 50 };
    const options2 = {}; // Should default to same values

    const normalized1 = normalizeEvalTableOptions(options1);
    const normalized2 = normalizeEvalTableOptions(options2);

    expect(normalized1.pageIndex).toBe(normalized2.pageIndex);
    expect(normalized1.pageSize).toBe(normalized2.pageSize);
    expect(normalized1.filterMode).toBe('all');
    expect(normalized1.searchText).toBe('');
    expect(normalized1.filters).toEqual([]);
    expect(normalized1.comparisonEvalIds).toEqual([]);
  });

  it('should handle null evalId gracefully', async () => {
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEvalTable(null), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should not call API when evalId is null
    expect(callApi).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it('should refetch when refetch is called manually', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        table: { head: { prompts: [], vars: [] }, body: [] },
        config: {},
        filteredCount: 0,
        totalCount: 0,
      }),
    };

    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useEvalTable('eval-1'), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialCallCount = vi.mocked(callApi).mock.calls.length;

    // Manually trigger refetch
    result.current.refetch();

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(initialCallCount + 1);
    });
  });
});
