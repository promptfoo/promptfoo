import { createElement, type ReactNode } from 'react';

import { mockCallApiResponse, rejectCallApi, resetCallApiMock } from '@app/tests/apiMocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useCloudConfig, { useInvalidateCloudConfig } from './useCloudConfig';

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

function makeWrapper() {
  // Fresh client per test so caches don't leak between cases. Retry disabled
  // so failing fetches surface immediately to assertions.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return { client, Wrapper };
}

describe('useCloudConfig', () => {
  beforeEach(() => {
    resetCallApiMock();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the parsed cloud config on success', async () => {
    mockCallApiResponse(mockCloudConfig);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useCloudConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockCloudConfig);
  });

  it('defaults isEnterprise to false when the response omits it', async () => {
    mockCallApiResponse({ isEnabled: true, appUrl: 'https://app.promptfoo.app' });
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useCloudConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.isEnterprise).toBe(false);
  });

  it('throws when the response is not ok', async () => {
    mockCallApiResponse(null, { ok: false, status: 500 });
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useCloudConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to fetch cloud config');
  });

  it('throws when the response body fails schema validation', async () => {
    // Missing `isEnabled` field — CloudConfigResponseSchema requires it.
    mockCallApiResponse({ appUrl: 'https://app.promptfoo.app' });
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useCloudConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Invalid cloud config response');
  });

  it('surfaces network errors', async () => {
    rejectCallApi(new Error('network down'));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useCloudConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('network down');
  });

  it('useInvalidateCloudConfig forces a refetch', async () => {
    const { callApi } = await import('@app/utils/api');
    const mock = vi.mocked(callApi);
    // First fetch returns enabled, second (after invalidate) returns disabled.
    mock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCloudConfig,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockCloudConfig, isEnabled: false }),
      } as Response);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => ({
        query: useCloudConfig(),
        invalidate: useInvalidateCloudConfig(),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.query.data?.isEnabled).toBe(true));
    result.current.invalidate();
    await waitFor(() => expect(result.current.query.data?.isEnabled).toBe(false));
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
