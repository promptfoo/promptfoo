import React from 'react';

import {
  createMockResponse,
  getCallApiMock,
  mockCallApiResponse,
  rejectCallApi,
  resetCallApiMock,
} from '@app/tests/apiMocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiHealth } from './useApiHealth';

// Mock the API call
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useApiHealth', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetCallApiMock();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          refetchInterval: false, // Disable auto-refetch for tests
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('initializes with unknown status', () => {
    const { result } = renderHook(() => useApiHealth(), { wrapper });
    expect(result.current.data.status).toBe('unknown');
    expect(result.current.data.message).toBe('');
    expect(result.current.isLoading).toBe(false);
  });

  it('handles successful health check', async () => {
    mockCallApiResponse({ status: 'OK', message: 'Cloud API is healthy' });

    const { result } = renderHook(() => useApiHealth(), { wrapper });

    // Trigger a refetch since initialData prevents automatic fetching
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.status).toBe('connected');
    });

    expect(result.current.data.message).toBe('Cloud API is healthy');
    expect(result.current.isLoading).toBe(false);
  });

  it('handles failed health check', async () => {
    mockCallApiResponse({ status: 'ERROR', message: 'API is not accessible' });

    const { result } = renderHook(() => useApiHealth(), { wrapper });

    // Trigger a refetch since initialData prevents automatic fetching
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.status).toBe('blocked');
    });

    expect(result.current.data.message).toBe('API is not accessible');
    expect(result.current.isLoading).toBe(false);
  });

  it('handles network errors', async () => {
    rejectCallApi(new Error('Network error'));

    const { result } = renderHook(() => useApiHealth(), { wrapper });

    // Trigger a refetch since initialData prevents automatic fetching
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.status).toBe('blocked');
    });

    expect(result.current.data.message).toBe('Network error: Unable to check API health');
    expect(result.current.isLoading).toBe(false);
  });

  it('handles disabled status from API', async () => {
    mockCallApiResponse({ status: 'DISABLED', message: 'Remote generation is disabled' });

    const { result } = renderHook(() => useApiHealth(), { wrapper });

    // Trigger a refetch since initialData prevents automatic fetching
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.status).toBe('disabled');
    });

    expect(result.current.data.message).toBe('Remote generation is disabled');
    expect(result.current.isLoading).toBe(false);
  });

  it('maps SKIPPED to skipped in no-network mode (build-time flag)', async () => {
    vi.stubEnv('VITE_PROMPTFOO_NO_NETWORK', 'true');
    mockCallApiResponse({
      status: 'SKIPPED',
      message: 'network egress is disabled (PROMPTFOO_NO_NETWORK)',
    });

    const { result } = renderHook(() => useApiHealth(), { wrapper });

    // Trigger a refetch since initialData prevents automatic fetching
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.status).toBe('skipped');
    });

    expect(result.current.data.message).toBe('network egress is disabled (PROMPTFOO_NO_NETWORK)');
    expect(result.current.isLoading).toBe(false);
  });

  it('maps SKIPPED to skipped in no-network mode (runtime meta tag)', async () => {
    mockCallApiResponse({
      status: 'SKIPPED',
      message: 'network egress is disabled (PROMPTFOO_NO_NETWORK)',
    });

    const marker = document.createElement('meta');
    marker.name = 'promptfoo-no-network';
    document.head.append(marker);
    try {
      const { result } = renderHook(() => useApiHealth(), { wrapper });

      // Trigger a refetch since initialData prevents automatic fetching
      result.current.refetch();

      await waitFor(() => {
        expect(result.current.data.status).toBe('skipped');
      });

      expect(result.current.data.message).toBe('network egress is disabled (PROMPTFOO_NO_NETWORK)');
    } finally {
      marker.remove();
    }
  });

  it('keeps DISABLED as disabled when remote generation is explicitly disabled in no-network mode (build-time flag)', async () => {
    vi.stubEnv('VITE_PROMPTFOO_NO_NETWORK', 'true');
    mockCallApiResponse({
      status: 'DISABLED',
      message: 'remote generation and grading are disabled',
    });

    const { result } = renderHook(() => useApiHealth(), { wrapper });

    // Trigger a refetch since initialData prevents automatic fetching
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.status).toBe('disabled');
    });

    expect(result.current.data.message).toBe('remote generation and grading are disabled');
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps DISABLED as disabled when remote generation is explicitly disabled in no-network mode (runtime meta tag)', async () => {
    mockCallApiResponse({
      status: 'DISABLED',
      message: 'remote generation and grading are disabled',
    });

    const marker = document.createElement('meta');
    marker.name = 'promptfoo-no-network';
    document.head.append(marker);
    try {
      const { result } = renderHook(() => useApiHealth(), { wrapper });

      // Trigger a refetch since initialData prevents automatic fetching
      result.current.refetch();

      await waitFor(() => {
        expect(result.current.data.status).toBe('disabled');
      });

      expect(result.current.data.message).toBe('remote generation and grading are disabled');
    } finally {
      marker.remove();
    }
  });

  it('keeps DISABLED as disabled outside no-network mode', async () => {
    mockCallApiResponse({
      status: 'DISABLED',
      message: 'network egress is disabled (PROMPTFOO_NO_NETWORK)',
    });

    const { result } = renderHook(() => useApiHealth(), { wrapper });

    // Trigger a refetch since initialData prevents automatic fetching
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.status).toBe('disabled');
    });
  });

  it('updates status when API response changes', async () => {
    // First call succeeds
    getCallApiMock()
      .mockResolvedValueOnce(createMockResponse({ status: 'OK', message: 'Cloud API is healthy' }))
      .mockResolvedValueOnce(
        createMockResponse({ status: 'ERROR', message: 'API is not accessible' }),
      );

    const { result } = renderHook(() => useApiHealth(), { wrapper });

    // Trigger initial refetch
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.status).toBe('connected');
    });

    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.data.status).toBe('blocked');
    });
  });

  it('reports background fetching while retaining initial data, then updates the result', async () => {
    let resolveResponse!: (value: Response) => void;
    getCallApiMock().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    const { result } = renderHook(() => useApiHealth(), { wrapper });
    expect(result.current.data.status).toBe('unknown');
    expect(result.current.isLoading).toBe(false);

    expect(result.current.isFetching).toBe(false);
    act(() => {
      void result.current.refetch();
    });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.status).toBe('unknown');

    await act(async () => {
      resolveResponse(createMockResponse({ status: 'OK', message: 'healthy' }));
    });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data).toEqual({ status: 'connected', message: 'healthy' });
  });
});
