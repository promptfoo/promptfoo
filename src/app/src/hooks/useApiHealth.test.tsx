import {
  createMockResponse,
  getCallApiMock,
  mockCallApiResponse,
  rejectCallApi,
  resetCallApiMock,
} from '@app/tests/apiMocks';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiHealth, useApiHealthStore } from './useApiHealth';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useApiHealth', () => {
  beforeEach(() => {
    resetCallApiMock();
    useApiHealthStore.setState({
      data: { status: 'unknown', message: '' },
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('initializes with unknown status', () => {
    const { result } = renderHook(() => useApiHealth());

    expect(result.current.data).toEqual({ status: 'unknown', message: '' });
    expect(result.current.isLoading).toBe(false);
  });

  it.each([
    ['OK', 'connected'],
    ['ERROR', 'blocked'],
    ['DISABLED', 'disabled'],
  ] as const)('maps %s responses to %s', async (responseStatus, expectedStatus) => {
    mockCallApiResponse({ status: responseStatus, message: 'Health check result' });

    const { result } = renderHook(() => useApiHealth());

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual({
      status: expectedStatus,
      message: 'Health check result',
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('reports network failures without throwing', async () => {
    rejectCallApi(new Error('Network error'));

    const { result } = renderHook(() => useApiHealth());

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual({
      status: 'blocked',
      message: 'Network error: Unable to check API health',
    });
  });

  it('updates the loading state while a request is pending', async () => {
    let resolveRequest!: (response: Response) => void;
    getCallApiMock().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useApiHealth());
    let request!: Promise<unknown>;

    act(() => {
      request = result.current.refetch();
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveRequest(createMockResponse({ status: 'OK', message: 'Connected' }));
      await request;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.status).toBe('connected');
  });

  it('shares an in-flight request across consumers', async () => {
    let resolveRequest!: (response: Response) => void;
    getCallApiMock().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const first = renderHook(() => useApiHealth());
    const second = renderHook(() => useApiHealth());

    await act(async () => {
      const firstRequest = first.result.current.refetch();
      const secondRequest = second.result.current.refetch();

      expect(firstRequest).toBe(secondRequest);
      expect(getCallApiMock()).toHaveBeenCalledTimes(1);

      resolveRequest(createMockResponse({ status: 'OK', message: 'Connected' }));
      await Promise.all([firstRequest, secondRequest]);
    });

    expect(first.result.current.data.status).toBe('connected');
    expect(second.result.current.data.status).toBe('connected');
  });

  it('uses one shared polling interval and stops polling after unmount', async () => {
    vi.useFakeTimers();
    mockCallApiResponse({ status: 'OK', message: 'Connected' });

    const first = renderHook(() => useApiHealth());
    const second = renderHook(() => useApiHealth());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(getCallApiMock()).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(getCallApiMock()).toHaveBeenCalledTimes(1);
  });

  it('updates the status when a later response changes', async () => {
    getCallApiMock()
      .mockResolvedValueOnce(createMockResponse({ status: 'OK', message: 'Connected' }))
      .mockResolvedValueOnce(createMockResponse({ status: 'ERROR', message: 'Unavailable' }));

    const { result } = renderHook(() => useApiHealth());

    await act(async () => {
      await result.current.refetch();
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'blocked', message: 'Unavailable' });
    });
  });
});
