import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RedteamJobState {
  jobId: string | null;
  startedAt: number | null;
  setJob: (jobId: string) => void;
  clearJob: () => void;
}

export const useRedteamJobStore = create<RedteamJobState>()(
  persist(
    (set) => ({
      jobId: null,
      startedAt: null,
      setJob: (jobId: string) => set({ jobId, startedAt: Date.now() }),
      clearJob: () => set({ jobId: null, startedAt: null }),
    }),
    {
      name: 'promptfoo-redteam-job',
    }
  )
);
