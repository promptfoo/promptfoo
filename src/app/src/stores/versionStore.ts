import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface VersionStore {
  hasShownUpdateNotification: boolean;
  lastChecked: number | null;
  latestVersion: string | null;
  currentVersion: string | null;
  markUpdateAsShown: () => void;
  setVersionInfo: (latest: string, current: string) => void;
  resetNotificationState: () => void;
}

export const useVersionStore = create<VersionStore>()(
  persist(
    (set) => ({
      hasShownUpdateNotification: false,
      lastChecked: null,
      latestVersion: null,
      currentVersion: null,
      markUpdateAsShown: () => set({ hasShownUpdateNotification: true }),
      setVersionInfo: (latest, current) =>
        set({
          latestVersion: latest,
          currentVersion: current,
          lastChecked: Date.now(),
        }),
      resetNotificationState: () =>
        set({
          hasShownUpdateNotification: false,
          lastChecked: null,
          latestVersion: null,
          currentVersion: null,
        }),
    }),
    {
      name: 'version-store',
    },
  ),
);
