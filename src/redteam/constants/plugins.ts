export const DEFAULT_NUM_TESTS_PER_PLUGIN = 5;

// Inject variable name used in multi-input mode to prevent namespace collisions
// with user-defined input variable names
export const MULTI_INPUT_VAR = '__prompt';

// Redteam configuration defaults
export const REDTEAM_DEFAULTS = {
  MAX_CONCURRENCY: 4,
  NUM_TESTS: 10,
} as const;

export const REDTEAM_MODEL = 'openai:chat:gpt-5-2025-08-07';

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

export const MCP_PLUGINS = ['mcp', 'pii', 'bfla', 'bola', 'sql-injection', 'rbac'] as const;

export const AGENTIC_PLUGINS = ['agentic:memory-poisoning'] as const;
export type AgenticPlugin = (typeof AGENTIC_PLUGINS)[number];

// Plugins that require HuggingFace API keys for their datasets
export const HUGGINGFACE_GATED_PLUGINS = ['beavertails', 'unsafebench', 'aegis'] as const;
export type HuggingFaceGatedPlugin = (typeof HUGGINGFACE_GATED_PLUGINS)[number];

export const COLLECTIONS = [
  'default',
  'foundation',
  'harmful',
  'pii',
  'bias',
  'medical',
  'pharmacy',
  'insurance',
  'financial',
  'ecommerce',
  'telecom',
  'realestate',
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
  'medical:off-label-use',
  'medical:prioritization-error',
  'medical:sycophancy',
] as const;

export const FINANCIAL_PLUGINS = [
  'financial:calculation-error',
  'financial:compliance-violation',
  'financial:confidential-disclosure',
  'financial:counterfactual',
  'financial:data-leakage',
  'financial:defamation',
  'financial:hallucination',
  'financial:impartiality',
  'financial:misconduct',
  'financial:sycophancy',
] as const;

export const PHARMACY_PLUGINS = [
  'pharmacy:controlled-substance-compliance',
  'pharmacy:dosage-calculation',
  'pharmacy:drug-interaction',
] as const;

export const INSURANCE_PLUGINS = [
  'insurance:coverage-discrimination',
  'insurance:network-misinformation',
  'insurance:phi-disclosure',
] as const;

export const ECOMMERCE_PLUGINS = [
  'ecommerce:compliance-bypass',
  'ecommerce:order-fraud',
  'ecommerce:pci-dss',
  'ecommerce:price-manipulation',
] as const;

export const TELECOM_PLUGINS = [
  'telecom:cpni-disclosure',
  'telecom:location-disclosure',
  'telecom:account-takeover',
  'telecom:e911-misinformation',
  'telecom:tcpa-violation',
  'telecom:unauthorized-changes',
  'telecom:fraud-enablement',
  'telecom:porting-misinformation',
  'telecom:billing-misinformation',
  'telecom:coverage-misinformation',
  'telecom:law-enforcement-request-handling',
  'telecom:accessibility-violation',
] as const;

export const REALESTATE_PLUGINS = [
  'realestate:fair-housing-discrimination',
  'realestate:steering',
  'realestate:discriminatory-listings',
  'realestate:lending-discrimination',
  'realestate:valuation-bias',
  'realestate:accessibility-discrimination',
  'realestate:advertising-discrimination',
  'realestate:source-of-income',
] as const;

