import type { ReactNode } from 'react';

import useApiConfig from '@app/stores/apiConfig';
import { useUserStore } from '@app/stores/userStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useCloudConfig from './useCloudConfig';

const enabled = { appUrl: 'https://cloud-a.example', isEnabled: true };
const disabled = { appUrl: 'https://cloud-b.example', isEnabled: false };
const initialUser = useUserStore.getState();

function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function response(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}

describe('shared cloud configuration', () => {
  let client: QueryClient;
  let requests: Array<ReturnType<typeof deferred> & { url: string; signal?: AbortSignal | null }>;
  let logoutFails: boolean;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const mount = () => renderHook(() => useCloudConfig(), { wrapper });

  beforeEach(() => {
    client = new QueryClient();
    requests = [];
    logoutFails = false;
    useApiConfig.setState({ apiBaseUrl: 'https://api-a.example/' });
    useUserStore.setState(initialUser, true);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, options) => {
      const url = String(input);
      if (url.endsWith('/user/logout')) {
        return logoutFails
          ? Promise.reject(new Error('logout unavailable'))
          : Promise.resolve(response({}));
      }
      const request = { ...deferred(), url, signal: options?.signal };
      requests.push(request);
      return request.promise;
    });
  });

  afterEach(() => {
    cleanup();
    client.clear();
    vi.restoreAllMocks();
    useApiConfig.setState({ apiBaseUrl: '' });
    useUserStore.setState(initialUser, true);
  });

  it('shares one pending request among ten consumers', async () => {
    const views = Array.from({ length: 10 }, mount);
    expect(requests).toHaveLength(1);
    await act(async () => {
      requests[0].resolve(response(enabled));
    });
    await waitFor(() => views.forEach((view) => expect(view.result.current.data).toEqual(enabled)));
  });

  it('keeps loading until the replacement endpoint request finishes', async () => {
    const view = mount();
    act(() => {
      useApiConfig.getState().setApiBaseUrl('https://api-b.example');
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => {
      requests[0].resolve(response(enabled));
    });
    expect(view.result.current.isLoading).toBe(true);
    expect(view.result.current.data).toBeNull();
    await act(async () => {
      requests[1].resolve(response(disabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(disabled));
  });

  it('refreshes shared data when a later consumer mounts', async () => {
    const first = mount();
    await act(async () => requests[0].resolve(response(enabled)));
    await waitFor(() => expect(first.result.current.data).toEqual(enabled));
    const second = mount();
    await waitFor(() => expect(requests).toHaveLength(2));
    // Query observers deliver subscription updates asynchronously.
    await waitFor(() => expect(first.result.current.isLoading).toBe(true));
    expect(first.result.current.data).toEqual(enabled);
    expect(requests[1].url).toBe('https://api-a.example/api/user/cloud-config');
    expect(requests[1].signal).toBeInstanceOf(AbortSignal);
    await act(async () => requests[1].resolve(response(disabled)));
    await waitFor(() => {
      for (const view of [first, second]) {
        expect(view.result.current).toMatchObject({
          data: disabled,
          isLoading: false,
          error: null,
        });
      }
    });
  });

  it('retains cached data when a later consumer refresh fails', async () => {
    const first = mount();
    await act(async () => requests[0].resolve(response(enabled)));
    await waitFor(() => expect(first.result.current.data).toEqual(enabled));
    const second = mount();
    await waitFor(() => expect(requests).toHaveLength(2));
    await waitFor(() => expect(first.result.current.isLoading).toBe(true));
    await act(async () => requests[1].reject(new Error('Refetch failed')));
    // Data should remain unchanged when refetch fails
    await waitFor(() => {
      for (const view of [first, second]) {
        expect(view.result.current).toMatchObject({
          data: enabled,
          isLoading: false,
          error: 'Refetch failed',
        });
      }
    });
  });

  it('cancels a shared request only after its last consumer unmounts', () => {
    const first = mount();
    const second = mount();
    expect(requests).toHaveLength(1);
    first.unmount();
    expect(requests[0].signal?.aborted).toBe(false);
    second.unmount();
    expect(requests[0].signal?.aborted).toBe(true);
  });

  it('captures the endpoint and clears old data when the endpoint changes', async () => {
    const view = mount();
    await act(async () => {
      requests[0].resolve(response(enabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(enabled));
    act(() => useApiConfig.getState().setApiBaseUrl('https://api-b.example/proxy/'));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].url).toBe('https://api-b.example/proxy/api/user/cloud-config');
    expect(view.result.current.data).toBeNull();
    await act(async () => {
      requests[1].resolve(response(disabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(disabled));
  });

  it('ignores the old endpoint response after an endpoint switch', async () => {
    const view = mount();
    act(() => useApiConfig.getState().setApiBaseUrl('https://api-b.example'));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].signal?.aborted).toBe(true);
    await act(async () => {
      requests[1].resolve(response(disabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(disabled));
    await act(async () => {
      requests[0].resolve(response(enabled));
    });
    expect(view.result.current.data).toEqual(disabled);
  });

  it('refreshes even when successful reauthentication keeps the same email', async () => {
    useUserStore.getState().setEmail('same@example.com');
    const view = mount();
    await act(async () => {
      requests[0].resolve(response(enabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(enabled));
    act(() => useUserStore.getState().setEmail('same@example.com'));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(view.result.current.data).toBeNull();
    await act(async () => {
      requests[1].resolve(response(disabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(disabled));
  });

  it.each(['clear', 'logout', 'failed logout'] as const)(
    'isolates an in-flight response across %s',
    async (action) => {
      useUserStore.getState().setEmail('old@example.com');
      const view = mount();
      logoutFails = action === 'failed logout';
      await act(async () => {
        if (action === 'clear') {
          useUserStore.getState().clearUser();
        } else {
          await useUserStore.getState().logout();
        }
      });
      await waitFor(() => expect(requests).toHaveLength(2));
      expect(requests[0].signal?.aborted).toBe(true);
      await act(async () => {
        requests[1].resolve(response(disabled));
      });
      await waitFor(() => expect(view.result.current.data).toEqual(disabled));
      await act(async () => {
        requests[0].resolve(response(enabled));
      });
      expect(view.result.current.data).toEqual(disabled);
    },
  );

  it('cancels the discarded StrictMode request and keeps the live result', async () => {
    const view = renderHook(() => useCloudConfig(), {
      wrapper,
      reactStrictMode: true,
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].signal?.aborted).toBe(true);
    await act(async () => {
      requests[1].resolve(response(disabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(disabled));
    await act(async () => {
      requests[0].resolve(response(enabled));
    });
    expect(view.result.current.data).toEqual(disabled);
  });

  it('clears an earlier error while a replacement request is pending', async () => {
    const view = mount();
    await act(async () => {
      requests[0].reject(new Error('Initial failure'));
    });
    await waitFor(() => expect(view.result.current.error).toBe('Initial failure'));
    act(() => {
      mount();
    });
    await waitFor(() => expect(view.result.current.isLoading).toBe(true));
    expect(view.result.current.error).toBeNull();
    await act(async () => {
      requests[1].resolve(response(enabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(enabled));
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.isLoading).toBe(false);
  });

  it('fetches fresh configuration on an A-to-B-to-A endpoint round trip', async () => {
    const view = mount();
    await act(async () => {
      requests[0].resolve(response(enabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(enabled));
    act(() => useApiConfig.getState().setApiBaseUrl('https://api-b.example'));
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => {
      requests[1].resolve(response(disabled));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(disabled));
    act(() => useApiConfig.getState().setApiBaseUrl('https://api-a.example/'));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(view.result.current.data).toBeNull();
    expect(requests[2].url).toBe('https://api-a.example/api/user/cloud-config');
    const refreshed = { ...enabled, appUrl: 'https://cloud-refreshed.example' };
    await act(async () => {
      requests[2].resolve(response(refreshed));
    });
    await waitFor(() => expect(view.result.current.data).toEqual(refreshed));
  });

  it('fetches again after the last consumer unmounts and remounts', async () => {
    const first = mount();
    await act(async () => {
      requests[0].resolve(response(enabled));
    });
    await waitFor(() => expect(first.result.current.data).toEqual(enabled));
    first.unmount();
    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0));
    const second = mount();
    expect(second.result.current.data).toBeNull();
    expect(requests).toHaveLength(2);
  });
});
