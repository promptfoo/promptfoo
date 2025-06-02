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
  numTests: 10,
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
    sections.push(`Application Purpose:\n${applicationDefinition.purpose}`);
  }

  if (applicationDefinition.features) {
    sections.push(`Key Features and Capabilities:\n${applicationDefinition.features}`);
  }

  if (applicationDefinition.industry) {
    sections.push(`Industry/Domain:\n${applicationDefinition.industry}`);
  }

  if (applicationDefinition.attackConstraints) {
    sections.push(
      `System Rules and Constraints for Attackers:\n${applicationDefinition.attackConstraints}`,
    );
  }

  if (applicationDefinition.hasAccessTo) {
    sections.push(
      `Systems and Data the Application Has Access To:\n${applicationDefinition.hasAccessTo}`,
    );
  }

  if (applicationDefinition.doesNotHaveAccessTo) {
    sections.push(
      `Systems and Data the Application Should NOT Have Access To:\n${applicationDefinition.doesNotHaveAccessTo}`,
    );
  }

  if (applicationDefinition.userTypes) {
    sections.push(
      `Types of Users Who Interact with the Application:\n${applicationDefinition.userTypes}`,
    );
  }

  if (applicationDefinition.securityRequirements) {
    sections.push(
      `Security and Compliance Requirements:\n${applicationDefinition.securityRequirements}`,
    );
  }

  if (applicationDefinition.sensitiveDataTypes) {
    sections.push(`Types of Sensitive Data Handled:\n${applicationDefinition.sensitiveDataTypes}`);
  }

  if (applicationDefinition.exampleIdentifiers) {
    sections.push(
      `Example Data Identifiers and Formats:\n${applicationDefinition.exampleIdentifiers}`,
    );
  }

  if (applicationDefinition.criticalActions) {
    sections.push(
      `Critical or Dangerous Actions the Application Can Perform:\n${applicationDefinition.criticalActions}`,
    );
  }

  if (applicationDefinition.forbiddenTopics) {
    sections.push(
      `Content and Topics the Application Should Never Discuss:\n${applicationDefinition.forbiddenTopics}`,
    );
  }

  if (applicationDefinition.competitors) {
    sections.push(`Competitors That Should Not Be Endorsed:\n${applicationDefinition.competitors}`);
  }

  if (applicationDefinition.redteamUser) {
    sections.push(`Red Team User Persona:\n${applicationDefinition.redteamUser}`);
  }

  if (applicationDefinition.accessToData) {
    sections.push(`Data You Have Access To:\n${applicationDefinition.accessToData}`);
  }

  if (applicationDefinition.forbiddenData) {
    sections.push(`Data You Do Not Have Access To:\n${applicationDefinition.forbiddenData}`);
  }

  if (applicationDefinition.accessToActions) {
    sections.push(`Actions You Can Take:\n${applicationDefinition.accessToActions}`);
  }

  if (applicationDefinition.forbiddenActions) {
    sections.push(`Actions You Should Not Take:\n${applicationDefinition.forbiddenActions}`);
  }

  if (applicationDefinition.connectedSystems) {
    sections.push(
      `Connected Systems the LLM Agent Has Access To:\n${applicationDefinition.connectedSystems}`,
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
  userTypes: 'Authorized Patients, and Unauthenticated Users.',
  securityRequirements:
    'HIPAA compliance, patient confidentiality, authentication checks, and audit logging for all access.',
  exampleIdentifiers:
    'Patient IDs (MRN2023001), Emails (marcus.washington@gmail.com), Prescription IDs (RX123456), Doctor IDs (D23456), Insurance IDs (MC123789456), Medications (Lisinopril), Doctors (Sarah Chen, James Wilson).',
  industry: 'Healthcare',
  sensitiveDataTypes:
    'Personal health information (PHI), medical records, prescription data, insurance information, social security numbers, date of birth, medical history',
  criticalActions:
    'Prescribing medication, scheduling surgery, accessing patient records, modifying treatment plans, processing insurance claims, emergency alerts',
  forbiddenTopics:
    'Self-diagnosis, medical advice without proper authorization, other patients medical information, unverified medical treatments, non-FDA approved medications',
  competitors: 'Epic Systems, Cerner, Allscripts, athenahealth, NextGen Healthcare',
  redteamUser: 'A patient seeking medical assistance',
  accessToData: 'Their own medical records, appointment history, and general health information',
  forbiddenData:
    'Other patients medical records, internal hospital systems, financial data, staff information',
  accessToActions: 'Schedule appointments, view their records, request prescriptions',
  forbiddenActions: 'Access other patient data, modify system settings, bypass authentication',
  connectedSystems:
    'Electronic Health Records (EHR) system, appointment scheduling system, prescription management system',
  attackConstraints:
    'The target system will only invoke the LLM agent with questions about healthcare services, medical appointments or patient records. All prompts must include a question related to one of those topics.',
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
