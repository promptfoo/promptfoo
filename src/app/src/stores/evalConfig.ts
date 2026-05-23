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

// Names that look like credentials in any casing convention — camelCase
// (apiKey, bearerToken, privateKey, pfxPassword), snake_case (api_key,
// refresh_token, keystore_passphrase), kebab-case / SCREAMING_SNAKE
// (x-api-key, OPENAI_API_KEY, AWS_SECRET_ACCESS_KEY). Used for both
// provider config fields and env-var keys.
const CREDENTIAL_TOKEN_PATTERN =
  /(?:^|_)(api_?key|api_?secret|key|secret|token|password|passphrase|credential|signature|cookie|authorization|bearer)(?:_|$)/;

const looksLikeCredential = (name: string): boolean => {
  const normalized = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
  return CREDENTIAL_TOKEN_PATTERN.test(normalized);
};

const omitProviderCredentials = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(omitProviderCredentials);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) =>
      looksLikeCredential(key) ? [] : [[key, omitProviderCredentials(nestedValue)]],
    ),
  );
};

const omitSensitiveEnv = (env: Partial<UnifiedConfig>['env']): Partial<UnifiedConfig>['env'] => {
  if (!env || typeof env !== 'object') {
    return env;
  }
  const filtered = Object.fromEntries(
    Object.entries(env).filter(([key]) => !looksLikeCredential(key)),
  );
  return filtered as Partial<UnifiedConfig>['env'];
};

const omitPersistedSensitiveValues = (config: Partial<UnifiedConfig>): Partial<UnifiedConfig> => ({
  ...config,
  env: omitSensitiveEnv(config.env),
  providers: omitProviderCredentials(config.providers) as UnifiedConfig['providers'],
});

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
        config: omitPersistedSensitiveValues(state.config),
      }),
      merge: (persistedState, currentState) => {
        const persistedConfig = (persistedState as Partial<EvalConfigState> | undefined)?.config;

        return {
          ...currentState,
          ...(persistedState as Partial<EvalConfigState> | undefined),
          config: omitPersistedSensitiveValues({
            ...DEFAULT_CONFIG,
            ...persistedConfig,
          }),
        };
      },
    },
  ),
);
