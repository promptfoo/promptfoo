import { create } from 'zustand';

import type { EvaluateTestSuiteWithEvaluateOptions, UnifiedConfig } from '../../../types/index';

export interface EvalConfigState {
  config: Partial<UnifiedConfig>;
  setConfig: (config: Partial<UnifiedConfig>) => void;
  updateConfig: (updates: Partial<UnifiedConfig>) => void;
  reset: () => void;
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

try {
  globalThis.localStorage?.removeItem('promptfoo');
} catch {
  // Browsers can disable access to local storage.
}

export const useStore = create<EvalConfigState>()((set, get) => ({
  config: { ...DEFAULT_CONFIG },

  setConfig: (config) => set({ config }),

  updateConfig: (updates) =>
    set((state) => ({
      config: { ...state.config, ...updates },
    })),

  reset: () => set({ config: { ...DEFAULT_CONFIG } }),

  getTestSuite: () => {
    const { config } = get();

    return {
      description: config.description,
      env: config.env,
      extensions: config.extensions,
      prompts: config.prompts,
      providers: config.providers,
      scenarios: config.scenarios,
      tests: config.tests || [],
      evaluateOptions: config.evaluateOptions,
      defaultTest: config.defaultTest,
      derivedMetrics: config.derivedMetrics,
    } as EvaluateTestSuiteWithEvaluateOptions;
  },
}));
