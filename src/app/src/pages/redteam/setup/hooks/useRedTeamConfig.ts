import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Config, ProviderOptions } from '../types';

interface RedTeamConfigState {
  config: Config;
  updateConfig: (section: keyof Config, value: any) => void;
  resetConfig: () => void;
}

export const DEFAULT_HTTP_TARGET: ProviderOptions = {
  id: 'http',
  config: {
    url: '',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // @ts-ignore
    body: {
      message: '{{prompt}}',
    },
  },
};

export const PROMPT_EXAMPLE =
  'You are a travel agent specialized in budget trips to Europe\n\nUser query: {{prompt}}';

export const DEFAULT_PURPOSE = 'Assist users with planning affordable trips to Europe';

const defaultConfig: Config = {
  description: 'My Red Team Configuration',
  prompts: ['{{prompt}}'],
  target: DEFAULT_HTTP_TARGET,
  plugins: ['default'],
  strategies: ['jailbreak', 'prompt-injection'],
  purpose: '',
  entities: [],
};

export const useRedTeamConfig = create<RedTeamConfigState>()(
  persist(
    (set) => ({
      config: defaultConfig,
      updateConfig: (section, value) =>
        set((state) => ({
          config: {
            ...state.config,
            [section]: value,
          },
        })),
      resetConfig: () => set({ config: defaultConfig }),
    }),
    {
      name: 'redTeamConfig',
      skipHydration: true,
    },
  ),
);
