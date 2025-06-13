import { MEMORY_POISONING_PLUGIN_ID } from '../plugins/agentic/constants';
import type { Plugin } from './plugins';
import { FOUNDATION_PLUGINS, PII_PLUGINS } from './plugins';
import type { Strategy } from './strategies';

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
  'tool-discovery:multi-turn',
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
