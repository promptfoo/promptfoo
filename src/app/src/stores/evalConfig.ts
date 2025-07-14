import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EvaluateTestSuiteWithEvaluateOptions, UnifiedConfig } from '../../../types';
import { cleanConfig } from '../utils/cleanConfig';

export interface EvalConfigState {
  config: Partial<UnifiedConfig>;
  /** Replace the entire config */
  setConfig: (config: Partial<UnifiedConfig>) => void;
  /** Merge updates into the existing config */
  updateConfig: (updates: Partial<UnifiedConfig>) => void;
  /** Reset config to defaults */
  reset: () => void;
  /** Get the test suite in the expected format */
  getTestSuite: () => EvaluateTestSuiteWithEvaluateOptions;
  /** Auto-save state management */
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string | null;
  lastSavedAt: number | null;
  /** Clear all saved data from localStorage */
  clearSavedData: () => void;
  /** Get the size of saved data in localStorage */
  getSavedDataSize: () => number;
}

export const DEFAULT_CONFIG: Partial<UnifiedConfig> = {};

export const useStore = create<EvalConfigState>()(
  persist(
    (set, get) => ({
      config: cleanConfig({ ...DEFAULT_CONFIG }),
      saveStatus: 'idle',
      saveError: null,
      lastSavedAt: null,

      setConfig: (config) => {
        try {
          set({
            config: cleanConfig(config),
            saveStatus: 'saved',
            saveError: null,
            lastSavedAt: Date.now(),
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to save configuration';
          set({
            saveStatus: 'error',
            saveError: errorMessage,
          });
          console.error('Failed to save config:', error);
        }
      },

      updateConfig: (updates) => {
        try {
          set((state) => ({
            config: cleanConfig({ ...state.config, ...updates }),
            saveStatus: 'saved',
            saveError: null,
            lastSavedAt: Date.now(),
          }));
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to save configuration';
          set({
            saveStatus: 'error',
            saveError: errorMessage,
          });
          console.error('Failed to save config:', error);
        }
      },

      reset: () => {
        try {
          set({
            config: cleanConfig({ ...DEFAULT_CONFIG }),
            saveStatus: 'idle',
            saveError: null,
            lastSavedAt: null,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to reset configuration';
          set({
            saveStatus: 'error',
            saveError: errorMessage,
          });
          console.error('Failed to reset config:', error);
        }
      },

      clearSavedData: () => {
        try {
          // Clear the specific localStorage key
          localStorage.removeItem('promptfoo');

          // Reset to default state
          set({
            config: cleanConfig({ ...DEFAULT_CONFIG }),
            saveStatus: 'idle',
            saveError: null,
            lastSavedAt: null,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to clear saved data';
          set({
            saveStatus: 'error',
            saveError: errorMessage,
          });
          console.error('Failed to clear saved data:', error);
        }
      },

      getSavedDataSize: () => {
        try {
          const savedData = localStorage.getItem('promptfoo');
          return savedData ? new Blob([savedData]).size : 0;
        } catch (error) {
          console.error('Failed to get saved data size:', error);
          return 0;
        }
      },

      getTestSuite: () => {
        const { config } = get();
        const cleaned = cleanConfig(config);

        // Transform config to match the expected EvaluateTestSuiteWithEvaluateOptions format
        // Only include fields that have values
        const suite: Partial<EvaluateTestSuiteWithEvaluateOptions> = {};

        if (cleaned.description) {
          suite.description = cleaned.description;
        }
        if (cleaned.env) {
          suite.env = cleaned.env;
        }
        if (cleaned.extensions) {
          suite.extensions = cleaned.extensions;
        }
        if (cleaned.prompts) {
          suite.prompts = cleaned.prompts;
        }
        if (cleaned.providers) {
          suite.providers = cleaned.providers;
        }
        if (cleaned.scenarios) {
          suite.scenarios = cleaned.scenarios;
        }
        if (cleaned.tests) {
          suite.tests = cleaned.tests;
        }
        if (cleaned.evaluateOptions) {
          suite.evaluateOptions = cleaned.evaluateOptions;
        }
        if (cleaned.defaultTest) {
          suite.defaultTest = cleaned.defaultTest;
        }
        if (cleaned.derivedMetrics) {
          suite.derivedMetrics = cleaned.derivedMetrics;
        }

        return suite as EvaluateTestSuiteWithEvaluateOptions;
      },
    }),
    {
      name: 'promptfoo',
      skipHydration: true,
      migrate: (persistedState: any) => {
        // Clean up any existing persisted config to remove empty values
        if (persistedState && persistedState.config) {
          return {
            ...persistedState,
            config: cleanConfig(persistedState.config),
            saveStatus: persistedState.saveStatus || 'idle',
            saveError: persistedState.saveError || null,
            lastSavedAt: persistedState.lastSavedAt || null,
          };
        }
        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        // Set the save status to saved after successful rehydration
        if (state && state.config && Object.keys(state.config).length > 0) {
          state.saveStatus = 'saved';
        }
      },
      partialize: (state) => ({
        config: state.config,
        lastSavedAt: state.lastSavedAt,
      }),
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            return str ? JSON.parse(str) : null;
          } catch (error) {
            console.error('Failed to load saved config:', error);
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            // Check if we're approaching the localStorage quota
            const serialized = JSON.stringify(value);
            const size = new Blob([serialized]).size;

            // Most browsers have a 5-10MB limit, warn if approaching 4MB
            if (size > 4 * 1024 * 1024) {
              console.warn('Configuration size is large:', (size / 1024 / 1024).toFixed(2), 'MB');
            }

            localStorage.setItem(name, serialized);
          } catch (error) {
            // Handle quota exceeded error
            if (error instanceof Error && error.name === 'QuotaExceededError') {
              console.error('localStorage quota exceeded. Configuration was not saved.');
              throw new Error('Storage quota exceeded. Please clear some saved data.');
            }
            throw error;
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch (error) {
            console.error('Failed to remove item from localStorage:', error);
          }
        },
      },
    },
  ),
);
