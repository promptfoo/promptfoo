export const DEFAULT_NUM_TESTS_PER_PLUGIN = 5;

// Redteam configuration defaults
export const REDTEAM_DEFAULTS = {
  MAX_CONCURRENCY: 4,
  NUM_TESTS: 10,
} as const;

export const REDTEAM_MODEL = 'openai:chat:gpt-4.1-2025-04-14';

// LlamaGuard 4 is the default on Replicate (supports S14: Code Interpreter Abuse)
export const LLAMA_GUARD_REPLICATE_PROVIDER = 'replicate:moderation:meta/llama-guard-4-12b';

// For LlamaGuard 3 compatibility:
// export const LLAMA_GUARD_REPLICATE_PROVIDER =
//   'replicate:moderation:meta/llama-guard-3-8b:146d1220d447cdcc639bc17c5f6137416042abee6ae153a2615e6ef5749205c8';

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
  'bias:age',
  'bias:disability',
  'bias:gender',
  'bias:race',
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

export const GUARDRAILS_EVALUATION_PLUGINS = [
  // === PROMPT INJECTION & JAILBREAKING ===
  'ascii-smuggling',
  'indirect-prompt-injection',
  'cca',
  'hijacking',
  'system-prompt-override',
  'beavertails',
  'harmbench',
  'pliny',
  'donotanswer',
  'prompt-extraction',

  // === HARMFUL CONTENT ===
  // WMD & Weapons
  'harmful:chemical-biological-weapons',
  'harmful:indiscriminate-weapons',
  'harmful:weapons:ied',

  // Violence & Crime
  'harmful:violent-crime',
  'harmful:sex-crime',
  'harmful:non-violent-crime',
  'harmful:graphic-content',
  'harmful:unsafe-practices',

  // Exploitation & Abuse
  'harmful:child-exploitation',
  'harmful:harassment-bullying',
  'harmful:hate',
  'harmful:self-harm',
  'harmful:sexual-content',
  'harmful:insults',
  'harmful:profanity',

  // Radicalization & Extremism
  'harmful:radicalization',

  // Cybercrime & Security
  'harmful:cybercrime',
  'harmful:cybercrime:malicious-code',

  // Substances
  'harmful:illegal-activities',
  'harmful:illegal-drugs',
  'harmful:illegal-drugs:meth',

  // Information Integrity
  'harmful:misinformation-disinformation',
  'harmful:specialized-advice',

  // Legal & IP
  'harmful:copyright-violations',
  'harmful:intellectual-property',

  // === SYSTEM SECURITY & INTEGRITY ===
  'cyberseceval',
  'excessive-agency',
  'hallucination',
  'overreliance',
  'divergent-repetition',
  'reasoning-dos',

  // === PII & PRIVACY PROTECTION (UK/EU Compliance) ===
  'harmful:privacy',
] as const;

export const AGENTIC_PLUGINS = ['agentic:memory-poisoning'] as const;
export type AgenticPlugin = (typeof AGENTIC_PLUGINS)[number];

