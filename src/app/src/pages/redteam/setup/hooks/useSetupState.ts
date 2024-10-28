import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SetupState {
  hasSeenSetup: boolean;
  markSetupAsSeen: () => void;
}

export const useSetupState = create<SetupState>()(
  persist(
    (set) => ({
      hasSeenSetup: false,
      markSetupAsSeen: () => set({ hasSeenSetup: true }),
    }),
    {
      name: 'setupState',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// Add hydration handling
if (typeof window !== 'undefined') {
  useSetupState.persist.rehydrate();
}
