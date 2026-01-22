import { create } from 'zustand';

export interface HistoryState {
  /**
   * Timestamp of the last eval completion.
   * Changes to this value signal that history should be refetched.
   */
  lastEvalCompletedAt: number | null;
  /**
   * Signal that a new eval has completed and history should be refreshed.
   */
  signalEvalCompleted: () => void;
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  lastEvalCompletedAt: null,
  signalEvalCompleted: () => set({ lastEvalCompletedAt: Date.now() }),
}));
