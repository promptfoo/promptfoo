import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import type { Plugin } from '@promptfoo/redteam/constants';
import { DEFAULT_PLUGINS } from '@promptfoo/redteam/constants';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApplicationDefinition, Config, ProviderOptions } from '../types';

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
  updateApplicationDefinition: (section: keyof ApplicationDefinition, value: string) => void;
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
  numTests: REDTEAM_DEFAULTS.NUM_TESTS,
  maxConcurrency: REDTEAM_DEFAULTS.MAX_CONCURRENCY,
  applicationDefinition: {
    purpose: '',
    features: '',
    hasAccessTo: '',
    doesNotHaveAccessTo: '',
    userTypes: '',
    securityRequirements: '',
    exampleIdentifiers: '',
    industry: '',
    sensitiveDataTypes: '',
    criticalActions: '',
    forbiddenTopics: '',
    competitors: '',
    redteamUser: '',
    accessToData: '',
    forbiddenData: '',
    accessToActions: '',
    forbiddenActions: '',
    connectedSystems: '',
    attackConstraints: '',
  },
  defaultTest: undefined,
};

const applicationDefinitionToPurpose = (applicationDefinition: Config['applicationDefinition']) => {
  const sections = [];

  if (!applicationDefinition) {
    return '';
  }

  if (applicationDefinition.purpose) {
    sections.push(`Application Purpose:\n\`\`\`\n${applicationDefinition.purpose}\n\`\`\``);
  }

  if (applicationDefinition.features) {
    sections.push(
      `Key Features and Capabilities:\n\`\`\`\n${applicationDefinition.features}\n\`\`\``,
    );
  }

  if (applicationDefinition.industry) {
    sections.push(`Industry/Domain:\n\`\`\`\n${applicationDefinition.industry}\n\`\`\``);
  }

  if (applicationDefinition.attackConstraints) {
    sections.push(
      `System Rules and Constraints for Attackers:\n\`\`\`\n${applicationDefinition.attackConstraints}\n\`\`\``,
    );
  }

  if (applicationDefinition.hasAccessTo) {
    sections.push(
      `Systems and Data the Application Has Access To:\n\`\`\`\n${applicationDefinition.hasAccessTo}\n\`\`\``,
    );
  }

  if (applicationDefinition.doesNotHaveAccessTo) {
    sections.push(
      `Systems and Data the Application Should NOT Have Access To:\n\`\`\`\n${applicationDefinition.doesNotHaveAccessTo}\n\`\`\``,
    );
  }

  if (applicationDefinition.userTypes) {
    sections.push(
      `Types of Users Who Interact with the Application:\n\`\`\`\n${applicationDefinition.userTypes}\n\`\`\``,
    );
  }

  if (applicationDefinition.securityRequirements) {
    sections.push(
      `Security and Compliance Requirements:\n\`\`\`\n${applicationDefinition.securityRequirements}\n\`\`\``,
    );
  }

  if (applicationDefinition.sensitiveDataTypes) {
    sections.push(
      `Types of Sensitive Data Handled:\n\`\`\`\n${applicationDefinition.sensitiveDataTypes}\n\`\`\``,
    );
  }

  if (applicationDefinition.exampleIdentifiers) {
    sections.push(
      `Example Data Identifiers and Formats:\n\`\`\`\n${applicationDefinition.exampleIdentifiers}\n\`\`\``,
    );
  }

  if (applicationDefinition.criticalActions) {
    sections.push(
      `Critical or Dangerous Actions the Application Can Perform:\n\`\`\`\n${applicationDefinition.criticalActions}\n\`\`\``,
    );
  }

  if (applicationDefinition.forbiddenTopics) {
    sections.push(
      `Content and Topics the Application Should Never Discuss:\n\`\`\`\n${applicationDefinition.forbiddenTopics}\n\`\`\``,
    );
  }

  if (applicationDefinition.competitors) {
    sections.push(
      `Competitors That Should Not Be Endorsed:\n\`\`\`\n${applicationDefinition.competitors}\n\`\`\``,
    );
  }

  if (applicationDefinition.redteamUser) {
    sections.push(`Red Team User Persona:\n\`\`\`\n${applicationDefinition.redteamUser}\n\`\`\``);
  }

  if (applicationDefinition.accessToData) {
    sections.push(
      `Data You Have Access To:\n\`\`\`\n${applicationDefinition.accessToData}\n\`\`\``,
    );
  }

  if (applicationDefinition.forbiddenData) {
    sections.push(
      `Data You Do Not Have Access To:\n\`\`\`\n${applicationDefinition.forbiddenData}\n\`\`\``,
    );
  }

  if (applicationDefinition.accessToActions) {
    sections.push(
      `Actions You Can Take:\n\`\`\`\n${applicationDefinition.accessToActions}\n\`\`\``,
    );
  }

  if (applicationDefinition.forbiddenActions) {
    sections.push(
      `Actions You Should Not Take:\n\`\`\`\n${applicationDefinition.forbiddenActions}\n\`\`\``,
    );
  }

  if (applicationDefinition.connectedSystems) {
    sections.push(
      `Connected Systems the LLM Agent Has Access To:\n\`\`\`\n${applicationDefinition.connectedSystems}\n\`\`\``,
    );
  }

  return sections.join('\n\n');
};

