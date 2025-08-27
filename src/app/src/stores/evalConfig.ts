import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { EvaluateTestSuiteWithEvaluateOptions, UnifiedConfig } from '../../../types';
import {
  transformResultsConfigToSetupConfig,
  validateConfigCompleteness,
  createMinimalValidConfig,
  hasMinimumRequiredFields,
} from '../utils/configTransformation';

export interface EvalConfigState {
  config: Partial<UnifiedConfig>;
  /** Source of the current config (fresh, results, user-edited) */
  configSource: 'fresh' | 'results' | 'user-edited';
  /** Original config from results (for comparison/restoration) */
  originalResultsConfig: Partial<UnifiedConfig> | null;
  /** Loading state for config operations */
  isLoading: boolean;
  /** Validation state */
  validationStatus: {
    isValid: boolean;
    errors: string[];
    hasMinimumFields: boolean;
  };
  /** Replace the entire config */
  setConfig: (config: Partial<UnifiedConfig>) => void;
  /** Set config from results with async transformation */
  setConfigFromResults: (resultsConfig: Partial<UnifiedConfig>) => Promise<void>;
  /** Merge updates into the existing config */
  updateConfig: (updates: Partial<UnifiedConfig>) => void;
  /** Reset config to defaults */
  reset: () => void;
  /** Restore original results config */
  restoreOriginal: () => void;
  /** Validate current config */
  validateCurrentConfig: () => void;
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
      configSource: 'fresh' as const,
      originalResultsConfig: null,
      isLoading: false,
      validationStatus: {
        isValid: true,
        errors: [],
        hasMinimumFields: false,
      },

      setConfig: (config) =>
        set({
          config,
          configSource: 'user-edited',
        }),

      updateConfig: (updates) =>
        set((state) => {
          // Only change configSource if there are actual updates
          const hasUpdates = Object.keys(updates).length > 0;
          return {
            config: { ...state.config, ...updates },
            configSource:
              hasUpdates && state.configSource === 'fresh' ? 'user-edited' : state.configSource,
          };
        }),

      setConfigFromResults: async (resultsConfig) => {
        set({ isLoading: true });

        try {
          // Transform the results config for use in setup
          const transformedConfig = transformResultsConfigToSetupConfig(resultsConfig);

          // Create a minimal valid config if the transformed one is incomplete
          const setupConfig = hasMinimumRequiredFields(transformedConfig)
            ? transformedConfig
            : createMinimalValidConfig(transformedConfig);

          set({
            config: setupConfig,
            originalResultsConfig: resultsConfig,
            configSource: 'results',
            isLoading: false,
          });

          // Validate the new config
          const { validateCurrentConfig } = get();
          validateCurrentConfig();
        } catch (error) {
          console.error('Error transforming results config:', error);
          // Fall back to minimal config
          set({
            config: createMinimalValidConfig(resultsConfig),
            originalResultsConfig: resultsConfig,
            configSource: 'results',
            isLoading: false,
          });
        }
      },

      reset: () =>
        set({
          config: { ...DEFAULT_CONFIG },
          configSource: 'fresh',
          originalResultsConfig: null,
          validationStatus: {
            isValid: true,
            errors: [],
            hasMinimumFields: false,
          },
        }),

      restoreOriginal: () => {
        const { originalResultsConfig } = get();
        if (originalResultsConfig) {
          const transformedConfig = transformResultsConfigToSetupConfig(originalResultsConfig);
          set({
            config: transformedConfig,
            configSource: 'results',
          });
          const { validateCurrentConfig } = get();
          validateCurrentConfig();
        }
      },

      validateCurrentConfig: () => {
        const { config } = get();
        const validation = validateConfigCompleteness(config);
        const hasMinFields = hasMinimumRequiredFields(config);

        set({
          validationStatus: {
            isValid: validation.isValid,
            errors: validation.errors.map((e) => e.message),
            hasMinimumFields: hasMinFields,
          },
        });
      },

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
    },
  ),
);
