import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Config, ProviderOptions } from '../types';

interface RedTeamConfigState {
  config: Config;
  updateConfig: (section: keyof Config, value: any) => void;
  updatePlugins: (plugins: Array<string | { id: string; config: any }>) => void;
  setFullConfig: (config: Config) => void;
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
      updatePlugins: (plugins) =>
        set((state) => {
          const stringifiedCurrentPlugins = JSON.stringify(state.config.plugins);
          const stringifiedNewPlugins = JSON.stringify(plugins);

          if (stringifiedCurrentPlugins === stringifiedNewPlugins) {
            return state;
          }

          const newPlugins = plugins.map((plugin) => {
            if (typeof plugin === 'string' || !plugin.config) {
              return plugin;
            }

            const existingPlugin = state.config.plugins.find(
              (p) => typeof p === 'object' && p.id === plugin.id,
            );

            if (existingPlugin && typeof existingPlugin === 'object') {
              return {
                ...existingPlugin,
                ...plugin,
                config: {
                  ...existingPlugin.config,
                  ...plugin.config,
                },
              };
            }

            return plugin;
          });

          return {
            config: {
              ...state.config,
              plugins: newPlugins,
            },
          };
        }),
      setFullConfig: (config) => set({ config }),
      resetConfig: () => set({ config: defaultConfig }),
    }),
    {
      name: 'redTeamConfig',
      skipHydration: true,
    },
  ),
);
