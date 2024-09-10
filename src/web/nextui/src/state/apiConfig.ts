import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ApiConfig {
  apiBaseUrl: string | undefined;
  setApiBaseUrl: (apiBaseUrl: string) => void;
  fetchingPromise: Promise<Response> | null;
  setFetchingPromise: (fetchingPromise: Promise<Response> | null) => void;
}

const useApiConfig = create<ApiConfig>()(
  persist(
    (set) => ({
      apiBaseUrl: process.env.NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL,
      setApiBaseUrl: (apiBaseUrl: string) => set({ apiBaseUrl }),
      fetchingPromise: null,
      setFetchingPromise: (fetchingPromise: Promise<Response> | null) => set({ fetchingPromise }),
    }),
    {
      name: 'api-config-storage',
      partialize: (state) => ({ apiBaseUrl: state.apiBaseUrl }) as Partial<ApiConfig>,
    },
  ),
);

export default useApiConfig;
