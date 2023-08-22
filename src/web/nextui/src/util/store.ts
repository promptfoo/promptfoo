import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ProviderOptions, TestCase, UnifiedConfig } from '../../../../types';

export interface State {
  testCases: TestCase[];
  description: string;
  providers: ProviderOptions[];
  prompts: string[];
  setTestCases: (testCases: TestCase[]) => void;
  setDescription: (description: string) => void;
  setProviders: (providers: ProviderOptions[]) => void;
  setPrompts: (prompts: string[]) => void;
  setStateFromConfig: (config: Partial<UnifiedConfig>) => void;
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      testCases: [],
      description: '',
      providers: [],
      prompts: [],
      setTestCases: (testCases) => set({ testCases }),
      setDescription: (description) => set({ description }),
      setProviders: (providers) => set({ providers }),
      setPrompts: (prompts) => set({ prompts }),
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
              (p) => !p.endsWith('.txt') && !p.endsWith('.json') && !p.endsWith('.yaml'),
            );
          } else {
            console.warn('Invalid prompts config', config.prompts);
          }
        }
        set(updates);
      },
    }),
    {
      name: 'promptfoo',
      skipHydration: true,
    },
  ),
);

/*
export const useStore = create<State>((set) => ({
  asserts: [],
  testCases: [],
  description: '',
  providers: [],
  prompts: [],
  setAsserts: (asserts) => set({ asserts }),
  setTestCases: (testCases) => set({ testCases }),
  setDescription: (description) => set({ description }),
  setProviders: (providers) => set({ providers }),
  setPrompts: (prompts) => set({ prompts }),
}));
*/
