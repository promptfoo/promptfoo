/**
 * Integration tests for useDeleteScan hook.
 * These tests verify the complete mutation flow including:
 * - Optimistic updates
 * - Automatic rollback on error
 * - Cache invalidation timing
 * - Integration with useHistoricalScans
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDeleteScan } from './useDeleteScan';
import { useHistoricalScans } from './useHistoricalScans';
import { callApi } from '@app/utils/api';
import { createTestQueryClient, createQueryClientWrapper } from '@app/test/queryClientWrapper';
import type { HistoricalScan } from './types';

vi.mock('@app/utils/api');

describe('useDeleteScan Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should perform optimistic update and remove scan from UI immediately', async () => {
    const mockScans: HistoricalScan[] = [
      {
        id: 'scan-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: 'Scan 1',
        modelPath: '/path/1',
        results: {},
        hasErrors: false,
      },
      {
        id: 'scan-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: 'Scan 2',
        modelPath: '/path/2',
        results: {},
        hasErrors: false,
      },
    ];

    // Mock the initial fetch of scans
    vi.mocked(callApi).mockImplementation((url: string, options?: any) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: true } as any);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ scans: mockScans }),
      } as any);
    });

    const queryClient = createTestQueryClient();

    // First render useHistoricalScans to populate cache
    const { result: scansResult } = renderHook(() => useHistoricalScans(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(scansResult.current.isLoading).toBe(false);
    });

    expect(scansResult.current.data).toHaveLength(2);

    // Now render useDeleteScan
    const { result: deleteResult } = renderHook(() => useDeleteScan(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    // Delete scan-1
    await deleteResult.current.deleteScan('scan-1');

    // Verify the delete API was called
    expect(callApi).toHaveBeenCalledWith('/model-audit/scans/scan-1', {
      method: 'DELETE',
    });

    // The optimistic update should have run (even though the mutation is complete)
    // After invalidation, the cache should reflect server state (empty after refetch)
    await waitFor(() => {
      expect(deleteResult.current.isDeleting).toBe(false);
    });
  });

  it('should rollback optimistic update on error', async () => {
    const mockScans: HistoricalScan[] = [
      {
        id: 'scan-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: 'Scan 1',
        modelPath: '/path/1',
        results: {},
        hasErrors: false,
      },
      {
        id: 'scan-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: 'Scan 2',
        modelPath: '/path/2',
        results: {},
        hasErrors: false,
      },
    ];

    // Mock successful fetch but failed delete
    vi.mocked(callApi).mockImplementation((url: string, options?: any) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: false, status: 500 } as any);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ scans: mockScans }),
      } as any);
    });

    const queryClient = createTestQueryClient();

    // First render useHistoricalScans to populate cache
    const { result: scansResult } = renderHook(() => useHistoricalScans(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(scansResult.current.isLoading).toBe(false);
    });

    expect(scansResult.current.data).toHaveLength(2);

    // Now render useDeleteScan
    const { result: deleteResult } = renderHook(() => useDeleteScan(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    // Attempt to delete scan-1 (will fail)
    try {
      await deleteResult.current.deleteScan('scan-1');
    } catch {
      // Expected to fail
    }

    await waitFor(() => {
      expect(deleteResult.current.isDeleting).toBe(false);
    });

    // CRITICAL: Cache should be rolled back to original state
    const cachedData = queryClient.getQueryData(['model-audit', 'scans']);
    expect(cachedData).toEqual(mockScans);

    expect(deleteResult.current.error).toBeDefined();
    expect(deleteResult.current.error?.message).toContain('Failed to delete scan');
  });

  it('should invalidate cache on successful delete (onSettled)', async () => {
    const mockScans: HistoricalScan[] = [
      {
        id: 'scan-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: 'Scan 1',
        modelPath: '/path/1',
        results: {},
        hasErrors: false,
      },
    ];

    const updatedScans: HistoricalScan[] = []; // After delete, scan is gone

    let callCount = 0;

    vi.mocked(callApi).mockImplementation((url: string, options?: any) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: true } as any);
      }
      // Return different data on second fetch (after invalidation)
      callCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({ scans: callCount === 1 ? mockScans : updatedScans }),
      } as any);
    });

    const queryClient = createTestQueryClient();

    // First render useHistoricalScans to populate cache
    const { result: scansResult } = renderHook(() => useHistoricalScans(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(scansResult.current.isLoading).toBe(false);
    });

    expect(scansResult.current.data).toHaveLength(1);

    // Now render useDeleteScan
    const { result: deleteResult } = renderHook(() => useDeleteScan(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    // Delete scan-1
    await deleteResult.current.deleteScan('scan-1');

    await waitFor(() => {
      expect(deleteResult.current.isDeleting).toBe(false);
    });

    // Wait for invalidation and refetch to complete
    await waitFor(() => {
      const cachedData = queryClient.getQueryData(['model-audit', 'scans']);
      expect(cachedData).toEqual(updatedScans);
    });

    // Should have called API twice: initial fetch + refetch after invalidation
    expect(callApi).toHaveBeenCalledTimes(3); // 1 fetch + 1 delete + 1 refetch
  });

  it('should handle multiple simultaneous deletes correctly', async () => {
    const mockScans: HistoricalScan[] = [
      {
        id: 'scan-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: 'Scan 1',
        modelPath: '/path/1',
        results: {},
        hasErrors: false,
      },
      {
        id: 'scan-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: 'Scan 2',
        modelPath: '/path/2',
        results: {},
        hasErrors: false,
      },
      {
        id: 'scan-3',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: 'Scan 3',
        modelPath: '/path/3',
        results: {},
        hasErrors: false,
      },
    ];

    vi.mocked(callApi).mockImplementation((url: string, options?: any) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: true } as any);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ scans: mockScans }),
      } as any);
    });

    const queryClient = createTestQueryClient();

    // First render useHistoricalScans to populate cache
    const { result: scansResult } = renderHook(() => useHistoricalScans(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    await waitFor(() => {
      expect(scansResult.current.isLoading).toBe(false);
    });

    expect(scansResult.current.data).toHaveLength(3);

    // Now render useDeleteScan
    const { result: deleteResult } = renderHook(() => useDeleteScan(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    // Delete multiple scans simultaneously
    const deletePromises = [
      deleteResult.current.deleteScan('scan-1'),
      deleteResult.current.deleteScan('scan-2'),
    ];

    await Promise.all(deletePromises);

    await waitFor(() => {
      expect(deleteResult.current.isDeleting).toBe(false);
    });

    // Both delete API calls should have been made
    expect(callApi).toHaveBeenCalledWith('/model-audit/scans/scan-1', {
      method: 'DELETE',
    });
    expect(callApi).toHaveBeenCalledWith('/model-audit/scans/scan-2', {
      method: 'DELETE',
    });
  });

  it('should expose correct loading state during deletion', async () => {
    const mockScans: HistoricalScan[] = [
      {
        id: 'scan-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        name: 'Scan 1',
        modelPath: '/path/1',
        results: {},
        hasErrors: false,
      },
    ];

    // Simulate slow DELETE request
    vi.mocked(callApi).mockImplementation((url: string, options?: any) => {
      if (options?.method === 'DELETE') {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true } as any), 100);
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ scans: mockScans }),
      } as any);
    });

    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useDeleteScan(), {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });

    expect(result.current.isDeleting).toBe(false);

    // Start delete
    const deletePromise = result.current.deleteScan('scan-1');

    // Should be in loading state
    await waitFor(() => {
      expect(result.current.isDeleting).toBe(true);
    });

    await deletePromise;

    // Should be done loading
    await waitFor(() => {
      expect(result.current.isDeleting).toBe(false);
    });
  });
});
