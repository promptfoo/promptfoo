import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RedteamJobState {
  jobId: string | null;
  _hasHydrated: boolean;
  setJob: (jobId: string) => void;
  clearJob: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useRedteamJobStore = create<RedteamJobState>()(
  persist(
    (set) => ({
      jobId: null,
      _hasHydrated: false,
      setJob: (jobId: string) => set({ jobId }),
      clearJob: () => set({ jobId: null }),
      setHasHydrated: (hasHydrated: boolean) => set({ _hasHydrated: hasHydrated }),
    }),
    {
      name: 'promptfoo-redteam-job',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
