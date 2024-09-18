import type { Plugin, Strategy } from '../../../../../redteam/constants';

export const riskCategories = {
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
  ],
};

export const categoryDescriptions = {
  'Brand Risk': 'Risks that can affect the brand reputation and trustworthiness.',
  'Legal Risk': 'Risks that can lead to legal consequences or violations.',
  'Technical Risk': 'Risks involving malicious activities targeting the system or users.',
};

export enum Severity {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
}

export const riskCategorySeverityMap: Record<string, Severity> = {
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
  'prompt-injection': Severity.Medium,
  'shell-injection': Severity.High,
  'sql-injection': Severity.High,
  competitors: Severity.Low,
  contracts: Severity.Medium,
  hallucination: Severity.Medium,
  hijacking: Severity.High,
  imitation: Severity.Low,
  jailbreak: Severity.Medium,
  overreliance: Severity.Low,
  pii: Severity.High,
  politics: Severity.Low,
  rbac: Severity.High,
  policy: Severity.High,
  bola: Severity.High,
  bfla: Severity.High,
  ssrf: Severity.High,
  'indirect-prompt-injection': Severity.High,
  'prompt-extraction': Severity.Medium,
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
export const categoryAliases = {
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
  'prompt-injection': 'Harmful/Injection',
  'shell-injection': 'ShellInjection',
  'sql-injection': 'SqlInjection',
  competitors: 'CompetitorEndorsement',
  contracts: 'ContractualCommitment',
  hallucination: 'Hallucination',
  hijacking: 'Hijacking',
  imitation: 'Imitation',
  jailbreak: 'Harmful/Iterative',
  overreliance: 'Overreliance',
  pii: 'PIILeak',
  politics: 'PoliticalStatement',
  rbac: 'RbacEnforcement',
  policy: 'PolicyViolation',
  'indirect-prompt-injection': 'IndirectPromptInjection',
  'prompt-extraction': 'PromptExtraction',
};

export const categoryAliasesReverse = Object.entries(categoryAliases).reduce(
  (acc, [key, value]) => {
    acc[value] = key;
    return acc;
  },
  {} as Record<string, string>,
);

// These names are displayed in risk cards and in the table
export const displayNameOverrides = {
  'ascii-smuggling': 'ASCII smuggling',
  'cross-session-leak': 'Cross-Session Leak',
  'debug-access': 'Debug Access',
  'excessive-agency': 'Excessive Agency',
  'harmful:copyright-violations': 'Copyright Violations',
  'harmful:cybercrime': 'Cybercrime',
  'harmful:illegal-activities': 'Illegal Activities',
  'harmful:misinformation-disinformation': 'Misinformation & disinformation',
  'harmful:specialized-advice': 'Specialized Advice',
  'indirect-prompt-injection': 'Indirect Prompt Injection',
  'jailbreak:tree': 'Tree-based optimization',
  'prompt-extraction': 'Prompt Extraction',
  'prompt-injection': 'Prompt Injection',
  'shell-injection': 'Shell Injection',
  'sql-injection': 'SQL Injection',
  basic: 'Basic',
  bfla: 'Privilege Escalation',
  bola: 'Unauthorized Data Access',
  competitors: 'Competitor Endorsements',
  contracts: 'Unsupervised Contracts',
  crescendo: 'Multi-turn',
  jailbreak: 'Single-shot optimization',
  multilingual: 'Multilingual',
  pii: 'PII Leaks',
  policy: 'Custom Policy',
  politics: 'Political Opinions',
  rbac: 'RBAC Enforcement',
  ssrf: 'Malicious Resource Fetching',
};

// Duplicated in src/redteam/constants.ts for backend
export const subCategoryDescriptions: Record<Plugin | Strategy, string> = {
  default: 'Includes common plugins',
  basic: 'Raw attacks without any special attack strategies',
  'ascii-smuggling': 'Attempts to obfuscate malicious content using ASCII smuggling',
  'cross-session-leak': 'Checks for information sharing between unrelated sessions',
  multilingual: 'Translates the input into low-resource languages',
  bola: 'Broken Object Level Authorization (BOLA) tests',
  bfla: 'Broken Function Level Authorization (BFLA) tests',
  ssrf: 'Server-Side Request Forgery (SSRF) tests',
  'debug-access': 'Attempts to access or use debugging commands',
  'excessive-agency': 'Model taking excessive initiative or misunderstanding its capabilities',
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
  'jailbreak:tree': 'Tree-based jailbreak search',
  'pii:api-db': 'PII exposed through API or database',
  'pii:direct': 'Direct exposure of PII',
  'pii:session': 'PII exposed in session data',
  'pii:social': 'PII exposed through social engineering',
  'prompt-injection': "Malicious inputs designed to manipulate the model's behavior",
  'shell-injection': 'Attempts to execute shell commands through the model',
  'sql-injection': 'Attempts to perform SQL injection attacks to manipulate database queries',
  base64: 'Attempts to obfuscate malicious content using Base64 encoding',
  competitors: 'Competitor mentions and endorsements',
  contracts: 'Enters business or legal commitments without supervision',
  hallucination: 'Model generating false or misleading information',
  harmful: 'All harmful categories',
  hijacking: 'Unauthorized or off-topic resource use',
  imitation: 'Imitates people, brands, or organizations',
  jailbreak: 'Attempts to bypass security measures through iterative prompt refinement',
  leetspeak: 'Attempts to obfuscate malicious content using leetspeak',
  overreliance: 'Model susceptible to relying on an incorrect user assumption or input',
  pii: 'All PII categories',
  policy: 'Violates a custom configured policy',
  politics: 'Makes political statements',
  rbac: 'Tests whether the model properly implements Role-Based Access Control (RBAC)',
  rot13: 'Attempts to obfuscate malicious content using ROT13 encoding',
  crescendo: 'Conversational attack strategy',
  'prompt-extraction': 'Attempts to get the model to reveal its system prompt',
  'indirect-prompt-injection':
    'Evaluates how susceptible the prompt is to harmful instructions injected into the prompt',
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

export const FRAMEWORK_NAMES: Record<string, string> = {
  'nist:ai:measure': 'NIST AI RMF',
  'owasp:llm': 'OWASP LLM Top 10',
  'owasp:api': 'OWASP API Top 10',
  'mitre:atlas': 'MITRE ATLAS',
};
