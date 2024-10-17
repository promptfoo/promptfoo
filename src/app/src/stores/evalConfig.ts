import type {
  EnvOverrides,
  EvaluateOptions,
  EvaluateTestSuite,
  ProviderOptions,
  TestCase,
  UnifiedConfig,
  Scenario,
} from '@promptfoo/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface State {
  env: EnvOverrides;
  testCases: TestCase[];
  description: string;
  providers: ProviderOptions[];
  prompts: string[];
  defaultTest: TestCase;
  evaluateOptions: EvaluateOptions;
  scenarios: Scenario[];
  setEnv: (env: EnvOverrides) => void;
  setTestCases: (testCases: TestCase[]) => void;
  setDescription: (description: string) => void;
  setProviders: (providers: ProviderOptions[]) => void;
  setPrompts: (prompts: string[]) => void;
  setDefaultTest: (testCase: TestCase) => void;
  setEvaluateOptions: (options: EvaluateOptions) => void;
  setScenarios: (scenarios: Scenario[]) => void;
  setStateFromConfig: (config: Partial<UnifiedConfig>) => void;
  getTestSuite: () => EvaluateTestSuite;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      env: {},
      testCases: [],
      description: '',
      providers: [],
      prompts: [],
      defaultTest: {},
      evaluateOptions: {},
      scenarios: [],
      setEnv: (env) => set({ env }),
      setTestCases: (testCases) => set({ testCases }),
      setDescription: (description) => set({ description }),
      setProviders: (providers) => set({ providers }),
      setPrompts: (prompts) => set({ prompts }),
      setDefaultTest: (testCase) => set({ defaultTest: testCase }),
      setEvaluateOptions: (options) => set({ evaluateOptions: options }),
      setScenarios: (scenarios) => set({ scenarios }),
      setStateFromConfig: (config: Partial<UnifiedConfig>) => {
        const updates: Partial<State> = {};
        if (config.description) {
          updates.description = config.description || '';
        }
        if (config.tests) {
          updates.testCases = config.tests as TestCase[];
        }
        if (config.providers) {
          updates.providers = config.providers as ProviderOptions[];
        }
        if (config.prompts) {
          if (typeof config.prompts === 'string') {
            updates.prompts = [config.prompts];
          } else if (Array.isArray(config.prompts)) {
            // If it looks like a file path, don't set it.
            updates.prompts = config.prompts.filter(
              (p): p is string =>
                typeof p === 'string' &&
                !p.endsWith('.txt') &&
                !p.endsWith('.json') &&
                !p.endsWith('.yaml'),
            );
          } else {
            console.warn('Invalid prompts config', config.prompts);
          }
        }
        if (config.defaultTest) {
          updates.defaultTest = config.defaultTest;
        }
        if (config.evaluateOptions) {
          updates.evaluateOptions = config.evaluateOptions;
        }
        if (config.scenarios) {
          updates.scenarios = config.scenarios as Scenario[];
        }
        set(updates);
      },
      getTestSuite: () => {
        const { description, testCases, providers, prompts, env, scenarios } = get();
        return {
          env,
          description,
          providers,
          prompts,
          tests: testCases,
          scenarios,
        };
      },
    }),
    {
      name: 'promptfoo',
      skipHydration: true,
    },
  ),
);
