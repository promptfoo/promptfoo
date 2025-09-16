import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { EvaluateTestSuiteWithEvaluateOptions, UnifiedConfig } from '../../../types/index';

export interface EvalConfigState {
  config: Partial<UnifiedConfig>;
  /** Replace the entire config */
  setConfig: (config: Partial<UnifiedConfig>) => void;
  /** Merge updates into the existing config */
  updateConfig: (updates: Partial<UnifiedConfig>) => void;
  /** Update a specific provider's config without replacing the entire array */
  updateProviderConfig: (providerId: string, config: Record<string, any>) => void;
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

export const useStore = create<EvalConfigState>()(
  persist(
    (set, get) => ({
      config: { ...DEFAULT_CONFIG },

      setConfig: (config) => set({ config }),

      updateConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates },
        })),

      updateProviderConfig: (providerId, newConfig) =>
        set((state) => {
          // Providers can be a string, function, or array
          const currentProviders = state.config.providers;

          // Only update if providers is an array
          if (!Array.isArray(currentProviders)) {
            return state;
          }

          return {
            config: {
              ...state.config,
              providers: currentProviders.map((provider: any) =>
                provider.id === providerId ? { ...provider, config: newConfig } : provider,
              ),
            },
          };
        }),

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
      // Avoid persisting sensitive secrets such as API keys
      partialize: (state) => {
        const redactSecrets = (obj: any) => {
          if (!obj || typeof obj !== 'object') {
            return obj;
          }
          const copy: any = Array.isArray(obj) ? [...obj] : { ...obj };
          if ('apiKey' in copy) {
            delete copy.apiKey;
          }
          return copy;
        };

        const redactedProviders = Array.isArray(state.config.providers)
          ? (state.config.providers as any[]).map((p) =>
              p && typeof p === 'object' && 'config' in p ? { ...p, config: redactSecrets(p.config) } : p,
            )
          : state.config.providers;

        return {
          config: {
            ...state.config,
            providers: redactedProviders as any,
          },
        } as Partial<EvalConfigState>;
      },
    },
  ),
);
