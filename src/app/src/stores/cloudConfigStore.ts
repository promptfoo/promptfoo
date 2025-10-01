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

    // Set loading state
    set({ isLoading: true, error: null });

    // Track if promise was cleared by synchronous error to prevent overwriting
    let isPromiseCleared = false;
    const fetchPromise = (async () => {
      try {
        const response = await callApi('/user/cloud-config');
        if (!response.ok) {
          throw new Error('Failed to fetch cloud config');
        }
        const responseData = await response.json();
        // Validate data structure
        if (
          typeof responseData === 'object' &&
          responseData !== null &&
          typeof responseData.appUrl === 'string' &&
          typeof responseData.isEnabled === 'boolean'
        ) {
          set({ data: responseData, isLoading: false, _fetchPromise: null, _fetched: true });
        } else {
          // Invalid data structure - set error and mark as fetched
          set({
            data: null,
            error: 'Cloud config data is malformed',
            isLoading: false,
            _fetchPromise: null,
            _fetched: true,
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        set({ error: errorMessage, isLoading: false, _fetchPromise: null });
        // Mark as cleared to prevent line 81 from overwriting with stale promise
        isPromiseCleared = true;
        console.error('Error fetching cloud config:', err);
      }
    })();

    // Only set the promise if it wasn't already cleared by a synchronous error.
    // Without this check, a synchronous error from callApi() would set _fetchPromise: null
    // in the catch block, then line 81 would immediately overwrite it with the promise.
    if (!isPromiseCleared) {
      set({ _fetchPromise: fetchPromise });
    }
    return fetchPromise;
  },
  refetch: async () => {
    const state = getState();

    // If there's already a refetch in progress, wait for it
    if (state._fetchPromise && !state._fetched) {
      return state._fetchPromise;
    }

    // Force refetch by clearing data and fetched flag first
    set({ data: null, _fetchPromise: null, _fetched: false });
    await getState().fetchCloudConfig();
  },
  clearConfig: () => {
    // Clear all cloud config state (e.g., on logout)
    set({ data: null, isLoading: true, error: null, _fetchPromise: null, _fetched: false });
  },
}));
