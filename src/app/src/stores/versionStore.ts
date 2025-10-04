import { callApi } from '@app/utils/api';
import { create } from 'zustand';

interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  selfHosted?: boolean;
  isNpx?: boolean;
  updateCommands?: {
    primary: string;
    alternative: string | null;
  };
  commandType?: 'docker' | 'npx' | 'npm';
}

interface VersionState {
  versionInfo: VersionInfo | null;
  loading: boolean;
  error: Error | null;
  dismissed: boolean;
  fetchVersion: () => Promise<void>;
  dismiss: () => void;
  _fetchPromise: Promise<void> | null;
  _fetched: boolean;
}

const STORAGE_KEY = 'promptfoo:update:dismissedVersion';

export const useVersionStore = create<VersionState>((set, getState) => ({
  versionInfo: null,
  loading: true,
  error: null,
  dismissed: false,
  _fetchPromise: null,
  _fetched: false,
  fetchVersion: async () => {
    const state = getState();

    // If already fetched, don't fetch again
    if (state._fetched) {
      set({ loading: false });
      return;
    }

    // If a fetch is already in progress, wait for it
    const existingPromise = state._fetchPromise;
    if (existingPromise) {
      return existingPromise;
    }

    const fetchPromise = (async () => {
      try {
        set({ loading: true, error: null });
        const response = await callApi('/version');
        if (!response.ok) {
          throw new Error('Failed to fetch version information');
        }
        const data: VersionInfo = await response.json();

        // Check if this version update was already dismissed
        const dismissedVersion = localStorage.getItem(STORAGE_KEY);
        const isDismissed = dismissedVersion === data.latestVersion;

        set({
          versionInfo: data,
          loading: false,
          dismissed: isDismissed,
          _fetchPromise: null,
          _fetched: true,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        // Note: We intentionally do NOT set _fetched to true on error,
        // so that failed requests can be retried on next component mount.
        set({ error, loading: false, _fetchPromise: null });
      }
    })();

    set({ _fetchPromise: fetchPromise });
    return fetchPromise;
  },
  dismiss: () => {
    const versionInfo = getState().versionInfo;
    if (versionInfo?.latestVersion) {
      localStorage.setItem(STORAGE_KEY, versionInfo.latestVersion);
      set({ dismissed: true });
    }
  },
}));
