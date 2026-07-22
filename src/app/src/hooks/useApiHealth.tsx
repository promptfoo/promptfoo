import { useEffect } from 'react';

import { callApi, getApiBaseUrl } from '@app/utils/api';
import { create } from 'zustand';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked' | 'disabled';

export interface ApiHealthResult {
  status: ApiHealthStatus;
  message: string;
}

export interface ApiHealthQueryResult {
  data: ApiHealthResult;
  isLoading: boolean;
  refetch: () => Promise<ApiHealthResult>;
}

let pendingRequest:
  | { apiBaseUrl: string; promise: Promise<ApiHealthResult>; requestId: number }
  | undefined;
let subscriberCount = 0;
let pollingInterval: ReturnType<typeof setInterval> | undefined;
let latestRequestId = 0;
let lastUpdatedAt = 0;

function refreshHealth(background = false): Promise<ApiHealthResult> {
  const apiBaseUrl = getApiBaseUrl();

  if (pendingRequest?.apiBaseUrl === apiBaseUrl) {
    return pendingRequest.promise;
  }

  const requestId = ++latestRequestId;

  if (!background) {
    useApiHealthStore.setState({ isLoading: true });
  }

  const promise = callApi('/remote-health', { cache: 'no-store' })
    .then((response) => response.json())
    .then(
      ({ status, message }: { status: string; message: string }): ApiHealthResult => ({
        status: status === 'DISABLED' ? 'disabled' : status === 'OK' ? 'connected' : 'blocked',
        message,
      }),
    )
    .catch(
      (): ApiHealthResult => ({
        status: 'blocked',
        message: 'Network error: Unable to check API health',
      }),
    )
    .then((data) => {
      if (requestId === latestRequestId) {
        lastUpdatedAt = Date.now();
        useApiHealthStore.setState({ data });
      }
      return data;
    })
    .finally(() => {
      if (pendingRequest?.requestId === requestId) {
        pendingRequest = undefined;
        useApiHealthStore.setState({ isLoading: false });
      }
    });

  pendingRequest = { apiBaseUrl, promise, requestId };
  return promise;
}

function refreshVisiblePage(): void {
  if (document.visibilityState !== 'hidden') {
    void refreshHealth(true);
  }
}

export const useApiHealthStore = create<ApiHealthQueryResult>(() => ({
  data: { status: 'unknown', message: '' },
  isLoading: false,
  refetch: () => refreshHealth(),
}));

export function useApiHealth(): ApiHealthQueryResult {
  const { data, isLoading, refetch } = useApiHealthStore();

  useEffect(() => {
    subscriberCount++;

    if (subscriberCount === 1) {
      if (
        useApiHealthStore.getState().data.status !== 'unknown' &&
        Date.now() - lastUpdatedAt >= 2000
      ) {
        refreshVisiblePage();
      }

      pollingInterval = setInterval(refreshVisiblePage, 3000);
      document.addEventListener('visibilitychange', refreshVisiblePage);
      window.addEventListener('focus', refreshVisiblePage);
      window.addEventListener('online', refreshVisiblePage);
    }

    return () => {
      subscriberCount--;

      if (subscriberCount === 0) {
        clearInterval(pollingInterval);
        pollingInterval = undefined;
        document.removeEventListener('visibilitychange', refreshVisiblePage);
        window.removeEventListener('focus', refreshVisiblePage);
        window.removeEventListener('online', refreshVisiblePage);
      }
    };
  }, []);

  return { data, isLoading, refetch };
}
