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
}

export const DEFAULT_CONFIG: Partial<UnifiedConfig> = {
  providers: [],
  prompts: [],
  tests: [],
  defaultTest: {},
  env: {},
  evaluateOptions: {},
};

export const useStore = create<EvalConfigState>()(
  persist(
    (set, get) => ({
      config: cleanConfig({ ...DEFAULT_CONFIG }),

      setConfig: (config) => set({ config: cleanConfig(config) }),

      updateConfig: (updates) =>
        set((state) => ({
          config: cleanConfig({ ...state.config, ...updates }),
        })),

      reset: () => set({ config: cleanConfig({ ...DEFAULT_CONFIG }) }),

      getTestSuite: () => {
        const { config } = get();
        const cleaned = cleanConfig(config);

        // Transform config to match the expected EvaluateTestSuiteWithEvaluateOptions format
        // Note: The 'tests' field in UnifiedConfig maps to 'testCases' in the old store
        return {
          description: cleaned.description,
          env: cleaned.env,
          extensions: cleaned.extensions,
          prompts: cleaned.prompts,
          providers: cleaned.providers,
          scenarios: cleaned.scenarios,
          tests: cleaned.tests || [], // This is what was 'testCases' before
          evaluateOptions: cleaned.evaluateOptions,
          defaultTest: cleaned.defaultTest,
          derivedMetrics: cleaned.derivedMetrics,
        } as EvaluateTestSuiteWithEvaluateOptions;
      },
    }),
    {
      name: 'promptfoo',
      skipHydration: true,
    },
  ),
);