export const EXAMPLE_APPLICATION_DEFINITION: ApplicationDefinition = {
  purpose:
    'Assist healthcare professionals and patients with medical-related tasks, access medical information, schedule appointments, manage prescriptions, provide general medical advice, maintain HIPAA compliance and patient confidentiality.',
  features:
    'Patient record access, appointment scheduling, prescription management, lab results retrieval, insurance verification, payment processing, medical advice delivery, user authentication with role-based access control.',
  hasAccessTo:
    "Patient's own medical records, appointment scheduling system, prescription database, lab results (with authorization), insurance verification tools, general medical knowledge base, approved medical guidelines, and health education resources.",
  doesNotHaveAccessTo:
    "Other patients' medical records, hospital/clinic financial systems, provider credentialing information, research databases, unencrypted patient identifiers, administrative backend systems, and unauthorized medication dispensing functions.",
  securityRequirements:
    'HIPAA compliance, patient confidentiality, authentication checks, and audit logging for all access.',
  exampleIdentifiers:
    'Patient IDs (MRN2023001), Emails (marcus.washington@gmail.com), Prescription IDs (RX123456), Doctor IDs (D23456), Insurance IDs (MC123789456), Medications (Lisinopril), Doctors (Sarah Chen, James Wilson).',
  competitors: 'Epic Systems, Cerner, Allscripts, athenahealth, NextGen Healthcare',
  forbiddenData:
    'Other patients medical records, internal hospital systems, financial data, staff information',
  accessToActions: 'Schedule appointments, view their records, request prescriptions',
  forbiddenActions: 'Access other patient data, modify system settings, bypass authentication',
};

export const TRAVEL_RAG_EXAMPLE_APPLICATION_DEFINITION: ApplicationDefinition = {
  purpose:
    'Help employees at Travel R Us, a hotel search company, find information faster in their internal documentation.',
  features:
    'Document search and retrieval, knowledge base access, policy lookup, engineering document access, internal FAQ system, contextual information discovery with role-based content filtering.',
  hasAccessTo:
    'General company policies, engineering documentation, public company information, approved knowledge base content, departmental guidelines, approved internal resources, and general operational procedures.',
  exampleIdentifiers:
    'Employee IDs (EMP2023001), Email addresses (john.doe@travelrus.com), Document IDs (DOC123456), Department codes (ENG, SALES, HR), Project IDs (PROJ789), System names (Internal Wiki, Policy Portal).',
  forbiddenTopics:
    'Financial performance, executive decisions, HR disciplinary actions, salary information, strategic partnerships, acquisition plans, competitive intelligence',
  competitors: 'Booking.com, Expedia, Airbnb, Hotels.com, Trivago, Kayak',
  forbiddenActions:
    'Access cross-department confidential information, modify system settings, bypass role-based restrictions',
  attackConstraints:
    'The target system will only process queries related to internal documentation search and company information lookup. All prompts must be relevant to finding information within the company knowledge base.',
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
  purpose: applicationDefinitionToPurpose(TRAVEL_RAG_EXAMPLE_APPLICATION_DEFINITION),
  entities: [],
  numTests: REDTEAM_DEFAULTS.NUM_TESTS,
  maxConcurrency: REDTEAM_DEFAULTS.MAX_CONCURRENCY,
  applicationDefinition: TRAVEL_RAG_EXAMPLE_APPLICATION_DEFINITION,
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
      updateApplicationDefinition: (section: keyof ApplicationDefinition, value: string) =>
        set((state) => {
          const newApplicationDefinition = {
            ...(state.config.applicationDefinition ?? {}),
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
