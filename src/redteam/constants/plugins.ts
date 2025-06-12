import { MEMORY_POISONING_PLUGIN_ID } from '../plugins/agentic/constants';

export const DEFAULT_NUM_TESTS_PER_PLUGIN = 5;

export const REDTEAM_MODEL = 'openai:chat:gpt-4.1-2025-04-14';

export const LLAMA_GUARD_REPLICATE_PROVIDER =
  'replicate:moderation:meta/llama-guard-3-8b:146d1220d447cdcc639bc17c5f6137416042abee6ae153a2615e6ef5749205c8';

export const LLAMA_GUARD_ENABLED_CATEGORIES: string[] = [
  'S1', // Violent Crimes
  'S2', // Non-Violent Crimes
  'S3', // Sex Crimes
  'S4', // Child Exploitation
  'S5', // Defamation
  'S6', // Specialized Advice
  // S7: 'Privacy' - disabled due to false positives from allowed entities
  'S8', // Intellectual Property
  'S9', // Indiscriminate Weapons
  'S10', // Hate
  'S11', // Self-Harm
  'S12', // Sexual Content
  'S13', // Elections
];

export const FOUNDATION_PLUGINS = [
  'ascii-smuggling',
  'beavertails',
  'bias:gender',
  'contracts',
  'cyberseceval',
  'donotanswer',
  'divergent-repetition',
  'excessive-agency',
  'hallucination',
  'harmful:chemical-biological-weapons',
  'harmful:child-exploitation',
  'harmful:copyright-violations',
  'harmful:cybercrime',
  'harmful:cybercrime:malicious-code',
  'harmful:graphic-content',
  'harmful:harassment-bullying',
  'harmful:hate',
  'harmful:illegal-activities',
  'harmful:illegal-drugs',
  'harmful:illegal-drugs:meth',
  'harmful:indiscriminate-weapons',
  'harmful:insults',
  'harmful:intellectual-property',
  'harmful:misinformation-disinformation',
  'harmful:non-violent-crime',
  'harmful:profanity',
  'harmful:radicalization',
  'harmful:self-harm',
  'harmful:sex-crime',
  'harmful:sexual-content',
  'harmful:specialized-advice',
  'harmful:unsafe-practices',
  'harmful:violent-crime',
  'harmful:weapons:ied',
  'hijacking',
  'imitation',
  'overreliance',
  'pii:direct',
  'pliny',
  'politics',
  'religion',
] as const;

export const AGENTIC_PLUGINS = [MEMORY_POISONING_PLUGIN_ID] as const;
export type AgenticPlugin = (typeof AGENTIC_PLUGINS)[number];

export const COLLECTIONS = ['default', 'foundation', 'harmful', 'pii'] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const UNALIGNED_PROVIDER_HARM_PLUGINS = {
  'bias:gender': 'Gender Bias',

  // MLCommons harm categories
  // https://www.llama.com/docs/model-cards-and-prompt-formats/llama-guard-3/
  'harmful:child-exploitation': 'Child Exploitation',
  'harmful:hate': 'Hate',
  'harmful:indiscriminate-weapons': 'Indiscriminate Weapons',
  'harmful:non-violent-crime': 'Non-Violent Crimes',
  'harmful:self-harm': 'Self-Harm',
  'harmful:sex-crime': 'Sex Crimes',
  'harmful:sexual-content': 'Sexual Content',
  'harmful:violent-crime': 'Violent Crimes',

  // Harmbench taxonomy
  // https://arxiv.org/pdf/2402.04249
  'harmful:chemical-biological-weapons': 'Chemical & Biological Weapons',
  'harmful:copyright-violations': 'Copyright Violations - Copyrighted text',
  'harmful:cybercrime': 'Cybercrime & Unauthorized Intrusion - Hacking and Malware',
  'harmful:graphic-content': 'Graphic & age-restricted content',
  'harmful:harassment-bullying': 'Harassment & Bullying',
  'harmful:illegal-activities': 'Illegal Activities - Fraud & scams',
  'harmful:illegal-drugs': 'Illegal Drugs',
  'harmful:unsafe-practices': 'Promotion of unsafe practices',

  // Other
  'harmful:insults': 'Insults and personal attacks',
  'harmful:profanity': 'Requests containing profanity',
  'harmful:radicalization': 'Radicalization',
  'harmful:illegal-drugs:meth': 'Methamphetamine',
  'harmful:weapons:ied': 'Improvised Explosive Devices',
  'harmful:cybercrime:malicious-code': 'Malicious Code',

  // Commented out
  //'harmful:privacy-violations': 'Privacy violations & data exploitation',  // redundant with MLCommons category
  //'locale_specific_illegal (e.g. hate speech in Germany, alcohol in Saudi Arabia)',
  //'scam_fraud_creation',
} as const;
export type UnalignedProviderHarmPlugin = keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS;

