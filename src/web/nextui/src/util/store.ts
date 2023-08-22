import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Assertion, ProviderOptions, TestCase } from '../../../../types';

export interface State {
  asserts: Assertion[];
  testCases: TestCase[];
  description: string;
  providers: ProviderOptions[];
  prompts: string[];
  setAsserts: (asserts: Assertion[]) => void;
  setTestCases: (testCases: TestCase[]) => void;
  setDescription: (description: string) => void;
  setProviders: (providers: ProviderOptions[]) => void;
  setPrompts: (prompts: string[]) => void;
}

export const useStore = create<State>()(
  persist(
    (set) => ({
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
      setConfigFromResults: (config) => set({ asserts: config.asserts, testCases: config.testCases, description: config.description, providers: config.providers, prompts: config.prompts }),
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
