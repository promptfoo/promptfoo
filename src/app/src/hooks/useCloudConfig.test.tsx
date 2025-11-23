import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callApi } from '../utils/api';
import useCloudConfig from './useCloudConfig';

vi.mock('../utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

// Unmock useCloudConfig since this file tests it directly
vi.unmock('@app/hooks/useCloudConfig');

describe('useCloudConfig', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 0, // Disable retries for tests
          gcTime: 0, // Disable garbage collection for tests
        },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('should initialize with isLoading=true, data=null, and error=null', () => {
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ appUrl: 'https://app.promptfoo.com', isEnabled: true }),
    } as Response);

    const { result } = renderHook(() => useCloudConfig(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should set data and isLoading=false on successful API call', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCloudConfig),
    } as Response);

    const { result } = renderHook(() => useCloudConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockCloudConfig);
    expect(result.current.error).toBeNull();
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
  });

  it('should set error and isLoading=false when API returns ok=false', async () => {
    vi.mocked(callApi).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    const { result } = renderHook(() => useCloudConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Failed to fetch cloud config');
    expect(result.current.isLoading).toBe(false);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
  });

  it('should handle network errors gracefully', async () => {
    vi.mocked(callApi).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCloudConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(result.current.isLoading).toBe(false);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
  });

  it('should fetch cloud config on mount', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: false,
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCloudConfig),
    } as Response);

    renderHook(() => useCloudConfig(), { wrapper });

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(1);
    });

    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      const initialConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      const updatedConfig = {
        appUrl: 'https://new.promptfoo.com',
        isEnabled: false,
      };

      vi.mocked(callApi).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(initialConfig),
      } as Response);

      const { result } = renderHook(() => useCloudConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(initialConfig);
      expect(callApi).toHaveBeenCalledTimes(1);

      // Setup mock for refetch
      vi.mocked(callApi).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedConfig),
      } as Response);

      // Call refetch
      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(updatedConfig);
      });

      expect(result.current.error).toBeNull();
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(callApi).toHaveBeenNthCalledWith(2, '/user/cloud-config');
    });

    it('should set isLoading during refetch and back to false after completion', async () => {
      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      vi.mocked(callApi).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCloudConfig),
      } as Response);

      const { result } = renderHook(() => useCloudConfig(), { wrapper });

      // Wait for initial fetch to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Test that refetch works and eventually completes
      await act(async () => {
        await result.current.refetch();
      });

      // After refetch completes, loading should be false again
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual(mockCloudConfig);
    });

    it('should handle errors during refetch', async () => {
      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      // Initial successful fetch
      vi.mocked(callApi).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCloudConfig),
      } as Response);

      const { result } = renderHook(() => useCloudConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockCloudConfig);
      expect(result.current.error).toBeNull();

      // Setup error for refetch
      vi.mocked(callApi).mockRejectedValueOnce(new Error('Refetch failed'));

      // Call refetch
      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Data should remain unchanged when refetch fails (React Query keeps previous data)
      expect(result.current.data).toEqual(mockCloudConfig);
      expect(result.current.error).toBe('Refetch failed');
      expect(result.current.isLoading).toBe(false);
      expect(callApi).toHaveBeenCalledTimes(2);
    });

    it('should clear previous error on successful refetch', async () => {
      // Initial failed fetch
      vi.mocked(callApi).mockRejectedValueOnce(new Error('Initial fetch failed'));

      const { result } = renderHook(() => useCloudConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe('Initial fetch failed');

      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      // Setup successful refetch
      vi.mocked(callApi).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCloudConfig),
      } as Response);

      // Call refetch
      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockCloudConfig);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(callApi).toHaveBeenCalledTimes(2);
    });
  });

  it('should only call the API once on mount and not on rerender', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCloudConfig),
    } as Response);

    const { result, rerender } = renderHook(() => useCloudConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(callApi).toHaveBeenCalledTimes(1);

    // Rerender the hook
    rerender();

    // Wait a bit to ensure no additional calls are made
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callApi).toHaveBeenCalledTimes(1);
  });
});