export type PIIPlugin = (typeof PII_PLUGINS)[number];
export type BiasPlugin = (typeof BIAS_PLUGINS)[number];
export type MedicalPlugin = (typeof MEDICAL_PLUGINS)[number];
export type PharmacyPlugin = (typeof PHARMACY_PLUGINS)[number];
export type InsurancePlugin = (typeof INSURANCE_PLUGINS)[number];
export type EcommercePlugin = (typeof ECOMMERCE_PLUGINS)[number];
export type TelecomPlugin = (typeof TELECOM_PLUGINS)[number];
export type RealEstatePlugin = (typeof REALESTATE_PLUGINS)[number];

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
  'coppa',
  'cross-session-leak',
  'cyberseceval',
  'data-exfil',
  'debug-access',
  'divergent-repetition',
  'donotanswer',
  'ferpa',
  'harmbench',
  'toxic-chat',
  'imitation',
  'indirect-prompt-injection',
  'mcp',
  'medical:anchoring-bias',
  'medical:hallucination',
  'medical:incorrect-knowledge',
  'medical:off-label-use',
  'medical:prioritization-error',
  'medical:sycophancy',
  'financial:calculation-error',
  'financial:compliance-violation',
  'financial:confidential-disclosure',
  'financial:counterfactual',
  'financial:data-leakage',
  'financial:defamation',
  'financial:hallucination',
  'financial:impartiality',
  'financial:misconduct',
  'financial:sycophancy',
  'ecommerce:compliance-bypass',
  'ecommerce:order-fraud',
  'ecommerce:pci-dss',
  'ecommerce:price-manipulation',
  'goal-misalignment',
  'insurance:coverage-discrimination',
  'insurance:network-misinformation',
  'insurance:phi-disclosure',
  'off-topic',
  'overreliance',
  'pharmacy:controlled-substance-compliance',
  'pharmacy:dosage-calculation',
  'pharmacy:drug-interaction',
  'telecom:cpni-disclosure',
  'telecom:location-disclosure',
  'telecom:account-takeover',
  'telecom:e911-misinformation',
  'telecom:tcpa-violation',
  'telecom:unauthorized-changes',
  'telecom:fraud-enablement',
  'telecom:porting-misinformation',
  'telecom:billing-misinformation',
  'telecom:coverage-misinformation',
  'telecom:law-enforcement-request-handling',
  'telecom:accessibility-violation',
  'realestate:fair-housing-discrimination',
  'realestate:steering',
  'realestate:discriminatory-listings',
  'realestate:lending-discrimination',
  'realestate:valuation-bias',
  'realestate:accessibility-discrimination',
  'realestate:advertising-discrimination',
  'realestate:source-of-income',
  'pliny',
  'prompt-extraction',
  'rag-document-exfiltration',
  'rag-poisoning',
  'rag-source-attribution',
  'rbac',
  'reasoning-dos',
  'religion',
  'shell-injection',
  'special-token-injection',
  'sql-injection',
  'ssrf',
  'system-prompt-override',
  'tool-discovery',
  'unsafebench',
  'unverifiable-claims',
  'vlguard',
  'vlsu',
  'wordplay',
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
export const DATASET_EXEMPT_PLUGINS = [
  'aegis',
  'beavertails',
  'cyberseceval',
  'donotanswer',
  'harmbench',
  'pliny',
  'toxic-chat',
  'unsafebench',
  'vlguard',
  'vlsu',
  'xstest',
] as const;

// Plugins excluded from multi-input mode (in addition to dataset plugins)
export const MULTI_INPUT_EXCLUDED_PLUGINS = [
  'cca',
  'cross-session-leak',
  'special-token-injection',
  'system-prompt-override',
  'ascii-smuggling',
] as const;
export type MultiInputExcludedPlugin = (typeof MULTI_INPUT_EXCLUDED_PLUGINS)[number];

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

export const MINIMAL_TEST_PLUGINS: ReadonlySet<Plugin> = new Set([
  'harmful:hate',
  'harmful:self-harm',
] as const satisfies readonly Plugin[]);

export const RAG_PLUGINS: ReadonlySet<Plugin> = new Set([
  ...DEFAULT_PLUGINS,
  'bola',
  'bfla',
  'rbac',
  'rag-source-attribution',
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
  ecommerce: ECOMMERCE_PLUGINS,
  financial: FINANCIAL_PLUGINS,
  harmful: Object.keys(HARM_PLUGINS),
  pii: PII_PLUGINS,
  medical: MEDICAL_PLUGINS,
  pharmacy: PHARMACY_PLUGINS,
  insurance: INSURANCE_PLUGINS,
  telecom: TELECOM_PLUGINS,
  realestate: REALESTATE_PLUGINS,
} as const;

// Plugins registered via createRemotePlugin() in plugins/index.ts
// These have no local implementation and always call the remote API
export const REMOTE_ONLY_PLUGIN_IDS = [
  'agentic:memory-poisoning',
  'ascii-smuggling',
  'bfla',
  'bola',
  'cca',
  'competitors',
  'coppa',
  'data-exfil',
  'ferpa',
  'goal-misalignment',
  'harmful:misinformation-disinformation',
  'harmful:specialized-advice',
  'hijacking',
  'indirect-prompt-injection',
  'mcp',
  'off-topic',
  'rag-document-exfiltration',
  'rag-poisoning',
  'rag-source-attribution',
  'reasoning-dos',
  'religion',
  'special-token-injection',
  'ssrf',
  'system-prompt-override',
  'wordplay',
  ...MEDICAL_PLUGINS,
  ...FINANCIAL_PLUGINS,
  ...PHARMACY_PLUGINS,
  ...INSURANCE_PLUGINS,
  ...ECOMMERCE_PLUGINS,
  ...TELECOM_PLUGINS,
  ...REALESTATE_PLUGINS,
] as const;

// Plugins that frontend should disable when remote generation is unavailable
// Superset of REMOTE_ONLY_PLUGIN_IDS plus harm/bias plugins
// Used by frontend UI to gray out plugins when PROMPTFOO_DISABLE_REMOTE_GENERATION is set
export const UI_DISABLED_WHEN_REMOTE_UNAVAILABLE = [
  ...Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS),
  ...BIAS_PLUGINS,
  ...REMOTE_ONLY_PLUGIN_IDS,
] as const;
