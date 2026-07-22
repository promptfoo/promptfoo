import { useEffect } from 'react';

import { callApi } from '@app/utils/api';
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

let pendingRequest: Promise<ApiHealthResult> | undefined;
let subscriberCount = 0;
let pollingInterval: ReturnType<typeof setInterval> | undefined;

export const useApiHealthStore = create<ApiHealthQueryResult>((set) => ({
  data: { status: 'unknown', message: '' },
  isLoading: false,
  refetch: () => {
    if (pendingRequest !== undefined) {
      return pendingRequest;
    }

    set({ isLoading: true });
    pendingRequest = callApi('/remote-health', { cache: 'no-store' })
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
        set({ data });
        return data;
      })
      .finally(() => {
        pendingRequest = undefined;
        set({ isLoading: false });
      });

    return pendingRequest;
  },
}));

export function useApiHealth(): ApiHealthQueryResult {
  const { data, isLoading, refetch } = useApiHealthStore();

  useEffect(() => {
    subscriberCount++;

    if (subscriberCount === 1) {
      pollingInterval = setInterval(() => {
        void refetch();
      }, 3000);
    }

    return () => {
      subscriberCount--;

      if (subscriberCount === 0) {
        clearInterval(pollingInterval);
        pollingInterval = undefined;
      }
    };
  }, [refetch]);

  return { data, isLoading, refetch };
}
