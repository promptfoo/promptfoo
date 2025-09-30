import { callApi } from '@app/utils/api';
import { create } from 'zustand';

type CloudConfigData = {
  appUrl: string;
  isEnabled: boolean;
};

interface CloudConfigState {
  data: CloudConfigData | null;
  isLoading: boolean;
  error: string | null;
  fetchCloudConfig: () => Promise<void>;
  refetch: () => Promise<void>;
  clearConfig: () => void;
  _fetchPromise: Promise<void> | null;
  _fetched: boolean;
}

export const useCloudConfigStore = create<CloudConfigState>((set, getState) => ({
  data: null,
  isLoading: true,
  error: null,
  _fetchPromise: null,
  _fetched: false,
  fetchCloudConfig: async () => {
    const state = getState();

    // If we already fetched, don't fetch again
    if (state._fetched) {
      set({ isLoading: false });
      return;
    }

    // If a fetch is already in progress, wait for it
    const existingPromise = state._fetchPromise;
    if (existingPromise) {
      return existingPromise;
    }

    const fetchPromise = (async () => {
      try {
        set({ isLoading: true, error: null });
        const response = await callApi('/user/cloud-config');
        if (!response.ok) {
          throw new Error('Failed to fetch cloud config');
        }
        const responseData = await response.json();
        set({ data: responseData, isLoading: false, _fetchPromise: null, _fetched: true });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        set({ error: errorMessage, isLoading: false, _fetchPromise: null });
        console.error('Error fetching cloud config:', err);
      }
    })();

    set({ _fetchPromise: fetchPromise });
    return fetchPromise;
  },
  refetch: async () => {
    // Force refetch by clearing data and fetched flag first
    set({ data: null, _fetchPromise: null, _fetched: false });
    await getState().fetchCloudConfig();
  },
  clearConfig: () => {
    // Clear all cloud config state (e.g., on logout)
    set({ data: null, isLoading: true, error: null, _fetchPromise: null, _fetched: false });
  },
}));
