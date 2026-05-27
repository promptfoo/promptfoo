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

const mockCloudConfig = {
  isEnabled: true,
  appUrl: 'https://app.promptfoo.app',
  isEnterprise: false,
};

describe('useCloudConfig', () => {
  beforeEach(() => {
    resetCallApiMock();
  });

  it('should initialize with isLoading=true, data=null, and error=null', () => {
    mockCallApiResponse(mockCloudConfig);

    const { result } = renderHook(() => useCloudConfig());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should set data and isLoading=false on successful API call', async () => {
    mockCallApiResponse(mockCloudConfig);

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
    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
  });

  it('should preserve the Cloud URL when cloud is not configured', async () => {
    mockCallApiResponse({
      isEnabled: false,
      appUrl: 'https://app.promptfoo.app',
      isEnterprise: false,
    });

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({
      appUrl: 'https://app.promptfoo.app',
      isEnabled: false,
      isEnterprise: false,
    });
  });

  it('should detect enterprise deployment', async () => {
    mockCallApiResponse({
      isEnabled: true,
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
      isEnabled: true,
      appUrl: 'https://app.promptfoo.app',
    });

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.isEnterprise).toBe(false);
  });

  it('should reject unsafe cloud URLs returned by an alternate API server', async () => {
    mockCallApiResponse({
      isEnabled: true,
      appUrl: 'javascript:alert(document.domain)',
      isEnterprise: false,
    });

    const { result } = renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Invalid cloud config response');
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
    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
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
    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
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
    mockCallApiResponse(mockCloudConfig);

    renderHook(() => useCloudConfig());

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(1);
    });

    expect(callApi).toHaveBeenCalledWith('/user/cloud-config');
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      const updatedConfig = {
        isEnabled: false,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      };

      mockCallApiResponseOnce(mockCloudConfig);

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.isEnabled).toBe(true);
      expect(callApi).toHaveBeenCalledTimes(1);

      mockCallApiResponseOnce(updatedConfig);

      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data?.isEnabled).toBe(false);
      });

      expect(result.current.error).toBeNull();
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(callApi).toHaveBeenNthCalledWith(2, '/user/cloud-config');
    });

    it('should set isLoading=true during refetch and back to false after completion', async () => {
      let resolveFetch!: (response: Response) => void;
      const delayedPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });

      mockCallApiResponseOnce(mockCloudConfig);

      const { result } = renderHook(() => useCloudConfig());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      getCallApiMock().mockImplementationOnce(() => delayedPromise);

      act(() => {
        result.current.refetch();
      });

      expect(result.current.isLoading).toBe(true);

      resolveFetch(createMockResponse(mockCloudConfig));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle errors during refetch', async () => {
      mockCallApiResponseOnce(mockCloudConfig);

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

      mockCallApiResponseOnce(mockCloudConfig);

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
    mockCallApiResponseOnce(mockCloudConfig);

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
