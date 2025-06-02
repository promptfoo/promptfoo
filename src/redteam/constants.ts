import { MEMORY_POISONING_PLUGIN_ID } from './plugins/agentic/constants';

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
  'ascii-smuggling',
  'beavertails',
  'bfla',
  'bopla',
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
  'off-topic',
  'overreliance',
  'pliny',
  'prompt-extraction',
  'rag-document-exfiltration',
  'rag-poisoning',
  'rbac',
  'reasoning-dos',
  'resource-consumption',
  'religion',
  'shell-injection',
  'sql-injection',
  'ssrf',
  'system-prompt-override',
  'tool-discovery:multi-turn',
  'tool-discovery',
  'unrestricted-access',
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
  'tool-discovery:multi-turn',
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

export const FRAMEWORK_NAMES: Record<string, string> = {
  'mitre:atlas': 'MITRE ATLAS',
  'nist:ai:measure': 'NIST AI RMF',
  'owasp:api': 'OWASP API Top 10',
  'owasp:llm': 'OWASP LLM Top 10',
  'owasp:agentic': 'OWASP Agentic v1.0',
  'eu:ai-act': 'EU AI Act',
};

export const OWASP_LLM_TOP_10_NAMES = [
  'Prompt Injection',
  'Sensitive Information Disclosure',
  'Supply Chain',
  'Improper Output Handling',
  'Insecure Output Handling',
  'Excessive Agency',
  'System Prompt Leakage',
  'Vector and Embedding Weaknesses',
  'Misinformation',
  'Unbounded Consumption',
];

export const OWASP_API_TOP_10_NAMES = [
  'Broken Object Level Authorization',
  'Broken Authentication',
  'Broken Object Property Level Authorization',
  'Unrestricted Resource Consumption',
  'Broken Function Level Authorization',
  'Unrestricted Access to Sensitive Business Flows',
  'Server Side Request Forgery',
  'Security Misconfiguration',
  'Improper Inventory Management',
  'Unsafe Consumption of APIs',
];

export const OWASP_AGENTIC_NAMES = ['T1: Memory Poisoning'];

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
      'bias:gender',
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
    plugins: ['divergent-repetition', 'reasoning-dos'],
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

/**
 * OWASP Agentic AI - Threats and Mitigations v1.0 (February 2025)
 */
export const OWASP_AGENTIC_REDTEAM_MAPPING: Record<
  string,
  { plugins: Plugin[]; strategies: Strategy[] }
> = {
  'owasp:agentic:t01': {
    plugins: [MEMORY_POISONING_PLUGIN_ID],
    strategies: [],
  },
};

/**
 * Maps each major phase of the OWASP GenAI Red Teaming Blueprint
 * to relevant Promptfoo plugins and strategies for automated testing.
 */
export const OWASP_LLM_RED_TEAM_MAPPING: Record<
  string,
  { plugins: Plugin[]; strategies: Strategy[] }
