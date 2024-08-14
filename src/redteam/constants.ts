export const DEFAULT_NUM_TESTS_PER_PLUGIN = 5;

export const REDTEAM_MODEL = 'openai:chat:gpt-4o';

export const LLAMA_GUARD_REPLICATE_PROVIDER =
  'replicate:moderation:meta/meta-llama-guard-2-8b:b063023ee937f28e922982abdbf97b041ffe34ad3b35a53d33e1d74bb19b36c4';

export const LLAMA_GUARD_ENABLED_CATEGORIES = [
  'S1', // Violent Crimes
  'S2', // Non-Violent Crimes
  'S3', // Sex Crimes
  'S4', // Child Exploitation
  'S5', // Specialized Advice
  // 'S6', // Privacy - Disabled due to false positives from allowed entities
  'S7', // Intellectual Property
  'S8', // Indiscriminate Weapons
  'S9', // Hate
  'S10', // Self-Harm
  'S11', // Sexual Content
];

export const COLLECTIONS = ['harmful', 'pii', 'default'] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const UNALIGNED_PROVIDER_HARM_PLUGINS = {
  // MLCommons harm categories
  // https://llama.meta.com/docs/model-cards-and-prompt-formats/meta-llama-guard-2/
  'harmful:violent-crime': 'Violent Crimes',
  'harmful:non-violent-crime': 'Non-Violent Crimes',
  'harmful:sex-crime': 'Sex Crimes',
  'harmful:child-exploitation': 'Child Exploitation',
  'harmful:indiscriminate-weapons': 'Indiscriminate Weapons',
  'harmful:hate': 'Hate',
  'harmful:self-harm': 'Self-Harm',
  'harmful:sexual-content': 'Sexual Content',

  // Harmbench taxonomy
  // https://arxiv.org/pdf/2402.04249
  'harmful:cybercrime': 'Cybercrime & Unauthorized Intrusion - Hacking and Malware',
  'harmful:chemical-biological-weapons': 'Chemical & Biological Weapons',
  'harmful:illegal-drugs': 'Illegal Drugs',
  'harmful:copyright-violations': 'Copyright Violations - Copyrighted text',
  'harmful:harassment-bullying': 'Harassment & Bullying',
  'harmful:illegal-activities': 'Illegal Activities - Fraud & scams',
  'harmful:graphic-content': 'Graphic & age-restricted content',
  'harmful:unsafe-practices': 'Promotion of unsafe practices',
  //'harmful:privacy-violations': 'Privacy violations & data exploitation',  // redundant with MLCommons category

  // Other
  'harmful:radicalization': 'Radicalization',
  'harmful:profanity': 'Requests containing profanity',
  'harmful:insults': 'Insults and personal attacks',
  //'scam_fraud_creation',
  //'locale_specific_illegal (e.g. hate speech in Germany, alcohol in Saudi Arabia)',
} as const;
export type UnalignedProviderHarmPlugin = keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS;

export const REDTEAM_PROVIDER_HARM_PLUGINS = {
  'harmful:privacy': 'Privacy violations',
  'harmful:intellectual-property': 'Intellectual Property violation',
  'harmful:misinformation-disinformation':
    'Misinformation & Disinformation - Harmful lies and propaganda',
  'harmful:specialized-advice': 'Specialized Advice - Financial',
} as const;
export type RedTeamProviderHarmPlugin = keyof typeof REDTEAM_PROVIDER_HARM_PLUGINS;

export const HARM_PLUGINS = {
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
  'overreliance',
  'politics',
] as const;
export type BasePlugin = (typeof BASE_PLUGINS)[number];

export const ADDITIONAL_PLUGINS = [
  'bola',
  'bfla',
  'competitors',
  'debug-access',
  'imitation',
  'rbac',
  'ssrf',
  'shell-injection',
  'sql-injection',
  'systemprompt'
] as const;
export type AdditionalPlugin = (typeof ADDITIONAL_PLUGINS)[number];

// Plugins that require configuration and can't be enabled by default or included as additional.
export const CONFIG_REQUIRED_PLUGINS = ['policy'] as const;
export type ConfigRequiredPlugin = (typeof CONFIG_REQUIRED_PLUGINS)[number];

export type Plugin =
  | Collection
  | HarmPlugin
  | PIIPlugin
  | BasePlugin
  | AdditionalPlugin
  | ConfigRequiredPlugin;

export const DEFAULT_PLUGINS: ReadonlySet<Plugin> = new Set([
  ...COLLECTIONS,
  ...BASE_PLUGINS,
  ...(Object.keys(HARM_PLUGINS) as HarmPlugin[]),
  ...PII_PLUGINS,
] as const satisfies readonly Plugin[]);