export const COLLECTIONS = [
  'default',
  'foundation',
  'harmful',
  'pii',
  'bias',
  'medical',
  'guardrails-eval',
] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const UNALIGNED_PROVIDER_HARM_PLUGINS = {
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

export const REDTEAM_PROVIDER_HARM_PLUGINS = {
  'harmful:intellectual-property': 'Intellectual Property violation',
  'harmful:privacy': 'Privacy violations',
} as const;

export const HARM_PLUGINS = {
  'harmful:misinformation-disinformation':
    'Misinformation & Disinformation - Harmful lies and propaganda',
  'harmful:specialized-advice': 'Specialized Advice - Financial',
  ...UNALIGNED_PROVIDER_HARM_PLUGINS,
  ...REDTEAM_PROVIDER_HARM_PLUGINS,
} as const;
export type HarmPlugin = keyof typeof HARM_PLUGINS;

export const PII_PLUGINS = ['pii:api-db', 'pii:direct', 'pii:session', 'pii:social'] as const;

export const BIAS_PLUGINS = ['bias:age', 'bias:disability', 'bias:gender', 'bias:race'] as const;

export const MEDICAL_PLUGINS = [
  'medical:anchoring-bias',
  'medical:hallucination',
  'medical:incorrect-knowledge',
  'medical:prioritization-error',
  'medical:sycophancy',
] as const;

export const FINANCIAL_PLUGINS = [
  'financial:calculation-error',
  'financial:compliance-violation',
  'financial:data-leakage',
  'financial:hallucination',
  'financial:sycophancy',
] as const;

export type PIIPlugin = (typeof PII_PLUGINS)[number];
export type BiasPlugin = (typeof BIAS_PLUGINS)[number];
export type MedicalPlugin = (typeof MEDICAL_PLUGINS)[number];

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
  'bopla',
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
  'financial:calculation-error',
  'financial:compliance-violation',
  'financial:data-leakage',
  'financial:hallucination',
  'financial:sycophancy',
  'off-topic',
  'overreliance',
  'pliny',
  'prompt-extraction',
  'rag-document-exfiltration',
  'rag-poisoning',
  'rbac',
  'reasoning-dos',
  'religion',
  'resource-consumption',
  'shell-injection',
  'sql-injection',
  'ssrf',
  'system-prompt-override',
  'tool-discovery',
  'unrestricted-access',
  'unsafebench',
  'unverifiable-claims',
  'xstest',
] as const;
type AdditionalPlugin = (typeof ADDITIONAL_PLUGINS)[number];

// Plugins that require configuration and can't be enabled by default or included as additional.
export const CONFIG_REQUIRED_PLUGINS = ['intent', 'policy'] as const;
type ConfigRequiredPlugin = (typeof CONFIG_REQUIRED_PLUGINS)[number];

// Agentic plugins that don't use strategies (standalone agentic plugins)
export const AGENTIC_EXEMPT_PLUGINS = [
  'system-prompt-override',
  'agentic:memory-poisoning',
] as const;

// Dataset plugins that don't use strategies (standalone dataset plugins)
export const DATASET_EXEMPT_PLUGINS = ['pliny', 'unsafebench'] as const;

// Plugins that don't use strategies (standalone plugins) - combination of agentic and dataset
export const STRATEGY_EXEMPT_PLUGINS = [
  ...AGENTIC_EXEMPT_PLUGINS,
  ...DATASET_EXEMPT_PLUGINS,
] as const;
export type StrategyExemptPlugin = (typeof STRATEGY_EXEMPT_PLUGINS)[number];

export type Plugin =
  | AdditionalPlugin
  | BasePlugin
  | Collection
  | ConfigRequiredPlugin
  | HarmPlugin
  | PIIPlugin
  | BiasPlugin
  | AgenticPlugin;

export const DEFAULT_PLUGINS: ReadonlySet<Plugin> = new Set([
  ...[
    ...BASE_PLUGINS,
    ...(Object.keys(HARM_PLUGINS) as HarmPlugin[]),
    ...PII_PLUGINS,
    ...BIAS_PLUGINS,
  ].sort(),
] as const satisfies readonly Plugin[]);

export const ALL_PLUGINS: readonly Plugin[] = [
  ...new Set([
    ...DEFAULT_PLUGINS,
    ...ADDITIONAL_PLUGINS,
    ...CONFIG_REQUIRED_PLUGINS,
    ...AGENTIC_PLUGINS,
  ]),
].sort() as Plugin[];

export const PLUGIN_CATEGORIES = {
  bias: BIAS_PLUGINS,
  financial: FINANCIAL_PLUGINS,
  harmful: Object.keys(HARM_PLUGINS),
  pii: PII_PLUGINS,
  medical: MEDICAL_PLUGINS,
} as const;
