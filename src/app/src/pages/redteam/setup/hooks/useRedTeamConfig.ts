import type { Plugin } from '@promptfoo/redteam/constants';
import { DEFAULT_PLUGINS } from '@promptfoo/redteam/constants';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Config, ProviderOptions } from '../types';

interface RecentlyUsedPlugins {
  plugins: Plugin[];
  addPlugin: (plugin: Plugin) => void;
}

const NUM_RECENT_PLUGINS = 6;
export const useRecentlyUsedPlugins = create<RecentlyUsedPlugins>()(
  persist(
    (set) => ({
      plugins: [],
      addPlugin: (plugin) =>
        set((state) => ({
          plugins: [plugin, ...state.plugins.filter((p) => p !== plugin)].slice(
            0,
            NUM_RECENT_PLUGINS,
          ),
        })),
    }),
    {
      name: 'recentlyUsedPlugins',
    },
  ),
);

interface RedTeamConfigState {
  config: Config;
  updateConfig: (section: keyof Config, value: any) => void;
  updatePlugins: (plugins: Array<string | { id: string; config: any }>) => void;
  setFullConfig: (config: Config) => void;
  resetConfig: () => void;
  updateApplicationDefinition: (
    section: keyof Config['applicationDefinition'],
    value: string,
  ) => void;
}

export const DEFAULT_HTTP_TARGET: ProviderOptions = {
  id: 'http',
  config: {
    url: '',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '{{prompt}}',
    }),
  },
};

export const PROMPT_EXAMPLE =
  'You are a travel agent specialized in budget trips to Europe\n\nUser query: {{prompt}}';

const defaultConfig: Config = {
  description: 'My Red Team Configuration',
  prompts: ['{{prompt}}'],
  target: DEFAULT_HTTP_TARGET,
  plugins: [...DEFAULT_PLUGINS],
  strategies: ['jailbreak', 'jailbreak:composite'],
  purpose: '',
  entities: [],
  numTests: 10,
  applicationDefinition: {
    purpose: '',
    redteamUser: '',
    accessToData: '',
    forbiddenData: '',
    accessToActions: '',
    forbiddenActions: '',
    connectedSystems: '',
  },
  defaultTest: undefined,
};

const applicationDefinitionToPurpose = (applicationDefinition: Config['applicationDefinition']) => {
  const sections = [];

  if (applicationDefinition.purpose) {
    sections.push(`The objective of the application is: ${applicationDefinition.purpose}`);
  }

  if (applicationDefinition.redteamUser) {
    sections.push(`You are: ${applicationDefinition.redteamUser}`);
  }

  if (applicationDefinition.accessToData) {
    sections.push(`You have access to: ${applicationDefinition.accessToData}`);
  }

  if (applicationDefinition.forbiddenData) {
    sections.push(`You do not have access to: ${applicationDefinition.forbiddenData}`);
  }

  if (applicationDefinition.accessToActions) {
    sections.push(`You can take the following actions: ${applicationDefinition.accessToActions}`);
  }

  if (applicationDefinition.forbiddenActions) {
    sections.push(
      `You should not take the following actions: ${applicationDefinition.forbiddenActions}`,
    );
  }

  if (applicationDefinition.connectedSystems) {
    sections.push(
      `The LLM agent has access to these systems: ${applicationDefinition.connectedSystems}`,
    );
  }

  return sections.join('\n\n');
};

const EXAMPLE_APPLICATION_DEFINITION = {
  purpose:
    'Help employees at Travel R Us, a hotel search company, find information faster in their internal documentation.',
  redteamUser: 'An employee in the engineering department',
  accessToData: 'General company information like policies and engineering documents',
  forbiddenData:
    'Anything owned by other departments. Things like future strategy, financial documents, sales documentation and planning, confidential HR information.',
  accessToActions: 'Search the documents',
  forbiddenActions: '',
  connectedSystems: 'Internal company knowledge base',
};

export const EXAMPLE_CONFIG: Config = {
  description: 'Internal Company RAG Example',
  prompts: ['{{prompt}}'],
  target: {
    id: 'http',
    label: 'internal-rag-example',
    config: {
      url: 'https://redpanda-internal-rag-example.promptfoo.app/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': '{{sessionId}}',
      },
      body: {
        input: '{{prompt}}',
        role: 'engineering',
      },
      transformResponse: 'json.response',
      sessionParser: 'data.headers["x-session-id"]',
      stateful: true,
    },
  },
  plugins: ['harmful:hate', 'harmful:self-harm', 'rbac'],
  strategies: ['jailbreak', 'jailbreak:composite'],
  purpose: applicationDefinitionToPurpose(EXAMPLE_APPLICATION_DEFINITION),
  entities: [],
  numTests: 10,
  applicationDefinition: EXAMPLE_APPLICATION_DEFINITION,
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
      resetConfig: () => {
        set({ config: defaultConfig });
        // There's a bunch of state that's not persisted that we want to reset
        window.location.reload();
      },
      updateApplicationDefinition: (
        section: keyof Config['applicationDefinition'],
        value: string,
      ) =>
        set((state) => {
          const newApplicationDefinition = {
            ...state.config.applicationDefinition,
            [section]: value,
          };
          const newPurpose = applicationDefinitionToPurpose(newApplicationDefinition);
          return {
            config: {
              ...state.config,
              applicationDefinition: newApplicationDefinition,
              purpose: newPurpose,
            },
          };
        }),
    }),
    {
      name: 'redTeamConfig',
    },
  ),
);
