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

const LEGACY_LOCAL_API_PORT = '15500';

function isLegacyLocalApiBaseUrl(apiBaseUrl: unknown) {
  if (typeof apiBaseUrl !== 'string') {
    return false;
  }

  try {
    const url = new URL(apiBaseUrl);
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname) &&
      url.port === LEGACY_LOCAL_API_PORT &&
      ['', '/'].includes(url.pathname)
    );
  } catch {
    return false;
  }
}

export function mergeApiConfigPersistedState(
  persistedState: unknown,
  currentState: ApiConfig,
): ApiConfig {
  const persistedConfig = persistedState as Partial<ApiConfig> | undefined;
  const currentApiBaseUrl = currentState.apiBaseUrl;

  if (
    currentApiBaseUrl &&
    currentApiBaseUrl !== persistedConfig?.apiBaseUrl &&
    isLegacyLocalApiBaseUrl(persistedConfig?.apiBaseUrl)
  ) {
    return { ...currentState, ...persistedConfig, apiBaseUrl: currentApiBaseUrl };
  }

  return { ...currentState, ...persistedConfig };
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
      merge: mergeApiConfigPersistedState,
      partialize: (state) => {
        return state.persistApiBaseUrl ? { apiBaseUrl: state.apiBaseUrl } : {};
      },
    },
  ),
);

export default useApiConfig;