> = {
  /**
   * Phase 1: Model Evaluation
   * Focus: Alignment, robustness, bias, "socio-technological harms,"
   *        and data risk at the base model layer.
   */
  'owasp:llm:redteam:model': {
    plugins: [...FOUNDATION_PLUGINS],
    strategies: [
      'jailbreak',
      'jailbreak:tree',
      'jailbreak:composite',
      'crescendo',
      'goat',
      'prompt-injection',
      'best-of-n',
      'multilingual',
    ],
  },

  /**
   * Phase 2: Implementation Evaluation
   * Focus: Guardrails, knowledge retrieval security (RAG), content filtering bypass,
   *        access control tests, and other "middle tier" application-level defenses.
   */
  'owasp:llm:redteam:implementation': {
    plugins: [
      ...PII_PLUGINS,
      'prompt-extraction',
      'harmful:privacy',
      'rbac',
      'bfla',
      'bola',
      'ascii-smuggling',
    ],
    strategies: [
      'jailbreak',
      'jailbreak:tree',
      'jailbreak:composite',
      'prompt-injection',
      'hex',
      'base64',
      'homoglyph',
      'leetspeak',
      'morse',
      'piglatin',
      'rot13',
    ],
  },

  /**
   * Phase 3: System Evaluation
   * Focus: Full-application or system-level vulnerabilities, supply chain,
   *        sandbox escapes, resource controls, and overall infrastructure.
   */
  'owasp:llm:redteam:system': {
    plugins: [
      'shell-injection',
      'sql-injection',
      'ssrf',
      'debug-access',
      'tool-discovery',
      'indirect-prompt-injection',
      'hijacking',
    ],
    strategies: [
      'jailbreak',
      'jailbreak:tree',
      'jailbreak:composite',
      'crescendo',
      'goat',
      'multilingual',
      'pandamonium',
      'gcg',
    ],
  },

  /**
   * Phase 4: Runtime / Human & Agentic Evaluation
   * Focus: Live environment, human-agent interaction, multi-agent chaining,
   *        brand & trust issues, social engineering, and over-reliance.
   */
  'owasp:llm:redteam:runtime': {
    plugins: [
      'excessive-agency',
      'overreliance',
      'pliny',
      'competitors',
      'imitation',
      'politics',
      'religion',
      'harmful:radicalization',
      'harmful:self-harm',
      'harmful:hate',
    ],
    strategies: ['crescendo', 'goat', 'jailbreak:tree', 'jailbreak:composite', 'prompt-injection'],
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

/**
 *  EU Artificial Intelligence Act
 *  ▸ Art. 5  (Prohibited AI practices)           – unacceptable-risk
 *  ▸ Annex III (High-risk AI systems, Art. 6(2)) – high-risk
 *
 *  Sources:
 *   * Art. 5 list of prohibitions  [oai_citation:0‡Artificial Intelligence Act](https://artificialintelligenceact.eu/article/5/?utm_source=chatgpt.com)
 *   * Annex III high-risk categories  [oai_citation:1‡Lexology](https://www.lexology.com/library/detail.aspx?g=ec2aab25-67aa-4635-87a0-fc43d9fd1f51&utm_source=chatgpt.com)
 */
export const EU_AI_ACT_MAPPING: Record<string, { plugins: Plugin[]; strategies: Strategy[] }> = {
  /* ----------  Art. 5 – Prohibited practices  --------------------------------- */
  'eu:ai-act:art5:subliminal-manipulation': {
    plugins: ['hijacking', 'intent', 'excessive-agency'],
    strategies: ['jailbreak', 'jailbreak:tree', 'jailbreak:composite', 'prompt-injection'],
  },
  'eu:ai-act:art5:exploitation-of-vulnerabilities': {
    plugins: ['hijacking', 'imitation', 'harmful:misinformation-disinformation'],
    strategies: [],
  },
  'eu:ai-act:art5:social-scoring': {
    plugins: ['harmful:misinformation-disinformation', 'overreliance'],
    strategies: [],
  },
  'eu:ai-act:art5:biometric-categorisation': {
    plugins: ['pii:direct', 'pii:session', 'harmful:privacy'],
    strategies: [],
  },
  'eu:ai-act:art5:remote-biometric-id-live': {
    plugins: ['pii:session', 'pii:direct', 'harmful:privacy'],
    strategies: [],
  },
  'eu:ai-act:art5:remote-biometric-id-post': {
    plugins: ['pii:api-db', 'pii:direct', 'harmful:privacy'],
    strategies: [],
  },

  /* ----------  Annex III – High-risk use-cases  ------------------------------- */
  'eu:ai-act:annex3:biometric-id': {
    plugins: ['pii:direct', 'pii:session', 'harmful:privacy'],
    strategies: [],
  },
  'eu:ai-act:annex3:critical-infrastructure': {
    plugins: ['shell-injection', 'sql-injection', 'ssrf', 'excessive-agency'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'eu:ai-act:annex3:education': {
    plugins: ['harmful:misinformation-disinformation', 'hallucination', 'overreliance'],
    strategies: [],
  },
  'eu:ai-act:annex3:employment': {
    plugins: ['imitation', 'pii:direct', 'overreliance'],
    strategies: [],
  },
  'eu:ai-act:annex3:essential-services': {
    plugins: ['pii:direct', 'pii:session', 'excessive-agency'],
    strategies: [],
  },
  'eu:ai-act:annex3:law-enforcement': {
    plugins: ['pii:direct', 'pii:api-db', 'harmful:privacy'],
    strategies: [],
  },
  'eu:ai-act:annex3:migration-border': {
    plugins: ['pii:direct', 'harmful:hate', 'harmful:privacy'],
    strategies: [],
  },
  'eu:ai-act:annex3:justice-democracy': {
    plugins: ['hallucination', 'harmful:misinformation-disinformation', 'pii:direct'],
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
  'owasp:llm:redteam:model',
  'owasp:llm:redteam:implementation',
  'owasp:llm:redteam:system',
  'owasp:llm:redteam:runtime',
  'toxicity',
  'bias',
  'misinformation',
  'illegal-activity',
  'personal-safety',
  'eu:ai-act',
  ...Object.keys(MITRE_ATLAS_MAPPING),
  ...Object.keys(NIST_AI_RMF_MAPPING),
  ...Object.keys(OWASP_API_TOP_10_MAPPING),
  ...Object.keys(OWASP_LLM_TOP_10_MAPPING),
  ...Object.keys(OWASP_AGENTIC_REDTEAM_MAPPING),
  ...Object.keys(EU_AI_ACT_MAPPING),
] as const;

export const ALIASED_PLUGIN_MAPPINGS: Record<
  string,
  Record<string, { plugins: string[]; strategies: string[] }>
> = {
  'mitre:atlas': MITRE_ATLAS_MAPPING,
  'nist:ai:measure': NIST_AI_RMF_MAPPING,
  'owasp:api': OWASP_API_TOP_10_MAPPING,
  'owasp:llm': OWASP_LLM_TOP_10_MAPPING,
  'owasp:llm:redteam': OWASP_LLM_RED_TEAM_MAPPING,
  'owasp:agentic:redteam': OWASP_AGENTIC_REDTEAM_MAPPING,
  'eu:ai-act': EU_AI_ACT_MAPPING,
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
      plugins: ['politics', 'religion', 'bias:gender'],
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
  'eu:ai-act',
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

export const DATASET_PLUGINS = [
  'beavertails',
  'cyberseceval',
  'donotanswer',
  'harmbench',
  'toxic-chat',
  'pliny',
  'unsafebench',
  'xstest',
] as const;
export type DatasetPlugin = (typeof DATASET_PLUGINS)[number];

export const ADDITIONAL_STRATEGIES = [
  'audio',
  'base64',
  'best-of-n',
  'camelcase',
  'citation',
  'crescendo',
  'gcg',
  'goat',
  'hex',
  'homoglyph',
  'image',
  'jailbreak:likert',
  'jailbreak:tree',
  'leetspeak',
  'math-prompt',
  'morse',
  'multilingual',
  'pandamonium',
  'piglatin',
  'prompt-injection',
  'retry',
  'rot13',
  'video',
] as const;
export type AdditionalStrategy = (typeof ADDITIONAL_STRATEGIES)[number];

export const STRATEGY_COLLECTIONS = ['other-encodings'] as const;
export type StrategyCollection = (typeof STRATEGY_COLLECTIONS)[number];

export const STRATEGY_COLLECTION_MAPPINGS: Record<StrategyCollection, string[]> = {
  'other-encodings': ['camelcase', 'morse', 'piglatin'],
};

const _ALL_STRATEGIES = [
  'default',
  ...DEFAULT_STRATEGIES,
  ...ADDITIONAL_STRATEGIES,
  ...STRATEGY_COLLECTIONS,
] as const;
export const ALL_STRATEGIES = [..._ALL_STRATEGIES].sort();
export type Strategy = (typeof ALL_STRATEGIES)[number];

export const subCategoryDescriptions: Record<Plugin | Strategy, string> = {
  [MEMORY_POISONING_PLUGIN_ID]: 'Tests whether an agent is vulnerable to memory poisoning attacks',
  'ascii-smuggling': 'Tests vulnerability to Unicode tag-based instruction smuggling attacks',
  audio: 'Tests handling of audio content',
  base64: 'Tests handling of Base64-encoded malicious payloads',
  basic: 'Original plugin tests without any additional strategies or optimizations',
  beavertails: 'Tests handling of malicious prompts from the BeaverTails dataset',
  'best-of-n': 'Jailbreak technique published by Anthropic and Stanford',
  bfla: 'Tests for broken function-level authorization vulnerabilities (OWASP API 5)',
  'bias:gender': 'Tests handling of gender bias, stereotypes, and discrimination',
  bola: 'Tests for broken object-level authorization vulnerabilities (OWASP API 1)',
  bopla: 'Tests for Broken Object Property Level Authorization',
  cca: 'Tests for vulnerability to Context Compliance Attacks using fabricated conversation history',
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
  donotanswer: 'Tests for vulnerabilities to Do Not Answer attacks',
  'excessive-agency': 'Tests for unauthorized actions beyond defined system boundaries',
  foundation: 'Tests a collection of plugins designed to run against foundation models',
  gcg: 'Greedy Coordinate Gradient adversarial suffix attack',
  goat: 'Dynamic multi-turn attack generation using adversarial techniques',
  hallucination: 'Tests for fabrication of false or misleading information',
  harmbench: 'Tests for harmful content using the HarmBench dataset',
  'toxic-chat': 'Tests handling of toxic prompts from the ToxicChat dataset',
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
  homoglyph:
    'Tests handling of homoglyph (visually similar Unicode characters) encoding to bypass filters',
  image: 'Tests handling of image content',
  imitation: 'Tests handling of unauthorized impersonation of entities',
  'indirect-prompt-injection': 'Tests for injection vulnerabilities via untrusted variables',
  intent: 'Tests for manipulation of system behavior via specific prompts',
  jailbreak: 'Single-shot optimization of safety bypass techniques',
  'jailbreak:composite': 'Combines multiple jailbreak techniques for enhanced effectiveness',
  'jailbreak:likert': 'Uses Likert scale-based prompts to bypass content filters',
  'jailbreak:tree': 'Tree-based search for optimal safety bypass vectors',
  leetspeak: 'Tests handling of leetspeak-encoded malicious content',
  'math-prompt': 'Tests handling of mathematical notation-based attacks',
  morse: 'Tests handling of content encoded in Morse code to potentially bypass filters',
  multilingual: 'Tests handling of attacks across multiple languages',
  mcp: 'Tests for vulnerabilities to Model Context Protocol (MCP) attacks',
  'off-topic':
    'Tests whether AI systems can be manipulated to go off-topic from their intended purpose',
  overreliance: 'Tests for overreliance on system assumptions',
  pandamonium:
    "[Experimental] Promptfoo's blackbox jailbreak. The latest and greatest jailbreak techniques, expertly tuned and crafted by Promptfoo's AI team.",
  pii: 'Tests handling of personal identifiable information',
  'pii:api-db': 'Tests for PII exposure via API/database access',
  'pii:direct': 'Tests for direct PII exposure vulnerabilities',
  'pii:session': 'Tests for PII exposure in session data',
  'pii:social': 'Tests for PII exposure via social engineering',
  piglatin: 'Tests handling of content translated to Pig Latin to potentially bypass filters',
  camelcase: 'Tests handling of text transformed into camelCase to potentially bypass filters',
  pliny: 'Tests handling of Pliny prompt injections',
  policy: 'Tests compliance with custom security policies',
  politics: 'Tests handling of political content and bias',
  'prompt-extraction': 'Tests for system prompt disclosure vulnerabilities',
  'prompt-injection': 'Tests for direct prompt injection vulnerabilities',
  'rag-document-exfiltration': 'Tests for RAG document exfiltration',
  'rag-poisoning': 'Tests for vulnerabilities to RAG retrieval poisoning attacks',
  rbac: 'Tests role-based access control implementation',
  'reasoning-dos':
    'Tests for vulnerabilities to computational resource exhaustion through excessive reasoning patterns',
  religion: 'Tests handling of religious content and bias',
  retry:
    'Automatically incorporates previously failed test cases to build a regression testing suite',
  'resource-consumption': 'Unrestricted Resource Consumption tests',
  rot13: 'Tests handling of ROT13-encoded malicious content',
  'shell-injection': 'Tests for command injection vulnerabilities',
  'sql-injection': 'Tests for SQL injection vulnerabilities',
  ssrf: 'Tests for server-side request forgery vulnerabilities',
  'system-prompt-override': 'Tests for system prompt override vulnerabilities',
  'tool-discovery': 'Tests for enumeration of available tools and function calls',
  'tool-discovery:multi-turn':
    'Uses conversational approach to discover available tools, functions, and capabilities through multi-step interactions',
  unsafebench: 'Tests handling of unsafe image content from the UnsafeBench dataset',
  'unrestricted-access': 'Unrestricted Access to Sensitive Business Flows tests',
  xstest: 'Tests for XSTest attacks',
  video: 'Tests handling of video content',
  'other-encodings':
    'Collection of alternative text transformation strategies (Morse code, Pig Latin, and camelCase) for testing evasion techniques',
};

// These names are displayed in risk cards and in the table
export const displayNameOverrides: Record<Plugin | Strategy, string> = {
  [MEMORY_POISONING_PLUGIN_ID]: 'Agentic Memory Poisoning',
  'ascii-smuggling': 'ASCII Smuggling',
  audio: 'Audio Content',
  base64: 'Base64 Payload Encoding',
  basic: 'Baseline Testing',
  bopla: 'Object-Property-Level Authorization Bypass',
  beavertails: 'BeaverTails Dataset',
  'toxic-chat': 'ToxicChat Dataset',
  'best-of-n': 'Best-of-N',
  bfla: 'Function-Level Authorization Bypass',
  bola: 'Object-Level Authorization Bypass',
  camelcase: 'CamelCase Encoding',
  cca: 'Context Compliance Attack',
  citation: 'Authority Bias Exploitation',
  competitors: 'Competitors',
  contracts: 'Unauthorized Commitments',
  crescendo: 'Multi-Turn Crescendo',
  'cross-session-leak': 'Cross-Session Data Leakage',
  cyberseceval: 'CyberSecEval Dataset',
  'debug-access': 'Debug Interface Exposure',
  default: 'Standard Security Suite',
  'divergent-repetition': 'Divergent Repetition',
  donotanswer: 'Do Not Answer Dataset',
  'excessive-agency': 'Excessive Agency',
  foundation: 'Foundation Model Plugin Collection',
  gcg: 'Greedy Coordinate Gradient',
  mcp: 'Model Context Protocol',
  'off-topic': 'Off-Topic Manipulation',
  goat: 'Generative Offensive Agent Tester',
  hallucination: 'False Information (Hallucination)',
  harmbench: 'HarmBench Dataset',
  harmful: 'Malicious Content Suite',
  'bias:gender': 'Gender Bias',
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
  homoglyph: 'Homoglyph Encoding',
  image: 'Image Content',
  imitation: 'Entity Impersonation',
  'indirect-prompt-injection': 'Indirect Prompt Injection',
  intent: 'Intent',
  jailbreak: 'Single-shot Optimization',
  'jailbreak:composite': 'Multi-Vector Safety Bypass',
  'jailbreak:likert': 'Likert Scale Jailbreak',
  'jailbreak:tree': 'Tree-Based Attack Search',
  leetspeak: 'Leetspeak Payload Encoding',
  'math-prompt': 'Mathematical Notation Attack',
  morse: 'Morse Code Encoding',
  multilingual: 'Cross-Language Attack',
  'other-encodings': 'Collection of Text Encodings',
  overreliance: 'Overreliance',
  pandamonium: '[Experimental] Pandamonium',
  piglatin: 'Pig Latin Encoding',
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
  'rag-poisoning': 'RAG Poisoning',
  rbac: 'RBAC Implementation',
  'reasoning-dos': 'Reasoning DoS',
  religion: 'Religious Bias',
  retry: 'Regression Testing',
  'resource-consumption': 'Resource Consumption',
  rot13: 'ROT13 Payload Encoding',
  'shell-injection': 'Command Injection',
  'sql-injection': 'SQL Injection',
  ssrf: 'SSRF Vulnerability',
  'system-prompt-override': 'System Prompt Override',
  'tool-discovery': 'Tool Discovery',
  'tool-discovery:multi-turn': 'Multi-turn Tool Discovery',
  'unrestricted-access': 'Unrestricted Access',
  unsafebench: 'UnsafeBench Dataset',
  xstest: 'XSTest Dataset',
  video: 'Video Content',
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
  [MEMORY_POISONING_PLUGIN_ID]: Severity.High,
  'ascii-smuggling': Severity.Low,
  beavertails: Severity.Low,
  bfla: Severity.High,
  bola: Severity.High,
  bopla: Severity.High,
  cca: Severity.High,
  mcp: Severity.High,
  'off-topic': Severity.Medium,
  competitors: Severity.Low,
  contracts: Severity.Medium,
  'cross-session-leak': Severity.Medium,
  cyberseceval: Severity.Medium,
  donotanswer: Severity.Medium,
  'debug-access': Severity.High,
  default: Severity.Low,
  'divergent-repetition': Severity.Medium,
  'excessive-agency': Severity.Medium,
  foundation: Severity.Medium,
  hallucination: Severity.Medium,
  harmbench: Severity.Medium,
  'toxic-chat': Severity.Medium,
  harmful: Severity.Medium,
  'bias:gender': Severity.Low,
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
  'rag-poisoning': Severity.Medium,
  rbac: Severity.High,
  'reasoning-dos': Severity.Low,
  religion: Severity.Low,
  'resource-consumption': Severity.High,
  'shell-injection': Severity.High,
  'sql-injection': Severity.High,
  ssrf: Severity.High,
  'system-prompt-override': Severity.High,
  'tool-discovery:multi-turn': Severity.Low,
  'tool-discovery': Severity.Low,
  'unrestricted-access': Severity.High,
  unsafebench: Severity.Medium,
  xstest: Severity.Low,
};

export const riskCategories: Record<string, Plugin[]> = {
  'Security & Access Control': [
    // System security
    'agentic:memory-poisoning',
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
    'tool-discovery',
    'tool-discovery:multi-turn',

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

    MEMORY_POISONING_PLUGIN_ID,
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
    'bias:gender',
    'harmful:child-exploitation',
    'harmful:graphic-content',
    'harmful:harassment-bullying',
    'harmful:hate',
    'harmful:insults',
    'harmful:profanity',
    'harmful:radicalization',
    'harmful:self-harm',
    'harmful:sexual-content',
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

  Datasets: [
    'beavertails',
    'cyberseceval',
    'donotanswer',
    'harmbench',
    'toxic-chat',
    'pliny',
    'unsafebench',
    'xstest',
  ],
};

export const categoryDescriptions = {
  'Security & Access Control': 'Data protection, access control, and system security risks.',
  'Compliance & Legal': 'Regulatory compliance, legal, and policy violation risks.',
  'Trust & Safety': 'Harmful, inappropriate, or offensive content generation risks.',
  Brand: 'Output reliability, accuracy, and brand reputation risks.',
  Datasets: 'Pre-defined test cases from research datasets.',
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
  [MEMORY_POISONING_PLUGIN_ID]: 'AgenticMemoryPoisoning',
  'ascii-smuggling': 'AsciiSmuggling',
  beavertails: 'BeaverTails',
  bfla: 'BFLAEnforcement',
  bola: 'BOLAEnforcement',
  bopla: 'BOPLAEnforcement',
  cca: 'CCAEnforcement',
  competitors: 'CompetitorEndorsement',
  contracts: 'ContractualCommitment',
  'cross-session-leak': 'CrossSessionLeak',
  cyberseceval: 'CyberSecEval',
  donotanswer: 'DoNotAnswer',
  'debug-access': 'DebugAccess',
  default: 'Default',
  mcp: 'MCP',
  'off-topic': 'OffTopic',
  'divergent-repetition': 'DivergentRepetition',
  'excessive-agency': 'ExcessiveAgency',
  'tool-discovery': 'ToolDiscovery',
  'tool-discovery:multi-turn': 'Multi-turn Tool Discovery',
  foundation: 'Foundation',
  hallucination: 'Hallucination',
  harmbench: 'Harmbench',
  'toxic-chat': 'ToxicChat',
  harmful: 'Harmful',
  'bias:gender': 'Gender Bias',
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
  'rag-poisoning': 'RAG Poisoning',
  rbac: 'RbacEnforcement',
  'reasoning-dos': 'Reasoning DoS',
  'resource-consumption': 'Resource Consumption',
  religion: 'Religion',
  'shell-injection': 'ShellInjection',
  'sql-injection': 'SqlInjection',
  ssrf: 'SSRFEnforcement',
  'system-prompt-override': 'System Prompt Override',
  'unrestricted-access': 'Unrestricted Access',
  unsafebench: 'UnsafeBench',
  xstest: 'XSTest',
};

export const categoryAliasesReverse = Object.entries(categoryAliases).reduce(
  (acc, [key, value]) => {
    acc[value] = key;
    return acc;
  },
  {} as Record<string, string>,
);

export const pluginDescriptions: Record<Plugin, string> = {
  [MEMORY_POISONING_PLUGIN_ID]: 'Tests whether an agent is vulnerable to memory poisoning attacks',
  'ascii-smuggling': 'Tests for ASCII-based prompt smuggling vulnerabilities',
  beavertails: 'Tests handling of malicious prompts from the BeaverTails dataset',
  bfla: 'Evaluates function-level authorization controls to identify privilege escalation vulnerabilities (OWASP API Security Top 10 #5)',
  bola: 'Tests object-level authorization mechanisms to detect unauthorized data access vulnerabilities (OWASP API Security Top 10 #1)',
  bopla:
    'Tests object-property-level authorization mechanisms to detect unauthorized data access vulnerabilities',
  cca: 'Tests for vulnerability to Context Compliance Attacks using fabricated conversation history',
  competitors:
    'Assesses system protection against unauthorized competitor endorsements and brand security risks',
  contracts: 'Evaluates safeguards against unauthorized contractual commitments and legal exposure',
  'cross-session-leak':
    'Tests for information leakage vulnerabilities between different user sessions',
  cyberseceval: "Tests prompt injection attacks from Meta's CyberSecEval dataset",
  donotanswer: 'Tests for vulnerabilities to Do Not Answer attacks',
  'debug-access':
    'Identifies exposed debugging interfaces and unauthorized command execution vectors',
  default: 'Executes comprehensive baseline security testing across multiple risk categories',
  'divergent-repetition':
    'Tests repetitive patterns that can cause the model to diverge from normal behavior and leak training data',
  'excessive-agency': 'Evaluates system boundary enforcement and unauthorized action prevention',
  'tool-discovery': 'Tests for enumeration of available tools and function calls',
  'tool-discovery:multi-turn': 'Multi-turn Tool Discovery',
  foundation: 'Tests a collection of plugins designed to run against foundation models',
  hallucination: 'Tests system resilience against false information generation and propagation',
  harmbench:
    'Tests for harmful content, illegal activities, misinformation using the HarmBench dataset from the Center for AI Safety (CAIS)',
  'toxic-chat': 'Tests handling of toxic user prompts from the ToxicChat dataset',
  harmful: 'Comprehensive suite for testing handling of various categories of malicious content',
  'bias:gender': 'Tests handling of gender bias in responses, stereotypes, and discrimination',
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
  mcp: 'Tests for vulnerabilities to Model Context Protocol (MCP) attacks',
  'off-topic':
    'Tests whether AI systems can be manipulated to go off-topic from their intended purpose by performing tasks completely outside their domain',
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
  'rag-poisoning': 'Tests resistance against poisoning attacks on RAG retrieval systems',
  rbac: 'Tests implementation of role-based access control mechanisms',
  'reasoning-dos':
    'Tests for vulnerabilities to computational resource exhaustion through excessive reasoning patterns',
  'resource-consumption': 'Tests for unrestricted resource consumption',
  religion: 'Assesses handling of religious content and bias mitigation',
  'shell-injection': 'Tests protection against command injection vulnerabilities',
  'sql-injection': 'Evaluates resilience against SQL injection attacks',
  ssrf: 'Tests for server-side request forgery vulnerabilities',
  'system-prompt-override': 'Tests for system prompt override vulnerabilities',
  'unrestricted-access': 'Tests for unrestricted access to sensitive business flows',
  unsafebench:
    'Tests handling of unsafe image content through multi-modal model evaluation and safety filters',
  xstest:
    'Tests how models handle ambiguous terms related to potentially harmful topics like violence and drugs',
};

export const strategyDescriptions: Record<Strategy, string> = {
  audio: 'Tests detection and handling of audio-based malicious payloads',
  base64: 'Tests detection and handling of Base64-encoded malicious payloads',
  basic: 'Equivalent to no strategy. Always included. Can be disabled in configuration.',
  'best-of-n': 'Jailbreak technique published by Anthropic and Stanford',
  camelcase:
    'Tests detection and handling of text transformed into camelCase format to potentially bypass content filters',
  citation: 'Exploits academic authority bias to circumvent content filtering mechanisms',
  crescendo: 'Executes progressive multi-turn attacks with escalating malicious intent',
  default: 'Applies standard security testing methodology',
  gcg: 'Greedy Coordinate Gradient adversarial suffix attack',
  goat: 'Deploys dynamic attack generation using advanced adversarial techniques',
  hex: 'Tests detection and handling of hex-encoded malicious payloads',
  homoglyph:
    'Tests detection and handling of text with homoglyphs (visually similar Unicode characters)',
  image: 'Tests detection and handling of image-based malicious payloads',
  jailbreak: 'Optimizes single-turn attacks to bypass security controls',
  'jailbreak:composite': 'Chains multiple attack vectors for enhanced effectiveness',
  'jailbreak:likert': 'Uses Likert scale-based prompts to bypass content filters',
  'jailbreak:tree': 'Implements tree-based search for optimal attack paths',
  leetspeak: 'Assesses handling of leetspeak-encoded malicious content',
  'math-prompt': 'Tests resilience against mathematical notation-based attacks',
  morse:
    'Tests detection and handling of text encoded in Morse code where letters are converted to dots and dashes to potentially bypass content filters',
  multilingual: 'Evaluates cross-language attack vector handling',
  'other-encodings':
    'Collection of alternative text transformation strategies (Morse code, Pig Latin, and camelCase) for testing evasion techniques',
  pandamonium:
    "Promptfoo's exclusive dynamic jailbreak strategy currently in development. Note: This is an expensive jailbreak strategy with no limit on probes.",
  piglatin:
    'Tests detection and handling of text transformed into Pig Latin, a language game where initial consonant clusters are moved to the end of words with "ay" added',
  'prompt-injection': 'Tests direct prompt injection vulnerability detection',
  retry: 'Automatically incorporates previously failed test cases to prevent regression',
  rot13: 'Assesses handling of ROT13-encoded malicious payloads',
  video: 'Tests detection and handling of video-based malicious payloads',
};

export const strategyDisplayNames: Record<Strategy, string> = {
  audio: 'Audio',
  base64: 'Base64 Encoding',
  basic: 'Basic',
  'best-of-n': 'Best-of-N',
  camelcase: 'CamelCase',
  citation: 'Authority Bias',
  crescendo: 'Multi-turn Crescendo',
  default: 'Basic',
  gcg: 'Greedy Coordinate Gradient',
  goat: 'Generative Offensive Agent Tester',
  hex: 'Hex Encoding',
  homoglyph: 'Homoglyph Encoding',
  image: 'Image',
  jailbreak: 'Single-shot Optimization',
  'jailbreak:composite': 'Composite Jailbreaks',
  'jailbreak:likert': 'Likert Scale Jailbreak',
  'jailbreak:tree': 'Tree-based Optimization',
  leetspeak: 'Leetspeak Encoding',
  'math-prompt': 'Mathematical Encoding',
  morse: 'Morse Code',
  multilingual: 'Multilingual Translation',
  'other-encodings': 'Collection of Text Encodings',
  pandamonium: 'Pandamonium',
  piglatin: 'Pig Latin',
  'prompt-injection': 'Prompt Injection',
  retry: 'Regression Testing',
  rot13: 'ROT13 Encoding',
  video: 'Video',
};

export const PLUGIN_PRESET_DESCRIPTIONS: Record<string, string> = {
  Custom: 'Choose your own plugins',
  'EU AI Act': 'Plugins mapped to EU AI Act prohibited & high-risk requirements',
  Foundation: 'Plugins for redteaming foundation models recommended by Promptfoo',
  Harmful: 'Harmful content assessment using MLCommons and HarmBench taxonomies',
  'Minimal Test': 'Minimal set of plugins to validate your setup',
  MITRE: 'MITRE ATLAS framework',
  NIST: 'NIST AI Risk Management Framework',
  'OWASP Agentic AI Top 10': 'OWASP Agentic AI Top 10 Threats and Mitigations',
  'OWASP API Top 10': 'OWASP API security vulnerabilities framework',
  'OWASP Gen AI Red Team': 'OWASP Gen AI Red Teaming Best Practices',
  'OWASP LLM Top 10': 'OWASP LLM security vulnerabilities framework',
  RAG: 'Recommended plugins plus additional tests for RAG specific scenarios like access control',
  Recommended: 'A broad set of plugins recommended by Promptfoo',
} as const;

export const DEFAULT_OUTPUT_PATH = 'redteam.yaml';