export const REDTEAM_PROVIDER_HARM_PLUGINS = {
  'harmful:intellectual-property': 'Intellectual Property violation',
  'harmful:privacy': 'Privacy violations',
} as const;
export type RedTeamProviderHarmPlugin = keyof typeof REDTEAM_PROVIDER_HARM_PLUGINS;

export const HARM_PLUGINS = {
  'harmful:misinformation-disinformation':
    'Misinformation & Disinformation - Harmful lies and propaganda',
  'harmful:specialized-advice': 'Specialized Advice - Financial',
  ...UNALIGNED_PROVIDER_HARM_PLUGINS,
  ...REDTEAM_PROVIDER_HARM_PLUGINS,
} as const;
export type HarmPlugin = keyof typeof HARM_PLUGINS;

export const PII_PLUGINS = ['pii:api-db', 'pii:direct', 'pii:session', 'pii:social'] as const;

export type PIIPlugin = (typeof PII_PLUGINS)[number];

export const BASE_PLUGINS = [
  'contracts',
  'excessive-agency',
  'hallucination',
  'hijacking',
  'politics',
] as const;
export type BasePlugin = (typeof BASE_PLUGINS)[number];

export const ADDITIONAL_PLUGINS = [
  'aegis',
  'ascii-smuggling',
  'beavertails',
  'bfla',
  'bola',
  'cca',
  'competitors',
  'cross-session-leak',
  'cyberseceval',
  'debug-access',
  'divergent-repetition',
  'donotanswer',
  'harmbench',
  'toxic-chat',
  'imitation',
  'indirect-prompt-injection',
  'mcp',
  'medical:anchoring-bias',
  'medical:hallucination',
  'medical:incorrect-knowledge',
  'medical:prioritization-error',
  'medical:sycophancy',
  'off-topic',
  'overreliance',
  'pliny',
  'prompt-extraction',
  'rag-document-exfiltration',
  'rag-poisoning',
  'rbac',
  'reasoning-dos',
  'religion',
  'shell-injection',
  'sql-injection',
  'ssrf',
  'system-prompt-override',
  'tool-discovery',
  'unsafebench',
  'xstest',
] as const;
export type AdditionalPlugin = (typeof ADDITIONAL_PLUGINS)[number];

// Plugins that require configuration and can't be enabled by default or included as additional.
export const CONFIG_REQUIRED_PLUGINS = ['intent', 'policy'] as const;
export type ConfigRequiredPlugin = (typeof CONFIG_REQUIRED_PLUGINS)[number];

// Agentic plugins that don't use strategies (standalone agentic plugins)
export const AGENTIC_EXEMPT_PLUGINS = [
  'system-prompt-override',
  MEMORY_POISONING_PLUGIN_ID,
] as const;

// Dataset plugins that don't use strategies (standalone dataset plugins)
export const DATASET_EXEMPT_PLUGINS = ['pliny', 'unsafebench'] as const;

// Plugins that don't use strategies (standalone plugins) - combination of agentic and dataset
export const STRATEGY_EXEMPT_PLUGINS = [
  ...AGENTIC_EXEMPT_PLUGINS,
  ...DATASET_EXEMPT_PLUGINS,
] as const;

export type AgenticExemptPlugin = (typeof AGENTIC_EXEMPT_PLUGINS)[number];
export type DatasetExemptPlugin = (typeof DATASET_EXEMPT_PLUGINS)[number];
export type StrategyExemptPlugin = (typeof STRATEGY_EXEMPT_PLUGINS)[number];

export type Plugin =
  | AdditionalPlugin
  | BasePlugin
  | Collection
  | ConfigRequiredPlugin
  | HarmPlugin
  | PIIPlugin
  | AgenticPlugin;

export const DEFAULT_PLUGINS: ReadonlySet<Plugin> = new Set([
  ...[...BASE_PLUGINS, ...(Object.keys(HARM_PLUGINS) as HarmPlugin[]), ...PII_PLUGINS].sort(),
] as const satisfies readonly Plugin[]);

export const ALL_PLUGINS: readonly Plugin[] = [
  ...new Set([
    ...DEFAULT_PLUGINS,
    ...ADDITIONAL_PLUGINS,
    ...CONFIG_REQUIRED_PLUGINS,
    ...AGENTIC_PLUGINS,
  ]),
].sort() as Plugin[];
