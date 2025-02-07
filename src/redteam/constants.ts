export const DEFAULT_NUM_TESTS_PER_PLUGIN = 5;

export const REDTEAM_MODEL = 'openai:chat:gpt-4o';

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
  'contracts',
  'cyberseceval',
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

export const COLLECTIONS = ['default', 'foundation', 'harmful', 'pii'] as const;
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
  'ascii-smuggling',
  'beavertails',
  'bfla',
  'bola',
  'competitors',
  'cross-session-leak',
  'cyberseceval',
  'debug-access',
  'divergent-repetition',
  'harmbench',
  'imitation',
  'indirect-prompt-injection',
  'overreliance',
  'prompt-extraction',
  'pliny',
  'rag-document-exfiltration',
  'rbac',
  'religion',
  'shell-injection',
  'sql-injection',
  'ssrf',
  'system-prompt-override',
] as const;
export type AdditionalPlugin = (typeof ADDITIONAL_PLUGINS)[number];

// Plugins that require configuration and can't be enabled by default or included as additional.
export const CONFIG_REQUIRED_PLUGINS = ['intent', 'policy'] as const;
export type ConfigRequiredPlugin = (typeof CONFIG_REQUIRED_PLUGINS)[number];

// Plugins that don't use strategies (standalone plugins)
export const STRATEGY_EXEMPT_PLUGINS = ['pliny', 'system-prompt-override'] as const;
export type StrategyExemptPlugin = (typeof STRATEGY_EXEMPT_PLUGINS)[number];

export type Plugin =
  | AdditionalPlugin
  | BasePlugin
  | Collection
  | ConfigRequiredPlugin
  | HarmPlugin
  | PIIPlugin;

export const DEFAULT_PLUGINS: ReadonlySet<Plugin> = new Set([
  ...[...BASE_PLUGINS, ...(Object.keys(HARM_PLUGINS) as HarmPlugin[]), ...PII_PLUGINS].sort(),
] as const satisfies readonly Plugin[]);

export const ALL_PLUGINS: readonly Plugin[] = [
  ...new Set([...DEFAULT_PLUGINS, ...ADDITIONAL_PLUGINS, ...CONFIG_REQUIRED_PLUGINS]),
].sort() as Plugin[];

export const FRAMEWORK_NAMES: Record<string, string> = {
  'mitre:atlas': 'MITRE ATLAS',
  'nist:ai:measure': 'NIST AI RMF',
  'owasp:api': 'OWASP API Top 10',
  'owasp:llm': 'OWASP LLM Top 10',
};

export const OWASP_LLM_TOP_10_MAPPING: Record<
  string,
  { plugins: Plugin[]; strategies: Strategy[] }
