import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { EvaluateTestSuiteWithEvaluateOptions, UnifiedConfig } from '../../../types/index';

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
  description: '',
  providers: [],
  prompts: [],
  tests: [],
  defaultTest: {},
  derivedMetrics: [],
  env: {},
  evaluateOptions: {},
  scenarios: [],
  extensions: [],
};

export const MAX_PERSISTED_EVAL_CONFIG_BYTES = 2_000_000;

function getJsonSize(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function getPersistableEvalConfig(config: Partial<UnifiedConfig>): Partial<UnifiedConfig> {
  if (getJsonSize(config) <= MAX_PERSISTED_EVAL_CONFIG_BYTES) {
    return config;
  }

  const compactConfig: Partial<UnifiedConfig> = {
    ...config,
    tests: [],
    defaultTest: {},
    scenarios: [],
  };

  if (getJsonSize(compactConfig) <= MAX_PERSISTED_EVAL_CONFIG_BYTES) {
    return compactConfig;
  }

  return {
    ...DEFAULT_CONFIG,
    description: config.description ?? '',
    providers: config.providers ?? [],
    prompts: [],
  };
}

export const useStore = create<EvalConfigState>()(
  persist(
    (set, get) => ({
      config: { ...DEFAULT_CONFIG },

      setConfig: (config) => set({ config }),

      updateConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates },
        })),

      reset: () => set({ config: { ...DEFAULT_CONFIG } }),

      getTestSuite: () => {
        const { config } = get();

        // Transform config to match the expected EvaluateTestSuiteWithEvaluateOptions format
        // Note: The 'tests' field in UnifiedConfig maps to 'testCases' in the old store
        return {
          description: config.description,
          env: config.env,
          extensions: config.extensions,
          prompts: config.prompts,
          providers: config.providers,
          scenarios: config.scenarios,
          tests: config.tests || [], // This is what was 'testCases' before
          evaluateOptions: config.evaluateOptions,
          defaultTest: config.defaultTest,
          derivedMetrics: config.derivedMetrics,
        } as EvaluateTestSuiteWithEvaluateOptions;
      },
    }),
    {
      name: 'promptfoo',
      skipHydration: true,
      partialize: (state) => ({
        config: getPersistableEvalConfig(state.config),
      }),
    },
  ),
);
