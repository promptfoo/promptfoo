import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  EnvOverrides,
  EvaluateOptions,
  EvaluateTestSuite,
  ProviderOptions,
  TestCase,
  UnifiedConfig,
} from '@/../../../types';

export interface State {
  env: EnvOverrides;
  testCases: TestCase[];
  description: string;
  providers: ProviderOptions[];
  prompts: string[];
  defaultTest: TestCase;
  evaluateOptions: EvaluateOptions;
  setEnv: (env: EnvOverrides) => void;
  setTestCases: (testCases: TestCase[]) => void;
  setDescription: (description: string) => void;
  setProviders: (providers: ProviderOptions[]) => void;
  setPrompts: (prompts: string[]) => void;
  setDefaultTest: (testCase: TestCase) => void;
  setEvaluateOptions: (options: EvaluateOptions) => void;
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
      setEnv: (env) => set({ env }),
      setTestCases: (testCases) => set({ testCases }),
      setDescription: (description) => set({ description }),
      setProviders: (providers) => set({ providers }),
      setPrompts: (prompts) => set({ prompts }),
      setDefaultTest: (testCase) => set({ defaultTest: testCase }),
      setEvaluateOptions: (options) => set({ evaluateOptions: options }),
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
        set(updates);
      },
      getTestSuite: () => {
        const { description, testCases, providers, prompts, env } = get();
        return {
          env,
          description,
          providers,
          prompts,
          tests: testCases,
        };
      },
    }),
    {
      name: 'promptfoo',
      skipHydration: true,
    },
  ),
);