> = {
  'owasp:llm:01': {
    // Prompt Injection
    plugins: ['ascii-smuggling', 'indirect-prompt-injection', 'prompt-extraction', 'harmful'],
    strategies: ['jailbreak', 'prompt-injection', 'jailbreak:composite'],
  },
  'owasp:llm:02': {
    // Sensitive Information Disclosure
    plugins: [
      'pii:api-db',
      'pii:direct',
      'pii:session',
      'pii:social',
      'harmful:privacy',
      'cross-session-leak',
      'prompt-extraction',
    ],
    strategies: ['jailbreak', 'prompt-injection', 'jailbreak:composite'],
  },
  'owasp:llm:03': {
    // Supply Chain
    plugins: [],
    strategies: [],
  },
  'owasp:llm:04': {
    // Data and Model Poisoning
    plugins: [
      'harmful:misinformation-disinformation',
      'harmful:hate',
      'harmful:radicalization',
      'harmful:specialized-advice',
    ],
    strategies: ['jailbreak', 'prompt-injection', 'jailbreak:composite'],
  },
  'owasp:llm:05': {
    // Improper Output Handling
    plugins: ['shell-injection', 'sql-injection', 'ssrf', 'debug-access'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'owasp:llm:06': {
    // Excessive Agency
    plugins: [
      'excessive-agency',
      'rbac',
      'bfla',
      'bola',
      'shell-injection',
      'sql-injection',
      'ssrf',
    ],
    strategies: ['jailbreak', 'prompt-injection', 'jailbreak:composite'],
  },
  'owasp:llm:07': {
    // System Prompt Leakage
    plugins: [
      'prompt-extraction',
      'rbac',
      'harmful:privacy',
      'pii:api-db',
      'pii:direct',
      'pii:session',
      'pii:social',
    ],
    strategies: ['jailbreak', 'prompt-injection', 'jailbreak:composite'],
  },
  'owasp:llm:08': {
    // Vector and Embedding Weaknesses
    plugins: [
      'cross-session-leak',
      'harmful:privacy',
      'pii:api-db',
      'pii:direct',
      'pii:session',
      'pii:social',
    ],
    strategies: ['jailbreak', 'prompt-injection', 'jailbreak:composite'],
  },
  'owasp:llm:09': {
    // Misinformation
    plugins: [
      'hallucination',
      'overreliance',
      'harmful:misinformation-disinformation',
      'harmful:specialized-advice',
    ],
    strategies: ['jailbreak', 'prompt-injection', 'jailbreak:composite'],
  },
  'owasp:llm:10': {
    // Unbounded Consumption
    plugins: ['excessive-agency', 'overreliance'],
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
    plugins: ['bfla', 'bola', 'rbac'],
    strategies: [],
  },
  'owasp:api:06': {
    plugins: ['harmful:misinformation-disinformation', 'overreliance'],
    strategies: [],
  },
  'owasp:api:07': {
    plugins: ['shell-injection', 'sql-injection'],
    strategies: [],
  },
  'owasp:api:08': {
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:session'],
    strategies: [],
  },
  'owasp:api:09': {
    plugins: ['harmful:specialized-advice', 'overreliance'],
    strategies: [],
  },
  'owasp:api:10': {
    plugins: ['debug-access', 'harmful:privacy'],
    strategies: [],
  },
};

export const NIST_AI_RMF_MAPPING: Record<string, { plugins: Plugin[]; strategies: Strategy[] }> = {
  'nist:ai:measure:1.1': {
    plugins: ['excessive-agency', 'harmful:misinformation-disinformation'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'nist:ai:measure:1.2': {
    plugins: ['excessive-agency', 'harmful:misinformation-disinformation'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'nist:ai:measure:2.1': {
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:direct', 'pii:session', 'pii:social'],
    strategies: [],
  },
  'nist:ai:measure:2.2': {
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:direct', 'pii:session', 'pii:social'],
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
      'harmful:chemical-biological-weapons',
      'harmful:indiscriminate-weapons',
      'harmful:unsafe-practices',
    ],
    strategies: [],
  },
  'nist:ai:measure:2.7': {
    plugins: ['harmful:cybercrime', 'shell-injection', 'sql-injection'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'nist:ai:measure:2.8': {
    plugins: ['bfla', 'bola', 'rbac'],
    strategies: [],
  },
  'nist:ai:measure:2.9': {
    plugins: ['excessive-agency'],
    strategies: [],
  },
  'nist:ai:measure:2.10': {
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:direct', 'pii:session', 'pii:social'],
    strategies: [],
  },
  'nist:ai:measure:2.11': {
    plugins: ['harmful:harassment-bullying', 'harmful:hate', 'harmful:insults'],
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
  'mitre:atlas:exfiltration': {
    plugins: [
      'ascii-smuggling',
      'harmful:privacy',
      'indirect-prompt-injection',
      'pii:api-db',
      'pii:direct',
      'pii:session',
      'pii:social',
      'prompt-extraction',
    ],
    strategies: [],
  },
  'mitre:atlas:impact': {
    plugins: ['excessive-agency', 'harmful', 'hijacking', 'imitation'],
    strategies: ['crescendo'],
  },
  'mitre:atlas:initial-access': {
    plugins: ['debug-access', 'harmful:cybercrime', 'shell-injection', 'sql-injection', 'ssrf'],
    strategies: ['base64', 'jailbreak', 'leetspeak', 'prompt-injection', 'rot13'],
  },
  'mitre:atlas:ml-attack-staging': {
    plugins: ['ascii-smuggling', 'excessive-agency', 'hallucination', 'indirect-prompt-injection'],
    strategies: ['jailbreak', 'jailbreak:tree'],
  },
  'mitre:atlas:reconnaissance': {
    plugins: ['competitors', 'policy', 'prompt-extraction', 'rbac'],
    strategies: ['multilingual'],
  },
  'mitre:atlas:resource-development': {
    plugins: ['harmful:cybercrime', 'harmful:illegal-drugs', 'harmful:indiscriminate-weapons'],
    strategies: [],
  },
};

// Aliased plugins are like collections, except they are hidden from the standard plugin list.
export const ALIASED_PLUGINS = [
  'mitre:atlas',
  'nist:ai',
  'nist:ai:measure',
  'owasp:api',
  'owasp:llm',
  'toxicity',
  'bias',
  'misinformation',
  'illegal-activity',
  'personal-safety',
  ...Object.keys(MITRE_ATLAS_MAPPING),
  ...Object.keys(NIST_AI_RMF_MAPPING),
  ...Object.keys(OWASP_API_TOP_10_MAPPING),
  ...Object.keys(OWASP_LLM_TOP_10_MAPPING),
] as const;

export const ALIASED_PLUGIN_MAPPINGS: Record<
  string,
  Record<string, { plugins: string[]; strategies: string[] }>
> = {
  'mitre:atlas': MITRE_ATLAS_MAPPING,
  'nist:ai:measure': NIST_AI_RMF_MAPPING,
  'owasp:api': OWASP_API_TOP_10_MAPPING,
  'owasp:llm': OWASP_LLM_TOP_10_MAPPING,
  toxicity: {
    toxicity: {
      plugins: [
        'harmful:hate',
        'harmful:harassment-bullying',
        'harmful:insults',
        'harmful:profanity',
        'harmful:graphic-content',
        'harmful:sexual-content',
      ],
      strategies: [],
    },
  },
  bias: {
    bias: {
      plugins: ['politics', 'religion'],
      strategies: [],
    },
  },
  misinformation: {
    misinformation: {
      plugins: [
        'harmful:misinformation-disinformation',
        'hallucination',
        'harmful:radicalization',
        'imitation',
      ],
      strategies: [],
    },
  },
  'illegal-activity': {
    'illegal-activity': {
      plugins: [
        'harmful:violent-crime',
        'harmful:non-violent-crime',
        'harmful:sex-crime',
        'harmful:cybercrime',
        'harmful:illegal-activities',
        'harmful:illegal-drugs',
        'harmful:illegal-drugs:meth',
        'harmful:chemical-biological-weapons',
        'harmful:indiscriminate-weapons',
        'harmful:weapons:ied',
      ],
      strategies: [],
    },
  },
};

// These are exposed on the frontend under the framework compliance section
export const FRAMEWORK_COMPLIANCE_IDS = [
  'mitre:atlas',
  'nist:ai:measure',
  'owasp:api',
  'owasp:llm',
] as const;
export type FrameworkComplianceId = (typeof FRAMEWORK_COMPLIANCE_IDS)[number];

export const DEFAULT_STRATEGIES = ['basic', 'jailbreak', 'jailbreak:composite'] as const;
export type DefaultStrategy = (typeof DEFAULT_STRATEGIES)[number];

export const MULTI_TURN_STRATEGIES = ['crescendo', 'goat'] as const;
export type MultiTurnStrategy = (typeof MULTI_TURN_STRATEGIES)[number];

export const AGENTIC_STRATEGIES = [
  'crescendo',
  'goat',
  'jailbreak',
  'jailbreak:tree',
  'pandamonium',
] as const;
export type AgenticStrategy = (typeof AGENTIC_STRATEGIES)[number];

export const ADDITIONAL_STRATEGIES = [
  'base64',
  'best-of-n',
  'citation',
  'crescendo',
  'gcg',
  'goat',
  'hex',
  'jailbreak:likert',
  'jailbreak:tree',
  'leetspeak',
  'math-prompt',
  'multilingual',
  'pandamonium',
  'prompt-injection',
  'retry',
  'rot13',
] as const;
export type AdditionalStrategy = (typeof ADDITIONAL_STRATEGIES)[number];

export const ALL_STRATEGIES = [
  ...['default', ...DEFAULT_STRATEGIES, ...ADDITIONAL_STRATEGIES].sort(),
] as const;
export type Strategy = (typeof ALL_STRATEGIES)[number];

export const subCategoryDescriptions: Record<Plugin | Strategy, string> = {
  'ascii-smuggling': 'Tests vulnerability to Unicode tag-based instruction smuggling attacks',
  base64: 'Tests handling of Base64-encoded malicious payloads',
  basic: 'Original plugin tests without any additional strategies or optimizations',
  beavertails: 'Tests handling of malicious prompts from the BeaverTails dataset',
  'best-of-n': 'Jailbreak technique published by Anthropic and Stanford',
  bfla: 'Tests for broken function-level authorization vulnerabilities (OWASP API 5)',
  bola: 'Tests for broken object-level authorization vulnerabilities (OWASP API 1)',
  citation: 'Exploits academic authority bias to bypass content filters',
  competitors: 'Tests for unauthorized competitor mentions and endorsements',
  contracts: 'Tests for unauthorized contractual commitments and legal exposure',
  crescendo: 'Multi-turn attack strategy that gradually escalates malicious intent',
  'cross-session-leak': 'Tests for information leakage between user sessions',
  cyberseceval: "Tests prompt injection attacks from Meta's CyberSecEval dataset",
  'debug-access': 'Tests for exposed debugging interfaces and commands',
  default: 'Standard security testing plugins',
  'divergent-repetition':
    'Tests for training data leaks through repetitive pattern exploitation that causes model divergence',
  'excessive-agency': 'Tests for unauthorized actions beyond defined system boundaries',
  foundation: 'Tests a collection of plugins designed to run against foundation models',
  gcg: 'Greedy Coordinate Gradient adversarial suffix attack',
  goat: 'Dynamic multi-turn attack generation using adversarial techniques',
  hallucination: 'Tests for fabrication of false or misleading information',
  harmbench: 'Tests for harmful content using the HarmBench dataset',
  harmful: 'Tests handling of malicious content across multiple categories',
  'harmful:chemical-biological-weapons': 'Tests handling of WMD-related content',
  'harmful:child-exploitation': 'Tests handling of child exploitation content',
  'harmful:copyright-violations': 'Tests handling of intellectual property violations',
  'harmful:cybercrime': 'Tests handling of cybercrime-related content',
  'harmful:cybercrime:malicious-code': 'Tests creation of malicious code',
  'harmful:graphic-content': 'Tests handling of graphic or violent content',
  'harmful:harassment-bullying': 'Tests handling of harassment and bullying content',
  'harmful:hate': 'Tests handling of hate speech and discriminatory content',
  'harmful:illegal-activities': 'Tests handling of general illegal activities',
  'harmful:illegal-drugs': 'Tests handling of illegal drug-related content',
  'harmful:illegal-drugs:meth': 'Tests handling of methamphetamine-related content',
  'harmful:indiscriminate-weapons': 'Tests handling of weapons-related content',
  'harmful:insults': 'Tests handling of personal attacks and insults',
  'harmful:intellectual-property': 'Tests handling of IP theft and violations',
  'harmful:misinformation-disinformation': 'Tests handling of false information campaigns',
  'harmful:non-violent-crime': 'Tests handling of non-violent criminal content',
  'harmful:privacy': 'Tests handling of privacy violation attempts',
  'harmful:profanity': 'Tests handling of profane or inappropriate language',
  'harmful:radicalization': 'Tests handling of extremist content and recruitment',
  'harmful:self-harm': 'Tests handling of self-harm and suicide content',
  'harmful:sex-crime': 'Tests handling of sexual crime content',
  'harmful:sexual-content': 'Tests handling of explicit sexual content',
  'harmful:specialized-advice': 'Tests handling of unauthorized professional advice',
  'harmful:unsafe-practices': 'Tests handling of dangerous activity instructions',
  'harmful:violent-crime': 'Tests handling of violent crime content',
  'harmful:weapons:ied': 'Tests handling of Improvised Explosive Devices',
  hex: 'Tests handling of hex-encoded malicious payloads',
  hijacking: 'Tests for unauthorized resource usage and purpose deviation',
  imitation: 'Tests for unauthorized impersonation of entities',
  'indirect-prompt-injection': 'Tests for injection vulnerabilities via untrusted variables',
  intent: 'Tests for manipulation of system behavior via specific prompts',
  jailbreak: 'Single-shot optimization of safety bypass techniques',
  'jailbreak:composite': 'Combines multiple jailbreak techniques for enhanced effectiveness',
  'jailbreak:likert': 'Uses Likert scale-based prompts to bypass content filters',
  'jailbreak:tree': 'Tree-based search for optimal safety bypass vectors',
  leetspeak: 'Tests handling of leetspeak-encoded malicious content',
  'math-prompt': 'Tests handling of mathematical notation-based attacks',
  multilingual: 'Tests handling of attacks across multiple languages',
  overreliance: 'Tests for overreliance on system assumptions',
  pandamonium:
    "[Experimental] Promptfoo's blackbox jailbreak. The latest and greatest jailbreak techniques, expertly tuned and crafted by Promptfoo's AI team.",
  pii: 'Tests handling of personal identifiable information',
  'pii:api-db': 'Tests for PII exposure via API/database access',
  'pii:direct': 'Tests for direct PII exposure vulnerabilities',
  'pii:session': 'Tests for PII exposure in session data',
  'pii:social': 'Tests for PII exposure via social engineering',
  pliny: 'Tests handling of Pliny prompt injections',
  policy: 'Tests compliance with custom security policies',
  politics: 'Tests handling of political content and bias',
  'prompt-extraction': 'Tests for system prompt disclosure vulnerabilities',
  'prompt-injection': 'Tests for direct prompt injection vulnerabilities',
  'rag-document-exfiltration': 'Tests for RAG document exfiltration',
  rbac: 'Tests role-based access control implementation',
  religion: 'Tests handling of religious content and bias',
  retry:
    'Automatically incorporates previously failed test cases to build a regression testing suite',
  rot13: 'Tests handling of ROT13-encoded malicious content',
  'shell-injection': 'Tests for command injection vulnerabilities',
  'sql-injection': 'Tests for SQL injection vulnerabilities',
  ssrf: 'Tests for server-side request forgery vulnerabilities',
  'system-prompt-override': 'Tests for system prompt override vulnerabilities',
};

// These names are displayed in risk cards and in the table
export const displayNameOverrides: Record<Plugin | Strategy, string> = {
  'ascii-smuggling': 'ASCII Smuggling',
  base64: 'Base64 Payload Encoding',
  basic: 'Baseline Testing',
  beavertails: 'BeaverTails Dataset',
  'best-of-n': 'Best-of-N',
  bfla: 'Function-Level Authorization Bypass',
  bola: 'Object-Level Authorization Bypass',
  citation: 'Authority Bias Exploitation',
  competitors: 'Competitors',
  contracts: 'Unauthorized Commitments',
  crescendo: 'Multi-Turn Crescendo',
  'cross-session-leak': 'Cross-Session Data Leakage',
  cyberseceval: 'CyberSecEval Dataset',
  'debug-access': 'Debug Interface Exposure',
  default: 'Standard Security Suite',
  'divergent-repetition': 'Divergent Repetition',
  'excessive-agency': 'Excessive Agency',
  foundation: 'Foundation Model Plugin Collection',
  gcg: 'Greedy Coordinate Gradient',
  goat: 'Generative Offensive Agent Tester',
  hallucination: 'False Information (Hallucination)',
  harmbench: 'HarmBench Dataset',
  harmful: 'Malicious Content Suite',
  'harmful:chemical-biological-weapons': 'WMD Content',
  'harmful:child-exploitation': 'Child Exploitation',
  'harmful:copyright-violations': 'IP Violations',
  'harmful:cybercrime': 'Cybercrime',
  'harmful:cybercrime:malicious-code': 'Malicious Code',
  'harmful:graphic-content': 'Graphic Content',
  'harmful:harassment-bullying': 'Harassment',
  'harmful:hate': 'Hate Speech',
  'harmful:illegal-activities': 'Illegal Activity',
  'harmful:illegal-drugs': 'Drug-Related Content',
  'harmful:illegal-drugs:meth': 'Methamphetamine Content',
  'harmful:indiscriminate-weapons': 'Weapons Content',
  'harmful:insults': 'Personal Attacks',
  'harmful:intellectual-property': 'IP Theft',
  'harmful:misinformation-disinformation': 'Disinformation Campaigns',
  'harmful:non-violent-crime': 'Non-Violent Crime',
  'harmful:privacy': 'Privacy Violation',
  'harmful:profanity': 'Profanity',
  'harmful:radicalization': 'Extremist Content',
  'harmful:self-harm': 'Self-Harm',
  'harmful:sex-crime': 'Sexual Crime Content',
  'harmful:sexual-content': 'Explicit Content',
  'harmful:specialized-advice': 'Unauthorized Advice',
  'harmful:unsafe-practices': 'Dangerous Activity Content',
  'harmful:violent-crime': 'Violent Crime Content',
  'harmful:weapons:ied': 'Improvised Explosive Devices',
  hex: 'Hex Encoding',
  hijacking: 'Resource Hijacking',
  imitation: 'Entity Impersonation',
  'indirect-prompt-injection': 'Indirect Prompt Injection',
  intent: 'Intent',
  jailbreak: 'Single-shot Optimization',
  'jailbreak:composite': 'Multi-Vector Safety Bypass',
  'jailbreak:likert': 'Likert Scale Jailbreak',
  'jailbreak:tree': 'Tree-Based Attack Search',
  leetspeak: 'Leetspeak Payload Encoding',
  'math-prompt': 'Mathematical Notation Attack',
  multilingual: 'Cross-Language Attack',
  overreliance: 'Overreliance',
  pandamonium: '[Experimental] Pandamonium',
  pii: 'PII Protection Suite',
  'pii:api-db': 'PII via API/Database',
  'pii:direct': 'PII via Direct Exposure',
  'pii:session': 'PII via Session Data',
  'pii:social': 'PII via Social Engineering',
  pliny: 'Pliny Prompt Injections',
  policy: 'Policy Compliance',
  politics: 'Political Bias',
  'prompt-extraction': 'System Prompt Disclosure',
  'prompt-injection': 'Direct Prompt Injection',
  'rag-document-exfiltration': 'RAG Document Exfiltration',
  rbac: 'RBAC Implementation',
  religion: 'Religious Bias',
  retry: 'Regression Testing',
  rot13: 'ROT13 Payload Encoding',
  'shell-injection': 'Command Injection',
  'sql-injection': 'SQL Injection',
  ssrf: 'SSRF Vulnerability',
  'system-prompt-override': 'System Prompt Override',
};

export enum Severity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export const severityDisplayNames: Record<Severity, string> = {
  [Severity.Critical]: 'Critical',
  [Severity.High]: 'High',
  [Severity.Medium]: 'Medium',
  [Severity.Low]: 'Low',
};

/*
 * Default severity values for each plugin.
 * Use getRiskCategorySeverityMap() whenever possible to respect the user's severity settings.
 */
export const riskCategorySeverityMap: Record<Plugin, Severity> = {
  'ascii-smuggling': Severity.Low,
  beavertails: Severity.Low,
  bfla: Severity.High,
  bola: Severity.High,
  competitors: Severity.Low,
  contracts: Severity.Medium,
  'cross-session-leak': Severity.Medium,
  cyberseceval: Severity.Medium,
  'debug-access': Severity.High,
  default: Severity.Low,
  'divergent-repetition': Severity.Medium,
  'excessive-agency': Severity.Medium,
  foundation: Severity.Medium,
  hallucination: Severity.Medium,
  harmbench: Severity.Medium,
  harmful: Severity.Medium,
  'harmful:chemical-biological-weapons': Severity.High,
  'harmful:child-exploitation': Severity.Critical,
  'harmful:copyright-violations': Severity.Low,
  'harmful:cybercrime': Severity.Low,
  'harmful:cybercrime:malicious-code': Severity.Low,
  'harmful:graphic-content': Severity.Medium,
  'harmful:harassment-bullying': Severity.Low,
  'harmful:hate': Severity.Critical,
  'harmful:illegal-activities': Severity.Medium,
  'harmful:illegal-drugs': Severity.Medium,
  'harmful:illegal-drugs:meth': Severity.Low,
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
  'harmful:weapons:ied': Severity.Low,
  hijacking: Severity.High,
  imitation: Severity.Low,
  'indirect-prompt-injection': Severity.High,
  intent: Severity.High,
  overreliance: Severity.Low,
  pii: Severity.High,
  'pii:api-db': Severity.High,
  'pii:direct': Severity.High,
  'pii:session': Severity.High,
  'pii:social': Severity.High,
  pliny: Severity.Medium,
  policy: Severity.High,
  politics: Severity.Low,
  'prompt-extraction': Severity.Medium,
  'rag-document-exfiltration': Severity.Medium,
  rbac: Severity.High,
  religion: Severity.Low,
  'shell-injection': Severity.High,
  'sql-injection': Severity.High,
  ssrf: Severity.High,
  'system-prompt-override': Severity.High,
};

export const riskCategories: Record<string, Plugin[]> = {
  'Security & Access Control': [
    // System security
    'ascii-smuggling',
    'bfla',
    'bola',
    'debug-access',
    'hijacking',
    'indirect-prompt-injection',
    'rbac',
    'shell-injection',
    'sql-injection',
    'ssrf',

    // Data protection
    'cross-session-leak',
    'divergent-repetition',
    'harmful:privacy',
    'pii:api-db',
    'pii:direct',
    'pii:session',
    'pii:social',
    'pii',
    'prompt-extraction',
  ],

  'Compliance & Legal': [
    'contracts',
    'harmful:chemical-biological-weapons',
    'harmful:copyright-violations',
    'harmful:cybercrime:malicious-code',
    'harmful:cybercrime',
    'harmful:illegal-activities',
    'harmful:illegal-drugs:meth',
    'harmful:illegal-drugs',
    'harmful:indiscriminate-weapons',
    'harmful:intellectual-property',
    'harmful:non-violent-crime',
    'harmful:sex-crime',
    'harmful:specialized-advice',
    'harmful:unsafe-practices',
    'harmful:violent-crime',
    'harmful:weapons:ied',
  ],

  'Trust & Safety': [
    'beavertails',
    'cyberseceval',
    'harmbench',
    'harmful:child-exploitation',
    'harmful:graphic-content',
    'harmful:harassment-bullying',
    'harmful:hate',
    'harmful:insults',
    'harmful:profanity',
    'harmful:radicalization',
    'harmful:self-harm',
    'harmful:sexual-content',
    'pliny',
  ],

  Brand: [
    'competitors',
    'excessive-agency',
    'hallucination',
    'harmful:misinformation-disinformation',
    'hijacking',
    'imitation',
    'intent',
    'overreliance',
    'policy',
    'politics',
    'religion',
  ],
};

export const categoryDescriptions = {
  'Security & Access Control': 'Data protection, access control, and system security risks.',
  'Content Safety & Moderation': 'Harmful, inappropriate, or offensive content generation risks.',
  'Compliance & Legal': 'Regulatory compliance, legal, and policy violation risks.',
  'Output Quality & Trust': 'Output reliability, accuracy, and brand reputation risks.',
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
  'ascii-smuggling': 'AsciiSmuggling',
  beavertails: 'BeaverTails',
  bfla: 'BFLAEnforcement',
  bola: 'BOLAEnforcement',
  competitors: 'CompetitorEndorsement',
  contracts: 'ContractualCommitment',
  'cross-session-leak': 'CrossSessionLeak',
  cyberseceval: 'CyberSecEval',
  'debug-access': 'DebugAccess',
  default: 'Default',
  'divergent-repetition': 'DivergentRepetition',
  'excessive-agency': 'ExcessiveAgency',
  foundation: 'Foundation',
  hallucination: 'Hallucination',
  harmbench: 'Harmbench',
  harmful: 'Harmful',
  'harmful:chemical-biological-weapons': 'Chemical & Biological Weapons',
  'harmful:child-exploitation': 'Child Exploitation',
  'harmful:copyright-violations': 'Copyright Violations - Copyrighted text',
  'harmful:cybercrime': 'Cybercrime & Unauthorized Intrusion - Hacking and Malware',
  'harmful:cybercrime:malicious-code': 'Malicious Code',
  'harmful:graphic-content': 'Graphic & age-restricted content',
  'harmful:harassment-bullying': 'Harassment & Bullying',
  'harmful:hate': 'Hate',
  'harmful:illegal-activities': 'Illegal Activities - Fraud & scams',
  'harmful:illegal-drugs': 'Illegal Drugs',
  'harmful:illegal-drugs:meth': 'Methamphetamine',
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
  'harmful:weapons:ied': 'Improvised Explosive Devices',
  hijacking: 'Hijacking',
  imitation: 'Imitation',
  'indirect-prompt-injection': 'Indirect Prompt Injection',
  intent: 'Intent',
  overreliance: 'Overreliance',
  pii: 'PIILeak',
  'pii:api-db': 'PIILeak',
  'pii:direct': 'PIILeak',
  'pii:session': 'PIILeak',
  'pii:social': 'PIILeak',
  pliny: 'Pliny',
  policy: 'PolicyViolation',
  politics: 'PoliticalStatement',
  'prompt-extraction': 'PromptExtraction',
  'rag-document-exfiltration': 'RAG Document Exfiltration',
  rbac: 'RbacEnforcement',
  religion: 'Religion',
  'shell-injection': 'ShellInjection',
  'sql-injection': 'SqlInjection',
  ssrf: 'SSRFEnforcement',
  'system-prompt-override': 'System Prompt Override',
};

export const categoryAliasesReverse = Object.entries(categoryAliases).reduce(
  (acc, [key, value]) => {
    acc[value] = key;
    return acc;
  },
  {} as Record<string, string>,
);

export const pluginDescriptions: Record<Plugin, string> = {
  'ascii-smuggling':
    'Tests system resilience against Unicode tag-based instruction smuggling attacks that can bypass content filters and security controls',
  beavertails: 'Tests handling of malicious prompts from the BeaverTails dataset',
  bfla: 'Evaluates function-level authorization controls to identify privilege escalation vulnerabilities (OWASP API Security Top 10 #5)',
  bola: 'Tests object-level authorization mechanisms to detect unauthorized data access vulnerabilities (OWASP API Security Top 10 #1)',
  competitors:
    'Assesses system protection against unauthorized competitor endorsements and brand security risks',
  contracts: 'Evaluates safeguards against unauthorized contractual commitments and legal exposure',
  'cross-session-leak':
    'Tests for information leakage vulnerabilities between different user sessions',
  cyberseceval: "Tests prompt injection attacks from Meta's CyberSecEval dataset",
  'debug-access':
    'Identifies exposed debugging interfaces and unauthorized command execution vectors',
  default: 'Executes comprehensive baseline security testing across multiple risk categories',
  'divergent-repetition':
    'Tests repetitive patterns that can cause the model to diverge from normal behavior and leak training data',
  'excessive-agency': 'Evaluates system boundary enforcement and unauthorized action prevention',
  foundation: 'Tests a collection of plugins designed to run against foundation models',
  hallucination: 'Tests system resilience against false information generation and propagation',
  harmbench:
    'Tests for harmful content, illegal activities, misinformation using the HarmBench dataset from the Center for AI Safety (CAIS)',
  harmful: 'Comprehensive suite for testing handling of various categories of malicious content',
  'harmful:chemical-biological-weapons': 'Tests detection and response to WMD-related content',
  'harmful:child-exploitation': 'Tests handling of child exploitation content',
  'harmful:copyright-violations': 'Tests handling of intellectual property violations',
  'harmful:cybercrime': 'Tests detection of cybercrime-related content',
  'harmful:cybercrime:malicious-code': 'Tests creation of malicious code',
  'harmful:graphic-content': 'Tests handling of graphic or violent content',
  'harmful:harassment-bullying': 'Tests handling of harassment and bullying content',
  'harmful:hate': 'Tests handling of hate speech and discriminatory content',
  'harmful:illegal-activities': 'Tests handling of illegal activity content',
  'harmful:illegal-drugs': 'Tests handling of drug-related content',
  'harmful:illegal-drugs:meth': 'Tests handling of methamphetamine-related content',
  'harmful:indiscriminate-weapons': 'Tests handling of weapons-related content',
  'harmful:insults': 'Tests handling of personal attacks and insults',
  'harmful:intellectual-property': 'Tests handling of IP theft attempts',
  'harmful:misinformation-disinformation': 'Tests handling of disinformation campaigns',
  'harmful:non-violent-crime': 'Tests handling of non-violent criminal content',
  'harmful:privacy': 'Tests handling of privacy violation attempts',
  'harmful:profanity': 'Tests handling of profane content',
  'harmful:radicalization': 'Tests handling of extremist content',
  'harmful:self-harm': 'Tests handling of self-harm content',
  'harmful:sex-crime': 'Tests handling of sexual crime content',
  'harmful:sexual-content': 'Tests handling of explicit sexual content',
  'harmful:specialized-advice': 'Tests handling of unauthorized professional advice',
  'harmful:unsafe-practices': 'Tests handling of dangerous activity instructions',
  'harmful:violent-crime': 'Tests handling of violent crime content',
  'harmful:weapons:ied': 'Tests handling of Improvised Explosive Devices',
  hijacking: 'Assesses protection against unauthorized resource usage and purpose deviation',
  imitation: 'Tests safeguards against unauthorized entity impersonation attempts',
  'indirect-prompt-injection':
    'Evaluates vulnerability to injection attacks via untrusted variables',
  intent: 'Tests system resilience against specific manipulation attempts',
  overreliance: 'Assesses overreliance on system assumptions',
  pii: 'Comprehensive evaluation of personal identifiable information protection',
  'pii:api-db': 'Tests for PII exposure through API and database access vectors',
  'pii:direct': 'Evaluates direct PII exposure vulnerabilities',
  'pii:session': 'Tests for PII leakage in session data',
  'pii:social': 'Assesses PII exposure through social engineering vectors',
  pliny: 'Tests handling of Pliny prompt injections',
  policy: 'Validates compliance with custom security policies and controls',
  politics: 'Tests handling of political content and bias mitigation',
  'prompt-extraction': 'Evaluates protection against system prompt disclosure attempts',
  'rag-document-exfiltration': 'Tests handling of RAG document exfiltration',
  rbac: 'Tests implementation of role-based access control mechanisms',
  religion: 'Assesses handling of religious content and bias mitigation',
  'shell-injection': 'Tests protection against command injection vulnerabilities',
  'sql-injection': 'Evaluates resilience against SQL injection attacks',
  ssrf: 'Tests for server-side request forgery vulnerabilities',
  'system-prompt-override': 'Tests for system prompt override vulnerabilities',
};

export const strategyDescriptions: Record<Strategy, string> = {
  base64: 'Tests detection and handling of Base64-encoded malicious payloads',
  basic: 'Equivalent to no strategy. Always included. Can be disabled in configuration.',
  'best-of-n': 'Jailbreak technique published by Anthropic and Stanford',
  citation: 'Exploits academic authority bias to circumvent content filtering mechanisms',
  crescendo: 'Executes progressive multi-turn attacks with escalating malicious intent',
  default: 'Applies standard security testing methodology',
  gcg: 'Greedy Coordinate Gradient adversarial suffix attack',
  goat: 'Deploys dynamic attack generation using advanced adversarial techniques',
  hex: 'Tests detection and handling of hex-encoded malicious payloads',
  jailbreak: 'Optimizes single-turn attacks to bypass security controls',
  'jailbreak:composite': 'Chains multiple attack vectors for enhanced effectiveness',
  'jailbreak:likert': 'Uses Likert scale-based prompts to bypass content filters',
  'jailbreak:tree': 'Implements tree-based search for optimal attack paths',
  leetspeak: 'Assesses handling of leetspeak-encoded malicious content',
  'math-prompt': 'Tests resilience against mathematical notation-based attacks',
  multilingual: 'Evaluates cross-language attack vector handling',
  pandamonium:
    "Promptfoo's exclusive dynamic jailbreak strategy currently in development. Note: This is an expensive jailbreak strategy with no limit on probes.",
  'prompt-injection': 'Tests direct prompt injection vulnerability detection',
  retry: 'Automatically incorporates previously failed test cases to prevent regression',
  rot13: 'Assesses handling of ROT13-encoded malicious payloads',
};

export const strategyDisplayNames: Record<Strategy, string> = {
  base64: 'Base64 Encoding',
  basic: 'Basic',
  'best-of-n': 'Best-of-N',
  citation: 'Authority Bias',
  crescendo: 'Multi-turn Crescendo',
  default: 'Basic',
  gcg: 'Greedy Coordinate Gradient',
  goat: 'Generative Offensive Agent Tester',
  hex: 'Hex Encoding',
  jailbreak: 'Single-shot Optimization',
  'jailbreak:composite': 'Composite Jailbreaks',
  'jailbreak:likert': 'Likert Scale Jailbreak',
  'jailbreak:tree': 'Tree-based Optimization',
  leetspeak: 'Leetspeak Encoding',
  'math-prompt': 'Mathematical Encoding',
  multilingual: 'Multilingual Encoding',
  pandamonium: 'Pandamonium',
  'prompt-injection': 'Prompt Injection',
  retry: 'Regression Testing',
  rot13: 'ROT13 Encoding',
};

export const PLUGIN_PRESET_DESCRIPTIONS: Record<string, string> = {
  Custom: 'Choose your own plugins',
  Foundation: 'Plugins for redteaming foundation models recommended by Promptfoo',
  'Minimal Test': 'Minimal set of plugins to validate your setup',
  MITRE: 'MITRE ATLAS framework',
  NIST: 'NIST AI Risk Management Framework',
  'OWASP API': 'OWASP API Top 10',
  'OWASP LLM': 'OWASP LLM Top 10',
  RAG: 'Recommended plugins plus additional tests for RAG specific scenarios like access control',
  Recommended: 'A broad set of plugins recommended by Promptfoo',
} as const;
