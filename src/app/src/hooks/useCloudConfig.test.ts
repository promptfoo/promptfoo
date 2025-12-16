import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { callApi } from '../utils/api';
import useCloudConfig from './useCloudConfig';

vi.mock('../utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useCloudConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Note: Do NOT use vi.useFakeTimers() here - it breaks waitFor
    // Only use fake timers in specific tests that need timer control
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with isLoading=true, data=null, and error=null', () => {
    (callApi as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ appUrl: 'https://app.promptfoo.com', isEnabled: true }),
    });

    const { result } = renderHook(() => useCloudConfig());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should set data and isLoading=false on successful API call', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    (callApi as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockCloudConfig),
    });

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockCloudConfig);
    expect(result.current.error).toBeNull();
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
  });

  it('should set error and isLoading=false when API returns ok=false', async () => {
    (callApi as Mock).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    });

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Failed to fetch cloud config');
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
  });

  it('should handle network errors gracefully', async () => {
    const networkError = new Error('Network error');
    (callApi as Mock).mockRejectedValue(networkError);

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
  });

  it('should handle non-Error exceptions', async () => {
    (callApi as Mock).mockRejectedValue('String error');

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Unknown error');
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('should fetch cloud config on mount', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: false,
    };

    (callApi as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockCloudConfig),
    });

    renderHook(() => useCloudConfig());

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

      (callApi as Mock).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(initialConfig),
      });

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(initialConfig);
      expect(callApi).toHaveBeenCalledTimes(1);

      // Setup mock for refetch
      (callApi as Mock).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(updatedConfig),
      });

      // Call refetch
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(updatedConfig);
      });

      expect(result.current.error).toBeNull();
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(callApi).toHaveBeenNthCalledWith(2, '/user/cloud-config');
    });

    it('should set isLoading=true during refetch and back to false after completion', async () => {
      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      let resolveFetch: any;
      const delayedPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      // First call resolves immediately
      (callApi as Mock).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      const { result } = renderHook(() => useCloudConfig());

      // Wait for initial fetch to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Second call will be delayed so we can check loading state
      (callApi as Mock).mockImplementationOnce(() => delayedPromise);

      // Start refetch
      act(() => {
        result.current.refetch();
      });

      // Check that loading is true
      expect(result.current.isLoading).toBe(true);

      // Resolve the delayed promise
      resolveFetch({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      // Wait for loading to become false
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle errors during refetch', async () => {
      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      // Initial successful fetch
      (callApi as Mock).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockCloudConfig);
      expect(result.current.error).toBeNull();

      // Setup error for refetch
      (callApi as Mock).mockRejectedValueOnce(new Error('Refetch failed'));

      // Call refetch
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Data should remain unchanged when refetch fails
      expect(result.current.data).toEqual(mockCloudConfig);
      expect(result.current.error).toBe('Refetch failed');
      expect(callApi).toHaveBeenCalledTimes(2);
    });

    it('should clear previous error on successful refetch', async () => {
      // Initial failed fetch
      (callApi as Mock).mockRejectedValueOnce(new Error('Initial fetch failed'));

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe('Initial fetch failed');

      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      // Setup successful refetch
      (callApi as Mock).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCloudConfig),
      });

      // Call refetch
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockCloudConfig);
      expect(result.current.error).toBeNull();
      expect(callApi).toHaveBeenCalledTimes(2);
    });
  });

  it('should only call the API once on mount and not on rerender', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    (callApi as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockCloudConfig),
    });

    const { result, rerender } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(callApi).toHaveBeenCalledTimes(1);

    // Rerender the hook
    rerender();

    // Wait a short time to ensure no additional calls are made
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callApi).toHaveBeenCalledTimes(1);
  });
});
