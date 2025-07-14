import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserPreferencesState {
  // User experience level for showing/hiding help content
  experienceMode: 'beginner' | 'experienced';
  setExperienceMode: (mode: 'beginner' | 'experienced') => void;

  // Other preferences can be added here in the future
  showKeyboardShortcuts: boolean;
  setShowKeyboardShortcuts: (show: boolean) => void;
}

export const useUserPreferences = create<UserPreferencesState>()(
  persist(
    (set) => ({
      // Default to beginner mode to show all help content
      experienceMode: 'beginner',
      setExperienceMode: (mode) => set({ experienceMode: mode }),

      showKeyboardShortcuts: false,
      setShowKeyboardShortcuts: (show) => set({ showKeyboardShortcuts: show }),
    }),
    {
      name: 'promptfoo-user-preferences',
    },
  ),
);
