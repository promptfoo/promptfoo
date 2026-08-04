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

// The old single-port launcher auto-persisted exactly this URL as the API base. It is now
// the dev UI's own origin (see vite.config.ts), so it must not survive as the API target.
const LEGACY_LOCAL_API_BASE_URLS = new Set(['http://localhost:15500', 'http://localhost:15500/']);

function getPersistedApiBaseUrl(persistedState: unknown): string | undefined {
  if (
    typeof persistedState !== 'object' ||
    persistedState === null ||
    Array.isArray(persistedState)
  ) {
    return undefined;
  }

  const apiBaseUrl = (persistedState as { apiBaseUrl?: unknown }).apiBaseUrl;
  // Treat blank strings as unset so a persisted "" never overrides the environment default
  // (the dev API port under `npm run dev`, same-origin under `promptfoo view`).
  return typeof apiBaseUrl === 'string' && apiBaseUrl.trim() !== '' ? apiBaseUrl : undefined;
}

export function mergeApiConfigPersistedState(
  persistedState: unknown,
  currentState: ApiConfig,
): ApiConfig {
  const persistedApiBaseUrl = getPersistedApiBaseUrl(persistedState);

  // Drop a missing/blank value or the exact legacy default and fall back to the environment
  // default without re-persisting, so the dev-only port never leaks into a later
  // `promptfoo view` session. Only the exact `http://localhost:15500` literal is migrated:
  // explicit loopback aliases (127.0.0.1, [::1]) were deliberate user choices and are kept.
  if (persistedApiBaseUrl === undefined || LEGACY_LOCAL_API_BASE_URLS.has(persistedApiBaseUrl)) {
    return currentState;
  }

  return {
    ...currentState,
    apiBaseUrl: persistedApiBaseUrl,
    persistApiBaseUrl: true,
  };
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
