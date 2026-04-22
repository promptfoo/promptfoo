import {
  createMockResponse,
  getCallApiMock,
  mockCallApiResponse,
  mockCallApiResponseOnce,
  rejectCallApi,
  rejectCallApiOnce,
  resetCallApiMock,
} from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useCloudConfig from './useCloudConfig';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

const mockCloudStatus = {
  isAuthenticated: true,
  hasApiKey: true,
  appUrl: 'https://app.promptfoo.app',
  isEnterprise: false,
};

describe('useCloudConfig', () => {
  beforeEach(() => {
    resetCallApiMock();
  });

  it('should initialize with isLoading=true, data=null, and error=null', () => {
    mockCallApiResponse(mockCloudStatus);

    const { result } = renderHook(() => useCloudConfig());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should set data and isLoading=false on successful API call', async () => {
    mockCallApiResponse(mockCloudStatus);

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({
      appUrl: 'https://app.promptfoo.app',
      isEnabled: true,
      isEnterprise: false,
    });
    expect(result.current.error).toBeNull();
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/user/cloud/status');
  });

  it('should map unauthenticated status to isEnabled=false', async () => {
    mockCallApiResponse({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isEnterprise: false,
    });

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({
      appUrl: null,
      isEnabled: false,
      isEnterprise: false,
    });
  });

  it('should detect enterprise deployment', async () => {
    mockCallApiResponse({
      isAuthenticated: true,
      hasApiKey: true,
      appUrl: 'https://enterprise.company.com',
      isEnterprise: true,
    });

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.isEnterprise).toBe(true);
    expect(result.current.data?.appUrl).toBe('https://enterprise.company.com');
  });

  it('should default isEnterprise to false for older responses', async () => {
    mockCallApiResponse({
      isAuthenticated: true,
      hasApiKey: true,
      appUrl: 'https://app.promptfoo.app',
    });

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.isEnterprise).toBe(false);
  });

  it('should set error and isLoading=false when API returns ok=false', async () => {
    mockCallApiResponse({}, { ok: false });

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Failed to fetch cloud config');
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/user/cloud/status');
  });

  it('should handle network errors gracefully', async () => {
    rejectCallApi(new Error('Network error'));

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/user/cloud/status');
  });

  it('should handle non-Error exceptions', async () => {
    rejectCallApi('String error');

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Unknown error');
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('should fetch cloud config on mount', async () => {
    mockCallApiResponse(mockCloudStatus);

    renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(1);
    });

    expect(callApi).toHaveBeenCalledWith('/user/cloud/status');
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      const updatedStatus = {
        isAuthenticated: false,
        hasApiKey: false,
        appUrl: null,
        isEnterprise: false,
      };

      mockCallApiResponseOnce(mockCloudStatus);

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.isEnabled).toBe(true);
      expect(callApi).toHaveBeenCalledTimes(1);

      mockCallApiResponseOnce(updatedStatus);

      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data?.isEnabled).toBe(false);
      });

      expect(result.current.error).toBeNull();
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(callApi).toHaveBeenNthCalledWith(2, '/user/cloud/status');
    });

    it('should set isLoading=true during refetch and back to false after completion', async () => {
      let resolveFetch!: (response: Response) => void;
      const delayedPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });

      mockCallApiResponseOnce(mockCloudStatus);

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      getCallApiMock().mockImplementationOnce(() => delayedPromise);

      act(() => {
        result.current.refetch();
      });

      expect(result.current.isLoading).toBe(true);

      resolveFetch(createMockResponse(mockCloudStatus));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle errors during refetch', async () => {
      mockCallApiResponseOnce(mockCloudStatus);

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.isEnabled).toBe(true);
      expect(result.current.error).toBeNull();

      rejectCallApiOnce(new Error('Refetch failed'));

      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.isEnabled).toBe(true);
      expect(result.current.error).toBe('Refetch failed');
      expect(callApi).toHaveBeenCalledTimes(2);
    });

    it('should clear previous error on successful refetch', async () => {
      rejectCallApiOnce(new Error('Initial fetch failed'));

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe('Initial fetch failed');

      mockCallApiResponseOnce(mockCloudStatus);

      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.isEnabled).toBe(true);
      expect(result.current.error).toBeNull();
      expect(callApi).toHaveBeenCalledTimes(2);
    });
  });

  it('should only call the API once on mount and not on rerender', async () => {
    mockCallApiResponseOnce(mockCloudStatus);

    const { result, rerender } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(callApi).toHaveBeenCalledTimes(1);

    rerender();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callApi).toHaveBeenCalledTimes(1);
  });
});
