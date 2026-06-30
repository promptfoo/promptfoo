import { ApiRoutes, callApiJson, UserSchemas } from '@app/utils/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useCloudConfig from './useCloudConfig';

vi.mock('@app/utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/utils/api')>()),
  callApiJson: vi.fn(),
}));

describe('useCloudConfig', () => {
  const mockCallApiJson = vi.mocked(callApiJson);
  const expectCloudConfigCall = () => {
    expect(mockCallApiJson).toHaveBeenCalledWith(
      ApiRoutes.User.CloudConfig,
      UserSchemas.CloudConfig.Response,
    );
  };

  beforeEach(() => {
    mockCallApiJson.mockReset();
    // Note: Do NOT use vi.useFakeTimers() here - it breaks waitFor
    // Only use fake timers in specific tests that need timer control
  });

  it('should initialize with isLoading=true, data=null, and error=null', () => {
    mockCallApiJson.mockResolvedValue({ appUrl: 'https://app.promptfoo.com', isEnabled: true });

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

    mockCallApiJson.mockResolvedValue(mockCloudConfig);

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockCloudConfig);
    expect(result.current.error).toBeNull();
    expect(mockCallApiJson).toHaveBeenCalledTimes(1);
    expectCloudConfigCall();
  });

  it('should set error and isLoading=false when API returns ok=false', async () => {
    mockCallApiJson.mockRejectedValue(new Error('Failed to fetch cloud config'));

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Failed to fetch cloud config');
    expect(mockCallApiJson).toHaveBeenCalledTimes(1);
    expectCloudConfigCall();
  });

  it('should handle network errors gracefully', async () => {
    const networkError = new Error('Network error');
    mockCallApiJson.mockRejectedValue(networkError);

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(mockCallApiJson).toHaveBeenCalledTimes(1);
    expectCloudConfigCall();
  });

  it('should handle non-Error exceptions', async () => {
    mockCallApiJson.mockRejectedValue('String error');

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Unknown error');
    expect(mockCallApiJson).toHaveBeenCalledTimes(1);
  });

  it('should fetch cloud config on mount', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: false,
    };

    mockCallApiJson.mockResolvedValue(mockCloudConfig);

    renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(mockCallApiJson).toHaveBeenCalledTimes(1);
    });

    expectCloudConfigCall();
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

      mockCallApiJson.mockResolvedValueOnce(initialConfig);

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(initialConfig);
      expect(mockCallApiJson).toHaveBeenCalledTimes(1);

      // Setup mock for refetch
      mockCallApiJson.mockResolvedValueOnce(updatedConfig);

      // Call refetch
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(updatedConfig);
      });

      expect(result.current.error).toBeNull();
      expect(mockCallApiJson).toHaveBeenCalledTimes(2);
      expectCloudConfigCall();
    });

    it('should set isLoading=true during refetch and back to false after completion', async () => {
      const mockCloudConfig = {
        appUrl: 'https://app.promptfoo.com',
        isEnabled: true,
      };

      let resolveFetch!: (response: typeof mockCloudConfig) => void;
      const delayedPromise = new Promise<typeof mockCloudConfig>((resolve) => {
        resolveFetch = resolve;
      });

      // First call resolves immediately
      mockCallApiJson.mockResolvedValueOnce(mockCloudConfig);

      const { result } = renderHook(() => useCloudConfig());

      // Wait for initial fetch to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Second call will be delayed so we can check loading state
      mockCallApiJson.mockImplementationOnce(() => delayedPromise);

      // Start refetch
      act(() => {
        result.current.refetch();
      });

      // Check that loading is true
      expect(result.current.isLoading).toBe(true);

      // Resolve the delayed promise
      resolveFetch(mockCloudConfig);

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
      mockCallApiJson.mockResolvedValueOnce(mockCloudConfig);

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockCloudConfig);
      expect(result.current.error).toBeNull();

      // Setup error for refetch
      mockCallApiJson.mockRejectedValueOnce(new Error('Refetch failed'));

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
      expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    });

    it('should clear previous error on successful refetch', async () => {
      // Initial failed fetch
      mockCallApiJson.mockRejectedValueOnce(new Error('Initial fetch failed'));

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
      mockCallApiJson.mockResolvedValueOnce(mockCloudConfig);

      // Call refetch
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockCloudConfig);
      expect(result.current.error).toBeNull();
      expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    });
  });

  it('should only call the API once on mount and not on rerender', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    mockCallApiJson.mockResolvedValueOnce(mockCloudConfig);

    const { result, rerender } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(1);

    // Rerender the hook
    rerender();

    // Wait a short time to ensure no additional calls are made
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockCallApiJson).toHaveBeenCalledTimes(1);
  });
});
