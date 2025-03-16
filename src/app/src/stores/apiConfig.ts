import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ApiConfig {
  apiBaseUrl: string | undefined;
  setApiBaseUrl: (apiBaseUrl: string) => void;
  fetchingPromise: Promise<Response> | null;
  setFetchingPromise: (fetchingPromise: Promise<Response> | null) => void;
  persistApiBaseUrl: boolean;
  enablePersistApiBaseUrl: () => void;
}

const useApiConfig = create<ApiConfig>()(
  persist(
    (set) => ({
      apiBaseUrl: import.meta.env.VITE_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL || '',
      setApiBaseUrl: (apiBaseUrl: string) => set({ apiBaseUrl }),
      persistApiBaseUrl: false,
      enablePersistApiBaseUrl: () => set({ persistApiBaseUrl: true }),
      fetchingPromise: null,
      setFetchingPromise: (fetchingPromise: Promise<Response> | null) => set({ fetchingPromise }),
    }),
    {
      name: 'api-config-storage',
      partialize: (state) => {
        return state.persistApiBaseUrl ? { apiBaseUrl: state.apiBaseUrl } : {};
      },
    },
  ),
);

export default useApiConfig;
