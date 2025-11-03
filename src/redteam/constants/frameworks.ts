import { FOUNDATION_PLUGINS, PII_PLUGINS } from './plugins';

import type { Plugin } from './plugins';
import type { Strategy } from './strategies';

export const FRAMEWORK_NAMES: Record<string, string> = {
  'mitre:atlas': 'MITRE ATLAS',
  'nist:ai:measure': 'NIST AI RMF',
  'owasp:api': 'OWASP API Top 10',
  'owasp:llm': 'OWASP LLM Top 10',
  'owasp:agentic': 'OWASP Agentic v1.0',
  'eu:ai-act': 'EU AI Act',
  'iso:42001': 'ISO/IEC 42001',
  gdpr: 'GDPR',
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

export const OWASP_AGENTIC_NAMES = [
  'T1: Memory Poisoning',
  'T2: Tool Misuse',
  'T3: Privilege Compromise',
  'T4: Cascading Hallucination Attacks',
  'T5: Intent Breaking & Goal Manipulation',
  'T6: Misaligned & Deceptive Behaviors',
  'T8: Identity Spoofing & Impersonation',
  'T10: Unexpected Remote Code Execution & Code Attacks',
];

export const GDPR_ARTICLE_NAMES = [
  'Principles of Processing Personal Data',
  'Special Categories of Personal Data',
  'Right of Access',
  'Right to Erasure',
  'Automated Decision-Making',
  'Data Protection by Design',
  'Security of Processing',
];

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
      'bias:age',
      'bias:disability',
      'bias:gender',
      'bias:race',
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
    // T1: Memory Poisoning
    plugins: ['agentic:memory-poisoning'],
    strategies: [],
  },
  'owasp:agentic:t02': {
    // T2: Tool Misuse
    plugins: ['excessive-agency', 'mcp', 'tool-discovery'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'owasp:agentic:t03': {
    // T3: Privilege Compromise
    plugins: ['rbac', 'bfla', 'bola'],
    strategies: [],
  },
  'owasp:agentic:t04': {
    // T4: Cascading Hallucination Attacks
    plugins: ['hallucination', 'harmful:misinformation-disinformation'],
    strategies: ['jailbreak', 'prompt-injection'],
  },
  'owasp:agentic:t05': {
    // T5: Intent Breaking & Goal Manipulation
    plugins: ['hijacking', 'system-prompt-override'],
    strategies: ['jailbreak', 'prompt-injection', 'jailbreak:composite'],
  },
  'owasp:agentic:t06': {
    // T6: Misaligned & Deceptive Behaviors
    plugins: ['contracts', 'goal-misalignment', 'excessive-agency'],
    strategies: ['jailbreak', 'crescendo'],
  },
  'owasp:agentic:t08': {
    // T8: Identity Spoofing & Impersonation
    plugins: ['imitation', 'cross-session-leak', 'pii:session'],
    strategies: [],
  },
  'owasp:agentic:t10': {
    // T10: Unexpected Remote Code Execution & Code Attacks
    plugins: ['shell-injection', 'sql-injection', 'harmful:cybercrime:malicious-code', 'ssrf'],
    strategies: ['jailbreak', 'prompt-injection'],
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
    strategies: ['jailbreak', 'jailbreak:tree', 'jailbreak:composite', 'crescendo', 'goat', 'gcg'],
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
    strategies: [],
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

/**
 * ISO/IEC 42001 – AI Management System (AIMS) framework risk areas
 * Covers key risk domains: human oversight, fairness, privacy, robustness, security, ethics, transparency.
 */
export const ISO_42001_MAPPING: Record<string, { plugins: Plugin[]; strategies: Strategy[] }> = {
  'iso:42001:accountability': {
    // Human oversight & accountability – prevent over-autonomy and misuse
    plugins: ['excessive-agency', 'overreliance', 'hijacking'],
    strategies: [],
  },
  'iso:42001:fairness': {
    // Fairness & bias – prevent discrimination or hate in AI outcomes
    plugins: ['bias:age', 'bias:disability', 'bias:gender', 'bias:race', 'harmful:hate'],
    strategies: [],
  },
  'iso:42001:privacy': {
    // Data privacy & protection – prevent personal data leaks
    plugins: ['harmful:privacy', 'pii:api-db', 'pii:direct', 'pii:session', 'pii:social'],
    strategies: [],
  },
  'iso:42001:robustness': {
    // Robustness – resilience against prompt injection and adversarial input
    plugins: ['ascii-smuggling', 'prompt-extraction'],
    strategies: ['jailbreak', 'jailbreak:composite', 'jailbreak:tree'],
  },
  'iso:42001:security': {
    // Technical security – resistance to code injection and exploitation
    plugins: ['shell-injection', 'sql-injection', 'ssrf', 'debug-access'],
    strategies: ['jailbreak', 'jailbreak:composite', 'base64', 'rot13'],
  },
  'iso:42001:safety': {
    // Safety & ethical use – prevent harmful, illegal, or unethical outputs
    plugins: [
      'harmful:chemical-biological-weapons',
      'harmful:child-exploitation',
      'harmful:violent-crime',
      'harmful:cybercrime',
      'harmful:cybercrime:malicious-code',
    ],
    strategies: ['jailbreak', 'jailbreak:composite', 'jailbreak:tree'],
  },
  'iso:42001:transparency': {
    // Transparency & trust – avoid misinformation, deception, or unsupported claims
    plugins: [
      'harmful:misinformation-disinformation',
      'hallucination',
      'imitation',
      'unverifiable-claims',
      'politics',
      'religion',
    ],
    strategies: [],
  },
};

/**
 * EU General Data Protection Regulation (GDPR)
 * Maps key GDPR articles to relevant Promptfoo plugins for testing AI/LLM systems
 * for compliance with data protection requirements.
 *
 * Sources:
 *  * GDPR full text: https://gdpr-info.eu/
 */
export const GDPR_MAPPING: Record<string, { plugins: Plugin[]; strategies: Strategy[] }> = {
  'gdpr:art5': {
    // Article 5 - Principles relating to processing of personal data
    // (lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy)
    plugins: [
      'harmful:privacy',
      'pii:api-db',
      'pii:direct',
      'pii:session',
      'pii:social',
      'hallucination',
      'harmful:misinformation-disinformation',
    ],
    strategies: [],
  },
  'gdpr:art9': {
    // Article 9 - Processing of special categories of personal data
    // (sensitive data like health, biometric, genetic data, racial/ethnic origin)
    plugins: [
      'pii:direct',
      'pii:social',
      'harmful:privacy',
      'bias:age',
      'bias:disability',
      'bias:gender',
      'bias:race',
    ],
    strategies: [],
  },
  'gdpr:art15': {
    // Article 15 - Right of access by the data subject
    plugins: ['pii:api-db', 'pii:session', 'rbac', 'bola', 'bfla'],
    strategies: [],
  },
  'gdpr:art17': {
    // Article 17 - Right to erasure ("right to be forgotten")
    plugins: ['pii:api-db', 'pii:direct', 'pii:session', 'harmful:privacy', 'cross-session-leak'],
    strategies: [],
  },
  'gdpr:art22': {
    // Article 22 - Automated individual decision-making, including profiling
    plugins: [
      'bias:age',
      'bias:disability',
      'bias:gender',
      'bias:race',
      'harmful:hate',
      'overreliance',
      'hallucination',
    ],
    strategies: [],
  },
  'gdpr:art25': {
    // Article 25 - Data protection by design and by default
    plugins: [
      'harmful:privacy',
      'pii:api-db',
      'pii:direct',
      'pii:session',
      'pii:social',
      'prompt-extraction',
      // 'cross-session-leak',
    ],
    strategies: [],
  },
  'gdpr:art32': {
    // Article 32 - Security of processing
    plugins: [
      'shell-injection',
      'sql-injection',
      'ssrf',
      'debug-access',
      'harmful:cybercrime',
      'rbac',
      'bfla',
      'bola',
    ],
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
  'owasp:agentic:redteam',
  'toxicity',
  'bias',
  'misinformation',
  'illegal-activity',
  'personal-safety',
  'tool-discovery:multi-turn',
  'eu:ai-act',
  'iso:42001',
  'gdpr',
  ...Object.keys(MITRE_ATLAS_MAPPING),
  ...Object.keys(NIST_AI_RMF_MAPPING),
  ...Object.keys(OWASP_API_TOP_10_MAPPING),
  ...Object.keys(OWASP_LLM_TOP_10_MAPPING),
  ...Object.keys(OWASP_AGENTIC_REDTEAM_MAPPING),
  ...Object.keys(EU_AI_ACT_MAPPING),
  ...Object.keys(ISO_42001_MAPPING),
  ...Object.keys(GDPR_MAPPING),
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
  'iso:42001': ISO_42001_MAPPING,
  gdpr: GDPR_MAPPING,
  'tool-discovery:multi-turn': {
    'tool-discovery:multi-turn': {
      plugins: ['tool-discovery'],
      strategies: [],
    },
  },
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
      plugins: ['politics', 'religion', 'bias:age', 'bias:disability', 'bias:gender', 'bias:race'],
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
