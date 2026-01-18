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
  _cachedTestSuite: EvaluateTestSuiteWithEvaluateOptions | null;
  _configVersion: number;
  _testSuiteVersion: number;
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

export const useStore = create<EvalConfigState>()(
  persist(
    (set, get) => ({
      config: { ...DEFAULT_CONFIG },
      _cachedTestSuite: null,
      _configVersion: 0,
      _testSuiteVersion: 0,

      setConfig: (config) =>
        set((state) => ({
          config,
          _configVersion: state._configVersion + 1,
        })),

      updateConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates },
          _configVersion: state._configVersion + 1,
        })),

      reset: () =>
        set((state) => ({
          config: { ...DEFAULT_CONFIG },
          _configVersion: state._configVersion + 1,
        })),

      getTestSuite: () => {
        const state = get();

        if (state._cachedTestSuite && state._testSuiteVersion === state._configVersion) {
          return state._cachedTestSuite;
        }

        // Transform config to match the expected EvaluateTestSuiteWithEvaluateOptions format
        // Note: The 'tests' field in UnifiedConfig maps to 'testCases' in the old store
        const suite = {
          description: state.config.description,
          env: state.config.env,
          extensions: state.config.extensions,
          prompts: state.config.prompts,
          providers: state.config.providers,
          scenarios: state.config.scenarios,
          tests: state.config.tests || [], // This is what was 'testCases' before
          evaluateOptions: state.config.evaluateOptions,
          defaultTest: state.config.defaultTest,
          derivedMetrics: state.config.derivedMetrics,
        } as EvaluateTestSuiteWithEvaluateOptions;

        set({
          _cachedTestSuite: suite,
          _testSuiteVersion: state._configVersion,
        });

        return suite;
      },
    }),
    {
      name: 'promptfoo',
      skipHydration: true,
    },
  ),
);
