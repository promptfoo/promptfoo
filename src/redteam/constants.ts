import { getEnvString } from '../envars';

export const REMOTE_GENERATION_URL = getEnvString(
  'PROMPTFOO_REMOTE_GENERATION_URL',
  'https://api.promptfoo.dev/v1/generate',
);

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
  'cross-session-leak',
  'excessive-agency',
  'hallucination',
  'hijacking',
  'overreliance',
  'politics',
] as const;
export type BasePlugin = (typeof BASE_PLUGINS)[number];

export const ADDITIONAL_PLUGINS = [
  'ascii-smuggling',
  'bfla',
  'bola',
  'competitors',
  'debug-access',
  'imitation',
  'indirect-prompt-injection',
  'prompt-extraction',
  'rbac',
  'religion',
  'shell-injection',
  'sql-injection',
  'ssrf',
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

export const FRAMEWORK_NAMES: Record<string, string> = {
  'nist:ai:measure': 'NIST AI RMF',
  'owasp:llm': 'OWASP LLM Top 10',
  'owasp:api': 'OWASP API Top 10',
  'mitre:atlas': 'MITRE ATLAS',
};

export const OWASP_LLM_TOP_10_MAPPING: Record<
  string,
  { plugins: Plugin[]; strategies: Strategy[] }
> = {
  'owasp:llm:01': {
    plugins: ['harmful'],
    strategies: ['prompt-injection', 'jailbreak'],
  },
  'owasp:llm:02': {
    plugins: ['harmful', 'overreliance'],
    strategies: [],
  },
  'owasp:llm:03': {
    plugins: ['harmful', 'overreliance', 'hallucination'],
    strategies: [],
  },
  'owasp:llm:06': {
    plugins: ['harmful:privacy', 'pii:direct', 'pii:api-db', 'pii:session', 'pii:social'],
    strategies: ['prompt-injection', 'jailbreak'],
  },
  'owasp:llm:07': {
    plugins: ['rbac', 'bola', 'bfla', 'sql-injection', 'shell-injection', 'debug-access'],
    strategies: [],
  },
  'owasp:llm:08': {
    plugins: ['excessive-agency', 'rbac'],
    strategies: [],
  },
  'owasp:llm:09': {
    plugins: ['overreliance', 'hallucination'],
    strategies: [],
  },
};

export const OWASP_API_TOP_10_MAPPING: Record<
  string,
  { plugins: Plugin[]; strategies: Strategy[] }
> = {
  'owasp:api:01': {
    plugins: ['bola', 'rbac'],
    strategies: [],
  },
  'owasp:api:02': {
    plugins: ['bfla', 'rbac'],
    strategies: [],
  },
  'owasp:api:03': {
    plugins: ['excessive-agency', 'overreliance'],
    strategies: [],
  },
  'owasp:api:04': {
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:session'],
    strategies: [],
  },
  'owasp:api:05': {
    plugins: ['rbac', 'bola', 'bfla'],
    strategies: [],
  },
  'owasp:api:06': {
    plugins: ['harmful:misinformation-disinformation', 'overreliance'],
    strategies: [],
  },
  'owasp:api:07': {
    plugins: ['sql-injection', 'shell-injection'],
    strategies: [],
  },
  'owasp:api:08': {
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:session'],
    strategies: [],
  },
  'owasp:api:09': {
    plugins: ['overreliance', 'harmful:specialized-advice'],
    strategies: [],
  },
  'owasp:api:10': {
    plugins: ['debug-access', 'harmful:privacy'],
    strategies: [],
  },
};

export const NIST_AI_RMF_MAPPING: Record<string, { plugins: Plugin[]; strategies: Strategy[] }> = {
  'nist:ai:measure:1.1': {
    plugins: ['harmful:misinformation-disinformation', 'excessive-agency'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'nist:ai:measure:1.2': {
    plugins: ['harmful:misinformation-disinformation', 'excessive-agency'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'nist:ai:measure:2.1': {
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:session', 'pii:direct', 'pii:social'],
    strategies: [],
  },
  'nist:ai:measure:2.2': {
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:session', 'pii:direct', 'pii:social'],
    strategies: [],
  },
  'nist:ai:measure:2.3': {
    plugins: ['excessive-agency'],
    strategies: [],
  },
  'nist:ai:measure:2.4': {
    plugins: ['excessive-agency', 'harmful:misinformation-disinformation'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'nist:ai:measure:2.5': {
    plugins: ['excessive-agency'],
    strategies: [],
  },
  'nist:ai:measure:2.6': {
    plugins: [
      'harmful:unsafe-practices',
      'harmful:chemical-biological-weapons',
      'harmful:indiscriminate-weapons',
    ],
    strategies: [],
  },
  'nist:ai:measure:2.7': {
    plugins: ['harmful:cybercrime', 'sql-injection', 'shell-injection'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'nist:ai:measure:2.8': {
    plugins: ['rbac', 'bola', 'bfla'],
    strategies: [],
  },
  'nist:ai:measure:2.9': {
    plugins: ['excessive-agency'],
    strategies: [],
  },
  'nist:ai:measure:2.10': {
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:session', 'pii:direct', 'pii:social'],
    strategies: [],
  },
  'nist:ai:measure:2.11': {
    plugins: ['harmful:hate', 'harmful:harassment-bullying', 'harmful:insults'],
    strategies: [],
  },
  'nist:ai:measure:2.12': {
    plugins: [],
    strategies: [],
  },
  'nist:ai:measure:2.13': {
    plugins: ['excessive-agency'],
    strategies: [],
  },
  'nist:ai:measure:3.1': {
    plugins: ['excessive-agency', 'harmful:misinformation-disinformation'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'nist:ai:measure:3.2': {
    plugins: ['excessive-agency'],
    strategies: [],
  },
  'nist:ai:measure:3.3': {
    plugins: ['excessive-agency'],
    strategies: [],
  },
  'nist:ai:measure:4.1': {
    plugins: ['excessive-agency'],
    strategies: [],
  },
  'nist:ai:measure:4.2': {
    plugins: ['excessive-agency', 'harmful:misinformation-disinformation'],
    strategies: [],
  },
  'nist:ai:measure:4.3': {
    plugins: ['excessive-agency'],
    strategies: [],
  },
};

export const MITRE_ATLAS_MAPPING: Record<string, { plugins: Plugin[]; strategies: Strategy[] }> = {
  'mitre:atlas:reconnaissance': {
    plugins: ['competitors', 'policy', 'rbac', 'prompt-extraction'],
    strategies: ['multilingual'],
  },
  'mitre:atlas:resource-development': {
    plugins: ['harmful:cybercrime', 'harmful:illegal-drugs', 'harmful:indiscriminate-weapons'],
    strategies: [],
  },
  'mitre:atlas:initial-access': {
    plugins: ['harmful:cybercrime', 'sql-injection', 'shell-injection', 'ssrf', 'debug-access'],
    strategies: ['jailbreak', 'prompt-injection', 'base64', 'leetspeak', 'rot13'],
  },
  'mitre:atlas:ml-attack-staging': {
    plugins: ['excessive-agency', 'hallucination', 'ascii-smuggling', 'indirect-prompt-injection'],
    strategies: ['jailbreak', 'jailbreak:tree'],
  },
  'mitre:atlas:exfiltration': {
    plugins: [
      'harmful:privacy',
      'pii:api-db',
      'pii:session',
      'pii:direct',
      'pii:social',
      'indirect-prompt-injection',
      'prompt-extraction',
      'ascii-smuggling',
    ],
    strategies: [],
  },
  'mitre:atlas:impact': {
    plugins: ['harmful', 'excessive-agency', 'hijacking', 'imitation'],
    strategies: ['crescendo'],
  },
};

// Aliased plugins are like collections, except they are hidden from the standard plugin list.
export const ALIASED_PLUGINS = [
  'owasp:llm',
  'owasp:api',
  'nist:ai',
  'nist:ai:measure',
  'mitre:atlas',
  ...Object.keys(OWASP_LLM_TOP_10_MAPPING),
  ...Object.keys(OWASP_API_TOP_10_MAPPING),
  ...Object.keys(NIST_AI_RMF_MAPPING),
  ...Object.keys(MITRE_ATLAS_MAPPING),
] as const;

export const ALIASED_PLUGIN_MAPPINGS: Record<
  string,
  Record<string, { plugins: string[]; strategies: string[] }>
> = {
  'nist:ai:measure': NIST_AI_RMF_MAPPING,
  'owasp:llm': OWASP_LLM_TOP_10_MAPPING,
  'owasp:api': OWASP_API_TOP_10_MAPPING,
  'mitre:atlas': MITRE_ATLAS_MAPPING,
};

export const DEFAULT_STRATEGIES = ['jailbreak', 'prompt-injection'] as const;
export type DefaultStrategy = (typeof DEFAULT_STRATEGIES)[number];

export const ADDITIONAL_STRATEGIES = [
  'ascii-smuggling',
  'base64',
  'crescendo',
  'jailbreak:tree',
  'leetspeak',
  'math-prompt',
  'multilingual',
  'rot13',
] as const;
export type AdditionalStrategy = (typeof ADDITIONAL_STRATEGIES)[number];

export const ALL_STRATEGIES = [
  'basic',
  'default',
  ...DEFAULT_STRATEGIES,
  ...ADDITIONAL_STRATEGIES,
] as const;
export type Strategy = (typeof ALL_STRATEGIES)[number];

export const subCategoryDescriptions: Record<Plugin | Strategy, string> = {
  default: 'Includes common plugins',
  basic: 'Raw attacks without any special attack strategies',
  'ascii-smuggling': 'Attempts to obfuscate malicious content using ASCII smuggling',
  base64: 'Attempts to obfuscate malicious content using Base64 encoding',
  bfla: 'Broken Function Level Authorization (BFLA) tests',
  bola: 'Broken Object Level Authorization (BOLA) tests',
  competitors: 'Competitor mentions and endorsements',
  contracts: 'Enters business or legal commitments without supervision',
  crescendo: 'Conversational attack strategy (high cost)',
  'cross-session-leak': 'Checks for information sharing between unrelated sessions',
  'debug-access': 'Attempts to access or use debugging commands',
  'excessive-agency': 'Model taking excessive initiative or misunderstanding its capabilities',
  hallucination: 'Model generating false or misleading information',
  harmful: 'All harmful categories',
  'harmful:chemical-biological-weapons': 'Content related to chemical or biological weapons',
  'harmful:child-exploitation': 'Content exploiting or harming children',
  'harmful:copyright-violations': 'Content violating copyright laws',
  'harmful:cybercrime': 'Content related to cybercriminal activities',
  'harmful:graphic-content': 'Displaying graphic or violent content',
  'harmful:harassment-bullying': 'Content that harasses or bullies individuals',
  'harmful:hate': 'Content that promotes hate or discrimination',
  'harmful:illegal-activities': 'Content promoting illegal activities',
  'harmful:illegal-drugs': 'Content related to illegal drug use or trade',
  'harmful:indiscriminate-weapons': 'Content related to weapons without context',
  'harmful:insults': 'Content that insults or demeans individuals',
  'harmful:intellectual-property': 'Content violating intellectual property rights',
  'harmful:misinformation-disinformation': 'Spreading false or misleading information',
  'harmful:non-violent-crime': 'Content related to non-violent criminal activities',
  'harmful:privacy': 'Content violating privacy rights',
  'harmful:profanity': 'Content containing profane or inappropriate language',
  'harmful:radicalization': 'Content that promotes radical or extremist views',
  'harmful:self-harm': 'Content that encourages self-harm or suicide',
  'harmful:sex-crime': 'Content related to sexual crimes',
  'harmful:sexual-content': 'Explicit or inappropriate sexual content',
  'harmful:specialized-advice': 'Providing advice in specialized fields without expertise',
  'harmful:unsafe-practices': 'Content promoting unsafe or harmful practices',
  'harmful:violent-crime': 'Content related to violent criminal activities',
  hijacking: 'Unauthorized or off-topic resource use',
  imitation: 'Imitates people, brands, or organizations',
  'indirect-prompt-injection':
    'Tests if the prompt is vulnerable to instructions injected into variables in the prompt',
  jailbreak: 'Attempts to bypass security measures through iterative prompt refinement',
  'jailbreak:tree': 'Tree-based jailbreak search (medium cost)',
  leetspeak: 'Attempts to obfuscate malicious content using leetspeak',
  'math-prompt': 'Encodes potentially harmful content using mathematical concepts and notation',
  multilingual: 'Translates the input into low-resource languages',
  overreliance: 'Model susceptible to relying on an incorrect user assumption or input',
  pii: 'All PII categories',
  'pii:api-db': 'PII exposed through API or database',
  'pii:direct': 'Direct exposure of PII',
  'pii:session': 'PII exposed in session data',
  'pii:social': 'PII exposed through social engineering',
  policy: 'Violates a custom configured policy',
  politics: 'Makes political statements',
  'prompt-extraction': 'Attempts to get the model to reveal its system prompt',
  'prompt-injection': "Malicious inputs designed to manipulate the model's behavior",
  rbac: 'Tests whether the model properly implements Role-Based Access Control (RBAC)',
  religion: 'Makes potentially controversial statements about religion',
  rot13: 'Attempts to obfuscate malicious content using ROT13 encoding',
  'shell-injection': 'Attempts to execute shell commands through the model',
  'sql-injection': 'Attempts to perform SQL injection attacks to manipulate database queries',
  ssrf: 'Server-Side Request Forgery (SSRF) tests',
};

// These names are displayed in risk cards and in the table
export const displayNameOverrides: Record<Plugin | Strategy, string> = {
  'ascii-smuggling': 'ASCII smuggling',
  bfla: 'Privilege Escalation',
  bola: 'Unauthorized Data Access',
  competitors: 'Competitor Endorsements',
  contracts: 'Unsupervised Contracts',
  'cross-session-leak': 'Cross-Session Leak',
  'debug-access': 'Debug Access',
  'excessive-agency': 'Excessive Agency',
  hallucination: 'Hallucination',
  harmful: 'Harmful Content',
  'harmful:chemical-biological-weapons': 'Chemical & Biological Weapons',
  'harmful:child-exploitation': 'Child Exploitation',
  'harmful:copyright-violations': 'Copyright Violations',
  'harmful:cybercrime': 'Cybercrime',
  'harmful:graphic-content': 'Graphic Content',
  'harmful:harassment-bullying': 'Harassment & Bullying',
  'harmful:hate': 'Hate Speech',
  'harmful:illegal-activities': 'Illegal Activities',
  'harmful:illegal-drugs': 'Illegal Drugs',
  'harmful:indiscriminate-weapons': 'Indiscriminate Weapons',
  'harmful:insults': 'Insults',
  'harmful:intellectual-property': 'Intellectual Property Violation',
  'harmful:misinformation-disinformation': 'Misinformation & Disinformation',
  'harmful:non-violent-crime': 'Non-Violent Crime',
  'harmful:privacy': 'Privacy Violation',
  'harmful:profanity': 'Profanity',
  'harmful:radicalization': 'Radicalization',
  'harmful:self-harm': 'Self-Harm',
  'harmful:sex-crime': 'Sex Crime',
  'harmful:sexual-content': 'Sexual Content',
  'harmful:specialized-advice': 'Specialized Advice',
  'harmful:unsafe-practices': 'Unsafe Practices',
  'harmful:violent-crime': 'Violent Crime',
  hijacking: 'Hijacking',
  imitation: 'Imitation',
  'indirect-prompt-injection': 'Indirect Prompt Injection',
  jailbreak: 'Single-shot optimization',
  'jailbreak:tree': 'Tree-based optimization',
  'math-prompt': 'Math Prompt',
  multilingual: 'Multilingual',
  overreliance: 'Overreliance',
  pii: 'PII Leaks',
  'pii:api-db': 'PII in API/Database',
  'pii:direct': 'Direct PII Exposure',
  'pii:session': 'PII in Session Data',
  'pii:social': 'PII via Social Engineering',
  policy: 'Custom Policy',
  politics: 'Political Opinions',
  'prompt-extraction': 'Prompt Extraction',
  'prompt-injection': 'Prompt Injection',
  rbac: 'RBAC Enforcement',
  religion: 'Religious Sensitivity',
  'shell-injection': 'Shell Injection',
  'sql-injection': 'SQL Injection',
  ssrf: 'Malicious Resource Fetching',
  default: 'Default',
  basic: 'Basic',
  base64: 'Base64 Encoding',
  crescendo: 'Crescendo',
  leetspeak: 'Leetspeak Encoding',
  rot13: 'ROT13 Encoding',
};

export enum Severity {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
}

export const riskCategorySeverityMap: Record<Plugin, Severity> = {
  'ascii-smuggling': Severity.Low,
  'cross-session-leak': Severity.Medium,
  'debug-access': Severity.High,
  'excessive-agency': Severity.Medium,
  'harmful:child-exploitation': Severity.Critical,
  'harmful:copyright-violations': Severity.Low,
  'harmful:cybercrime': Severity.Low,
  'harmful:graphic-content': Severity.Medium,
  'harmful:harassment-bullying': Severity.Low,
  'harmful:hate': Severity.Critical,
  'harmful:illegal-activities': Severity.Medium,
  'harmful:illegal-drugs': Severity.Medium,
  'harmful:indiscriminate-weapons': Severity.Medium,
  'harmful:insults': Severity.Low,
  'harmful:intellectual-property': Severity.Medium,
  'harmful:misinformation-disinformation': Severity.Medium,
  'harmful:non-violent-crime': Severity.Medium,
  'harmful:privacy': Severity.High,
  'harmful:profanity': Severity.Low,
  'harmful:radicalization': Severity.Low,
  'harmful:self-harm': Severity.Critical,
  'harmful:sex-crime': Severity.High,
  'harmful:sexual-content': Severity.Medium,
  'harmful:specialized-advice': Severity.Medium,
  'harmful:unsafe-practices': Severity.Low,
  'harmful:violent-crime': Severity.High,
  'shell-injection': Severity.High,
  'sql-injection': Severity.High,
  competitors: Severity.Low,
  contracts: Severity.Medium,
  hallucination: Severity.Medium,
  hijacking: Severity.High,
  imitation: Severity.Low,
  overreliance: Severity.Low,
  pii: Severity.High,
  politics: Severity.Low,
  rbac: Severity.High,
  policy: Severity.High,
  bola: Severity.High,
  bfla: Severity.High,
  religion: Severity.Low,
  ssrf: Severity.High,
  'indirect-prompt-injection': Severity.High,
  'prompt-extraction': Severity.Medium,
  harmful: Severity.Medium,
  default: Severity.Low,
  'harmful:chemical-biological-weapons': Severity.High,
  'pii:api-db': Severity.High,
  'pii:direct': Severity.High,
  'pii:session': Severity.High,
  'pii:social': Severity.High,
};

export const riskCategories: Record<string, Plugin[]> = {
  'Security Risk': [
    'bola',
    'bfla',
    'debug-access',
    'hijacking',
    'pii',
    'prompt-extraction',
    'rbac',
    'shell-injection',
    'sql-injection',
    'ssrf',
    'indirect-prompt-injection',
    'cross-session-leak',
  ],
  'Legal Risk': [
    'contracts',
    'harmful:child-exploitation',
    'harmful:copyright-violations',
    'harmful:cybercrime',
    'harmful:hate',
    'harmful:illegal-activities',
    'harmful:illegal-drugs',
    'harmful:intellectual-property',
    'harmful:privacy',
    'harmful:self-harm',
    'harmful:sex-crime',
    'harmful:sexual-content',
    'harmful:specialized-advice',
    'harmful:violent-crime',
  ],
  'Brand Risk': [
    'policy',
    'competitors',
    'excessive-agency',
    'hallucination',
    'harmful:graphic-content',
    'harmful:harassment-bullying',
    'harmful:indiscriminate-weapons',
    'harmful:insults',
    'harmful:misinformation-disinformation',
    'harmful:non-violent-crime',
    'harmful:profanity',
    'harmful:radicalization',
    'harmful:unsafe-practices',
    'imitation',
    'overreliance',
    'politics',
    'religion',
  ],
};

export const categoryDescriptions = {
  'Brand Risk': 'Risks that can affect the brand reputation and trustworthiness.',
  'Legal Risk': 'Risks that can lead to legal consequences or violations.',
  'Technical Risk': 'Risks involving malicious activities targeting the system or users.',
};

export type TopLevelCategory = keyof typeof riskCategories;

export const categoryMapReverse = Object.entries(riskCategories).reduce(
  (acc, [category, harms]) => {
    harms.forEach((harm) => {
      acc[harm] = category;
    });
    return acc;
  },
  {} as Record<string, string>,
);

export const categoryLabels = Object.keys(categoryMapReverse);

// Map from plugin name to metric name or harm category
export const categoryAliases: Record<Plugin, string> = {
  'cross-session-leak': 'CrossSessionLeak',
  'ascii-smuggling': 'AsciiSmuggling',
  bola: 'BOLAEnforcement',
  bfla: 'BFLAEnforcement',
  ssrf: 'SSRFEnforcement',
  'debug-access': 'DebugAccess',
  'excessive-agency': 'ExcessiveAgency',
  'harmful:child-exploitation': 'Child Exploitation',
  'harmful:cybercrime': 'Cybercrime & Unauthorized Intrusion - Hacking and Malware',
  'harmful:graphic-content': 'Graphic & age-restricted content',
  'harmful:harassment-bullying': 'Harassment & Bullying',
  'harmful:hate': 'Hate',
  'harmful:illegal-activities': 'Illegal Activities - Fraud & scams',
  'harmful:illegal-drugs': 'Illegal Drugs',
  'harmful:indiscriminate-weapons': 'Indiscriminate Weapons',
  'harmful:insults': 'Insults and personal attacks',
  'harmful:intellectual-property': 'Intellectual Property violation',
  'harmful:misinformation-disinformation':
    'Misinformation & Disinformation - Harmful lies and propaganda',
  'harmful:non-violent-crime': 'Non-Violent Crimes',
  'harmful:privacy': 'Privacy violations',
  'harmful:profanity': 'Requests containing profanity',
  'harmful:radicalization': 'Radicalization',
  'harmful:self-harm': 'Self-Harm',
  'harmful:sex-crime': 'Sex Crimes',
  'harmful:sexual-content': 'Sexual Content',
  'harmful:specialized-advice': 'Specialized Advice - Financial',
  'harmful:unsafe-practices': 'Promotion of unsafe practices',
  'harmful:violent-crime': 'Violent Crimes',
  'harmful:chemical-biological-weapons': 'Chemical & Biological Weapons',
  'harmful:copyright-violations': 'Copyright Violations - Copyrighted text',
  'shell-injection': 'ShellInjection',
  'sql-injection': 'SqlInjection',
  competitors: 'CompetitorEndorsement',
  contracts: 'ContractualCommitment',
  hallucination: 'Hallucination',
  hijacking: 'Hijacking',
  imitation: 'Imitation',
  overreliance: 'Overreliance',
  pii: 'PIILeak',
  politics: 'PoliticalStatement',
  religion: 'Religion',
  rbac: 'RbacEnforcement',
  policy: 'PolicyViolation',
  'indirect-prompt-injection': 'IndirectPromptInjection',
  'prompt-extraction': 'PromptExtraction',
  harmful: 'Harmful',
  default: 'Default',
  'pii:api-db': 'PIILeak',
  'pii:direct': 'PIILeak',
  'pii:session': 'PIILeak',
  'pii:social': 'PIILeak',
};

export const categoryAliasesReverse = Object.entries(categoryAliases).reduce(
  (acc, [key, value]) => {
    acc[value] = key;
    return acc;
  },
  {} as Record<string, string>,
);

export const pluginDescriptions: Record<Plugin, string> = {
  'sql-injection':
    'SQL injection is a vulnerability that allows attackers to execute unauthorized database queries, potentially leading to data theft or manipulation.',
  'cross-session-leak':
    'Cross-session leak occurs when sensitive information from one user session is inadvertently exposed to another session, compromising data privacy.',
  'ascii-smuggling':
    'ASCII smuggling is a technique used to obfuscate malicious content using ASCII characters, potentially bypassing security filters.',
  bfla: 'Broken Function Level Authorization (BFLA) is a vulnerability where an application fails to properly restrict access to sensitive functions based on user roles.',
  bola: 'Broken Object Level Authorization (BOLA) is a vulnerability where an application fails to properly restrict access to sensitive data objects based on user permissions.',
  competitors:
    'Competitor mentions and endorsements can lead to unintended promotion of rival products or services.',
  contracts:
    'Unauthorized contract creation or modification can lead to legal and financial risks for the organization.',
  'debug-access':
    'Debug access vulnerabilities can expose sensitive system information or provide unauthorized control over the application.',
  'excessive-agency':
    'Excessive agency occurs when the AI model takes actions or makes decisions beyond its intended scope, potentially leading to unintended consequences.',
  hallucination:
    'AI hallucination refers to the generation of false or misleading information, which can lead to misinformation or incorrect decision-making.',
  hijacking:
    'Hijacking vulnerabilities allow attackers to take control of user sessions or system resources, compromising security and privacy.',
  imitation:
    'Imitation vulnerabilities occur when the AI impersonates individuals, brands, or organizations without authorization, potentially leading to fraud or reputational damage.',
  'indirect-prompt-injection':
    "Indirect prompt injection allows attackers to manipulate the AI's behavior by injecting malicious content into variables used in prompts.",
  overreliance:
    'Overreliance on AI systems without proper validation can lead to errors in decision-making or actions based on incorrect assumptions.',
  pii: 'Personal Identifiable Information (PII) leaks can compromise user privacy and lead to legal and reputational consequences.',
  policy:
    'Policy violations occur when the AI system acts in ways that contradict established organizational policies or guidelines.',
  politics:
    'Political statements or biases in AI responses can lead to controversy or alienation of users with different political views.',
  'prompt-extraction':
    'Prompt extraction vulnerabilities allow attackers to reveal the system prompts used to guide the AI, potentially exposing sensitive information or enabling further attacks.',
  rbac: 'Role-Based Access Control (RBAC) vulnerabilities occur when the system fails to properly enforce access restrictions based on user roles.',
  religion:
    'Religious statements or biases in AI responses can lead to controversy or alienation of users with different religious beliefs.',
  'shell-injection':
    'Shell injection vulnerabilities allow attackers to execute unauthorized system commands, potentially leading to system compromise.',
  ssrf: 'Server-Side Request Forgery (SSRF) vulnerabilities allow attackers to make unauthorized requests from the server, potentially accessing internal resources or services.',
  'harmful:child-exploitation': 'Content exploiting or harming children',
  'harmful:cybercrime': 'Content related to cybercriminal activities',
  'harmful:graphic-content': 'Displaying graphic or violent content',
  'harmful:harassment-bullying': 'Content that harasses or bullies individuals',
  'harmful:hate': 'Content that promotes hate or discrimination',
  'harmful:illegal-activities': 'Content promoting illegal activities',
  'harmful:illegal-drugs': 'Content related to illegal drug use or trade',
  'harmful:indiscriminate-weapons': 'Content related to weapons without context',
  'harmful:insults': 'Content that insults or demeans individuals',
  'harmful:intellectual-property': 'Content violating intellectual property rights',
  'harmful:misinformation-disinformation': 'Spreading false or misleading information',
  'harmful:non-violent-crime': 'Content related to non-violent criminal activities',
  'harmful:privacy': 'Content violating privacy rights',
  'harmful:profanity': 'Content containing profane or inappropriate language',
  'harmful:radicalization': 'Content that promotes radical or extremist views',
  'harmful:self-harm': 'Content that encourages self-harm or suicide',
  'harmful:sex-crime': 'Content related to sexual crimes',
  'harmful:sexual-content': 'Explicit or inappropriate sexual content',
  'harmful:specialized-advice': 'Providing advice in specialized fields without expertise',
  'harmful:unsafe-practices': 'Content promoting unsafe or harmful practices',
  'harmful:violent-crime': 'Content related to violent criminal activities',
  'harmful:chemical-biological-weapons': 'Content related to chemical or biological weapons',
  'harmful:copyright-violations': 'Content violating copyright laws',
  harmful: 'Content that may be harmful or dangerous in various ways',
  default: 'Default plugin behavior',
  'pii:api-db': 'PII exposed through API or database',
  'pii:direct': 'Direct exposure of PII',
  'pii:session': 'PII exposed in session data',
  'pii:social': 'PII exposed through social engineering',
};

export const strategyDescriptions: Record<Strategy, string> = {
  'ascii-smuggling': 'Obfuscates malicious content using ASCII characters to bypass filters',
  base64: 'Encodes malicious content in Base64 to evade detection',
  crescendo: 'Gradually escalates the conversation to probe for vulnerabilities',
  'jailbreak:tree': 'Uses a tree-based search approach for more sophisticated jailbreaking',
  jailbreak: 'Attempts to bypass security measures through iterative prompt refinement',
  leetspeak: 'Replaces characters with similar-looking numbers or symbols to obfuscate content',
  'math-prompt': 'Encodes harmful content using mathematical concepts and notation',
  multilingual: 'Translates malicious content into low-resource languages to evade detection',
  'prompt-injection': 'Injects malicious instructions into prompts via user input',
  rot13: 'Applies a simple letter substitution cipher to obfuscate malicious content',
  default: 'Dynamically probes and refines prompts to bypass security measures',
  basic: 'Single shot common prompt injection vulnerabilities',
};

export const strategyDisplayNames: Record<Strategy, string> = {
  'ascii-smuggling': 'ASCII Smuggling',
  'jailbreak:tree': 'Tree-based Optimization',
  'math-prompt': 'Mathematical Encoding',
  'prompt-injection': 'Prompt Injection',
  base64: 'Base64 Encoding',
  basic: 'Basic',
  crescendo: 'Crescendo',
  default: 'Basic and Iterative Jailbreak',
  jailbreak: 'Single-shot Optimization',
  leetspeak: 'Leetspeak',
  multilingual: 'Multilingual',
  rot13: 'ROT13 Encoding',
};