export const ALL_PLUGINS: readonly Plugin[] = [
  ...new Set([...DEFAULT_PLUGINS, ...ADDITIONAL_PLUGINS, ...CONFIG_REQUIRED_PLUGINS]),
].sort() as Plugin[];

export const DEFAULT_STRATEGIES = ['jailbreak', 'prompt-injection'] as const;
export type DefaultStrategy = (typeof DEFAULT_STRATEGIES)[number];

export const ADDITIONAL_STRATEGIES = ['jailbreak:tree', 'rot13', 'base64', 'leetspeak'] as const;
export type AdditionalStrategy = (typeof ADDITIONAL_STRATEGIES)[number];

export const ALL_STRATEGIES = [
  'basic',
  'default',
  ...DEFAULT_STRATEGIES,
  ...ADDITIONAL_STRATEGIES,
] as const;
export type Strategy = (typeof ALL_STRATEGIES)[number];

// Duplicated in src/web/nextui/src/app/report/constants.ts for frontend
export const subCategoryDescriptions: Record<Plugin | Strategy, string> = {
  default: 'Includes common plugins',
  basic: 'Raw attacks without any special attack strategies.',
  bola: 'Broken Object Level Authorization (BOLA) tests.',
  bfla: 'Broken Function Level Authorization (BFLA) tests.',
  ssrf: 'Server-Side Request Forgery (SSRF) tests.',
  'debug-access': 'Attempts to access or use debugging commands.',
  'excessive-agency': 'Model taking excessive initiative or misunderstanding its capabilities.',
  'harmful:chemical-biological-weapons': 'Content related to chemical or biological weapons',
  'harmful:child-exploitation': 'Content exploiting or harming children.',
  'harmful:copyright-violations': 'Content violating copyright laws.',
  'harmful:cybercrime': 'Content related to cybercriminal activities.',
  'harmful:graphic-content': 'Displaying graphic or violent content.',
  'harmful:harassment-bullying': 'Content that harasses or bullies individuals.',
  'harmful:hate': 'Content that promotes hate or discrimination.',
  'harmful:illegal-activities': 'Content promoting illegal activities.',
  'harmful:illegal-drugs': 'Content related to illegal drug use or trade.',
  'harmful:indiscriminate-weapons': 'Content related to weapons without context.',
  'harmful:insults': 'Content that insults or demeans individuals.',
  'harmful:intellectual-property': 'Content violating intellectual property rights.',
  'harmful:misinformation-disinformation': 'Spreading false or misleading information.',
  'harmful:non-violent-crime': 'Content related to non-violent criminal activities.',
  'harmful:privacy': 'Content violating privacy rights.',
  'harmful:profanity': 'Content containing profane or inappropriate language.',
  'harmful:radicalization': 'Content that promotes radical or extremist views.',
  'harmful:self-harm': 'Content that encourages self-harm or suicide.',
  'harmful:sex-crime': 'Content related to sexual crimes.',
  'harmful:sexual-content': 'Explicit or inappropriate sexual content.',
  'harmful:specialized-advice': 'Providing advice in specialized fields without expertise.',
  'harmful:unsafe-practices': 'Content promoting unsafe or harmful practices.',
  'harmful:violent-crime': 'Content related to violent criminal activities.',
  'jailbreak:tree':
    'Experimental: More expensive and time-consuming jailbreak technique for improved results.',
  'pii:api-db': 'PII exposed through API or database',
  'pii:direct': 'Direct exposure of PII',
  'pii:session': 'PII exposed in session data',
  'pii:social': 'PII exposed through social engineering',
  'prompt-injection': "Malicious inputs designed to manipulate the model's behavior.",
  'shell-injection': 'Attempts to execute shell commands through the model.',
  'sql-injection': 'Attempts to perform SQL injection attacks to manipulate database queries.',
  base64: 'Attempts to obfuscate malicious content using Base64 encoding.',
  competitors: 'Competitor mentions and endorsements',
  contracts: 'Enters business or legal commitments without supervision.',
  hallucination: 'Model generating false or misleading information.',
  harmful: 'All harmful categories',
  hijacking: 'Unauthorized or off-topic resource use.',
  imitation: 'Imitates people, brands, or organizations.',
  jailbreak: 'Attempts to bypass security measures through iterative prompt refinement.',
  leetspeak: 'Attempts to obfuscate malicious content using leetspeak.',
  overreliance: 'Model susceptible to relying on an incorrect user assumption or input.',
  pii: 'All PII categories',
  policy: 'Violates a custom configured policy.',
  politics: 'Makes political statements.',
  rbac: 'Tests whether the model properly implements Role-Based Access Control (RBAC).',
  rot13: 'Attempts to obfuscate malicious content using ROT13 encoding.',
  'systemprompt': 'Attempts to extract the system prompt from the LLM that is being tested.'
};
