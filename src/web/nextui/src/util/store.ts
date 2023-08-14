import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Assertion, ProviderConfig, TestCase } from '../../../../types';

export interface State {
  asserts: Assertion[];
  testCases: TestCase[];
  description: string;
  providers: ProviderConfig[];
  prompts: string[];
  setAsserts: (asserts: Assertion[]) => void;
  setTestCases: (testCases: TestCase[]) => void;
  setDescription: (description: string) => void;
  setProviders: (providers: ProviderConfig[]) => void;
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
