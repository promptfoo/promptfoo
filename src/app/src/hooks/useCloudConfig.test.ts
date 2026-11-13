import { createElement, type ReactNode } from 'react';

import {
  mockCallApiResponse,
  mockCallApiResponseOnce,
  rejectCallApi,
  resetCallApiMock,
} from '@app/tests/apiMocks';
import { callApi } from '@app/utils/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useCloudConfig from './useCloudConfig';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  getApiBaseUrl: () => '',
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useCloudConfig', () => {
  let client: QueryClient;
  const mount = () =>
    renderHook(() => useCloudConfig(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client, children }),
    });
  afterEach(() => client.clear());
  beforeEach(() => {
    client = new QueryClient();
    resetCallApiMock();
    // Note: Do NOT use vi.useFakeTimers() here - it breaks waitFor
    // Only use fake timers in specific tests that need timer control
  });

  it('should initialize with isLoading=true, data=null, and error=null', () => {
    mockCallApiResponse({ appUrl: 'https://app.promptfoo.com', isEnabled: true });

    const { result } = mount();

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should set data and isLoading=false on successful API call', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    mockCallApiResponse(mockCloudConfig);

    const { result } = mount();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockCloudConfig);
    expect(result.current.error).toBeNull();
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(
      '/user/cloud-config',
      { signal: expect.any(AbortSignal) },
      '',
    );
  });

  it('should set error and isLoading=false when API returns ok=false', async () => {
    mockCallApiResponse({}, { ok: false });

    const { result } = mount();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Failed to fetch cloud config');
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(
      '/user/cloud-config',
      { signal: expect.any(AbortSignal) },
      '',
    );
  });

  it('should handle network errors gracefully', async () => {
    const networkError = new Error('Network error');
    rejectCallApi(networkError);

    const { result } = mount();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(
      '/user/cloud-config',
      { signal: expect.any(AbortSignal) },
      '',
    );
  });

  it.each(['String error', null, undefined, 0, false])(
    'should handle non-Error exception %j',
    async (error) => {
      rejectCallApi(error);

      const { result } = mount();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe('Unknown error');
      expect(callApi).toHaveBeenCalledTimes(1);
    },
  );

  it('should fetch cloud config on mount', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: false,
    };

    mockCallApiResponse(mockCloudConfig);

    mount();

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(1);
    });

    expect(callApi).toHaveBeenCalledWith(
      '/user/cloud-config',
      { signal: expect.any(AbortSignal) },
      '',
    );
  });

  it('should only call the API once on mount and not on rerender', async () => {
    const mockCloudConfig = {
      appUrl: 'https://app.promptfoo.com',
      isEnabled: true,
    };

    mockCallApiResponseOnce(mockCloudConfig);

    const { result, rerender } = mount();

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
