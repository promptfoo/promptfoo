import { create } from 'zustand';

interface RedTeamTargetConfigValidationState {
  targetConfigError: string | null;
  targetConfigDraft: string | null;
  setTargetConfigError: (error: string | null) => void;
  setTargetConfigDraft: (draft: string | null) => void;
  clearTargetConfigValidation: () => void;
}

export const useRedTeamTargetConfigValidation = create<RedTeamTargetConfigValidationState>()(
  (set) => ({
    targetConfigError: null,
    targetConfigDraft: null,
    setTargetConfigError: (targetConfigError) => set({ targetConfigError }),
    setTargetConfigDraft: (targetConfigDraft) => set({ targetConfigDraft }),
    clearTargetConfigValidation: () => set({ targetConfigError: null, targetConfigDraft: null }),
  }),
);
