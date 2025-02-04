export const PLUGIN_CATEGORIES = [
  'Brand',
  'Compliance and Legal',
  'Security and Access Control',
  'Trust and Safety',
  'Custom',
] as const;

export interface CategoryDescription {
  category: PluginCategory;
  description: string;
}

export const CATEGORY_DESCRIPTIONS: CategoryDescription[] = [
  {
    category: 'Brand',
    description:
      'Tests focused on brand protection, including competitor mentions, misinformation, hallucinations, and model behavior that could impact brand reputation.',
  },
  {
    category: 'Compliance and Legal',
    description:
      'Tests for LLM behavior that may encourage illegal activity, breach contractual commitments, or violate intellectual property rights.',
  },
  {
    category: 'Security and Access Control',
    description:
      'Technical security risk tests mapped to OWASP Top 10 for LLMs, APIs, and web applications, covering SQL injection, SSRF, broken access control, and cross-session leaks.',
  },
  {
    category: 'Trust and Safety',
    description:
      'Tests that attempt to produce illicit, graphic, or inappropriate responses from the LLM.',
  },
  {
    category: 'Custom',
    description:
      'Configurable tests for specific policies or generating custom probes for your use case.',
  },
];

export const humanReadableCategoryList =
  PLUGIN_CATEGORIES.slice(0, -1).join(', ') + ', and ' + PLUGIN_CATEGORIES.slice(-1);

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];

export interface ApplicationTypes {
  agent: boolean;
  chat: boolean;
  rag: boolean;
}

export type VulnerabilityType =
  | 'criminal'
  | 'custom'
  | 'harmful'
  | 'misinformation and misuse'
  | 'privacy'
  | 'security';

export interface Plugin {
  applicationTypes: ApplicationTypes;
  category: PluginCategory;
  description: string;
  label: string | null;
  link: string;
  name: string;
  pluginId: string;
  vulnerabilityType: VulnerabilityType;
}

// Type utility at the top
type AssertArrayIsSorted<T extends readonly { pluginId: string }[]> = T extends readonly [
  infer First extends { pluginId: string },
  infer Second extends { pluginId: string },
  ...infer Rest extends { pluginId: string }[],
]
  ? First['pluginId'] extends `${string}${Second['pluginId']}${string}`
    ? 'Array is not sorted by pluginId'
    : AssertArrayIsSorted<[Second, ...Rest]>
  : unknown;

// Define array first, then assert type
export const PLUGINS = [
  {
    category: 'Security and Access Control',
    description: 'Attempts to obfuscate malicious content using ASCII smuggling',
    label: 'technical',
    link: '/docs/red-team/plugins/ascii-smuggling/',
    name: 'ASCII Smuggling',
    pluginId: 'ascii-smuggling',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Trust and Safety',
    description: 'Uses the BeaverTails prompt injection dataset',
    label: 'harmful',
    link: '/docs/red-team/plugins/beavertails/',
    name: 'BeaverTails',
    pluginId: 'beavertails',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Trust and Safety',
    description: 'Tests handling of methamphetamine-related content',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Methamphetamine',
    pluginId: 'harmful:illegal-drugs:meth',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful content',
  },
  {
    category: 'Trust and Safety',
    description: 'Tests handling of Improvised Explosive Devices',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'IED',
    pluginId: 'harmful:weapons:ied',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful content',
  },
  {
    category: 'Security and Access Control',
    description: 'Tests creation of malicious code',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Malicious Code',
    pluginId: 'harmful:cybercrime:malicious-code',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Security and Access Control',
    description: 'Broken Function Level Authorization (BFLA) tests',
    label: 'technical',
    link: '/docs/red-team/plugins/bfla/',
    name: 'Privilege Escalation',
    pluginId: 'bfla',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Security and Access Control',
    description: 'Broken Object Level Authorization (BOLA) tests',
    label: 'technical',
    link: '/docs/red-team/plugins/bola/',
    name: 'Unauthorized Data Access',
    pluginId: 'bola',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Brand',
    description: 'Competitor mentions and endorsements',
    label: 'technical',
    link: '/docs/red-team/plugins/competitors/',
    name: 'Competitor Endorsement',
    pluginId: 'competitors',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Compliance and Legal',
    description: 'Enters business or legal commitments without supervision',
    label: 'brand',
    link: '/docs/red-team/plugins/contracts/',
    name: 'Unsupervised Contracts',
    pluginId: 'contracts',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Security and Access Control',
    description: 'Checks for information sharing between unrelated sessions',
    label: 'technical',
    link: '/docs/red-team/plugins/cross-session-leak/',
    name: 'Cross-Session Leak',
    pluginId: 'cross-session-leak',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Trust and Safety',
    description: 'Tests prompt injection attacks using the CyberSecEval dataset',
    label: 'technical',
    link: '/docs/red-team/plugins/cyberseceval/',
    name: 'CyberSecEval',
    pluginId: 'cyberseceval',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Trust and Safety',
    description: 'Tests prompt injection attacks using the Harmbench dataset',
    label: 'technical',
    link: '/docs/red-team/plugins/harmbench/',
    name: 'Harmbench',
    pluginId: 'harmbench',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Security and Access Control',
    description: 'Attempts to access or use debugging commands',
    label: 'technical',
    link: '/docs/red-team/plugins/debug-access/',
    name: 'Debug Access',
    pluginId: 'debug-access',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Security and Access Control',
    description:
      'Tests whether an AI system can be manipulated into revealing its training data through repetitive pattern exploitation.',
    label: 'security',
    link: '/docs/red-team/plugins/divergent-repetition/',
    name: 'Divergent Repetition',
    pluginId: 'divergent-repetition',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Brand',
    description: 'Model taking excessive initiative or misunderstanding its capabilities',
    label: 'brand',
    link: '/docs/red-team/plugins/excessive-agency/',
    name: 'Excessive Agency',
    pluginId: 'excessive-agency',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Brand',
    description: 'Model generating false or misleading information',
    label: 'brand',
    link: '/docs/red-team/plugins/hallucination/',
    name: 'Hallucination',
    pluginId: 'hallucination',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to chemical or biological weapons',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Chemical & Biological Weapons',
    pluginId: 'harmful:chemical-biological-weapons',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Trust and Safety',
    description: 'Content exploiting or harming children',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Child Exploitation',
    pluginId: 'harmful:child-exploitation',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content violating copyright laws',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Copyright Violations',
    pluginId: 'harmful:copyright-violations',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to cybercriminal activities',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Cybercrime',
    pluginId: 'harmful:cybercrime',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Trust and Safety',
    description: 'Displaying graphic or violent content',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Graphic Content',
    pluginId: 'harmful:graphic-content',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful',
  },
  {
    category: 'Trust and Safety',
    description: 'Content that harasses or bullies individuals',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Harassment and Bullying',
    pluginId: 'harmful:harassment-bullying',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful',
  },
  {
    category: 'Trust and Safety',
    description: 'Content that promotes hate or discrimination',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Hate Speech',
    pluginId: 'harmful:hate',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content promoting illegal activities',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Illegal Activities',
    pluginId: 'harmful:illegal-activities',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to illegal drug use or trade',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Illegal Drugs',
    pluginId: 'harmful:illegal-drugs',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to methamphetamine',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Methamphetamine',
    pluginId: 'harmful:illegal-drugs:meth',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to weapons without context',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Indiscriminate Weapons',
    pluginId: 'harmful:indiscriminate-weapons',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Trust and Safety',
    description: 'Content that insults or demeans individuals',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Insults',
    pluginId: 'harmful:insults',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content violating intellectual property rights',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Intellectual Property Violation',
    pluginId: 'harmful:intellectual-property',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to generating malicious code',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Malicious Code',
    pluginId: 'harmful:cybercrime:malicious-code',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Brand',
    description: 'Spreading false or misleading information',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Misinformation and Disinformation',
    pluginId: 'harmful:misinformation-disinformation',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to non-violent criminal activities',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Non-Violent Crime',
    pluginId: 'harmful:non-violent-crime',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Security and Access Control',
    description: 'Content violating privacy rights',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Privacy Violation',
    pluginId: 'harmful:privacy',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'privacy',
  },
  {
    category: 'Trust and Safety',
    description: 'Content containing profane or inappropriate language',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Profanity',
    pluginId: 'harmful:profanity',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful',
  },
  {
    category: 'Trust and Safety',
    description: 'Content that promotes radical or extremist views',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Radicalization',
    pluginId: 'harmful:radicalization',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful',
  },
  {
    category: 'Trust and Safety',
    description: 'Content that encourages self-harm or suicide',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Self Harm',
    pluginId: 'harmful:self-harm',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to sexual crimes',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Sex Crimes',
    pluginId: 'harmful:sex-crime',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Trust and Safety',
    description: 'Explicit or inappropriate sexual content',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Sexual Content',
    pluginId: 'harmful:sexual-content',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'harmful',
  },
  {
    category: 'Compliance and Legal',
    description: 'Providing advice in specialized fields without expertise',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Specialized Advice',
    pluginId: 'harmful:specialized-advice',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content promoting unsafe or harmful practices',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Unsafe Practices',
    pluginId: 'harmful:unsafe-practices',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to violent criminal activities',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'Violent Crime',
    pluginId: 'harmful:violent-crime',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to creating Improvised Explosive Devices',
    label: 'harmful',
    link: '/docs/red-team/plugins/harmful/',
    name: 'IEDs',
    pluginId: 'harmful:weapons:ied',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'criminal',
  },
  {
    category: 'Security and Access Control',
    description: 'Unauthorized or off-topic resource use',
    label: 'technical',
    link: '/docs/red-team/plugins/hijacking/',
    name: 'Hijacking',
    pluginId: 'hijacking',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Brand',
    description: 'Imitates people, brands, or organizations',
    label: 'brand',
    link: '/docs/red-team/plugins/imitation/',
    name: 'Imitation',
    pluginId: 'imitation',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Security and Access Control',
    description:
      'Tests if the prompt is vulnerable to instructions injected into variables in the prompt',
    label: 'technical',
    link: '/docs/red-team/plugins/indirect-prompt-injection/',
    name: 'Indirect Prompt Injection',
    pluginId: 'indirect-prompt-injection',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Custom',
    description: 'Probes the model with specific inputs',
    label: 'technical',
    link: '/docs/red-team/plugins/intent/',
    name: 'Custom Prompts',
    pluginId: 'intent',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'custom',
  },
  {
    category: 'Brand',
    description: 'Model susceptible to relying on an incorrect user assumption or input',
    label: 'technical',
    link: '/docs/red-team/plugins/overreliance/',
    name: 'Overreliance',
    pluginId: 'overreliance',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Compliance and Legal',
    description: 'Content related to RAG Document Exfiltration',
    label: 'technical',
    link: '/docs/red-team/plugins/rag-document-exfiltration',
    name: 'RAG Document Exfiltration',
    pluginId: 'rag-document-exfiltration',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Security and Access Control',
    description: 'PII exposed through API or database',
    label: 'pii',
    link: '/docs/red-team/plugins/pii/',
    name: 'PII in API/Database',
    pluginId: 'pii:api-db',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'privacy',
  },
  {
    category: 'Security and Access Control',
    description: 'Direct exposure of PII',
    label: 'pii',
    link: '/docs/red-team/plugins/pii/',
    name: 'Direct PII Exposure',
    pluginId: 'pii:direct',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'privacy',
  },
  {
    category: 'Security and Access Control',
    description: 'PII exposed in session data',
    label: 'pii',
    link: '/docs/red-team/plugins/pii/',
    name: 'PII in Session Data',
    pluginId: 'pii:session',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'privacy',
  },
  {
    category: 'Security and Access Control',
    description: 'PII exposed through social engineering',
    label: 'pii',
    link: '/docs/red-team/plugins/pii/',
    name: 'PII via Social Engineering',
    pluginId: 'pii:social',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'privacy',
  },
  {
    category: 'Trust and Safety',
    description:
      'Tests LLM systems using a curated collection of prompts from https://github.com/elder-plinius/L1B3RT4S',
    label: 'technical',
    link: '/docs/red-team/plugins/pliny/',
    name: 'Pliny',
    pluginId: 'pliny',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Custom',
    description: 'Violates a custom configured policy',
    label: 'technical',
    link: '/docs/red-team/plugins/custom/',
    name: 'Custom Topic',
    pluginId: 'policy',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'custom',
  },
  {
    category: 'Brand',
    description: 'Makes political statements',
    label: 'brand',
    link: '/docs/red-team/plugins/politics/',
    name: 'Political Opinions',
    pluginId: 'politics',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Security and Access Control',
    description: 'Attempts to get the model to reveal its system prompt',
    label: 'technical',
    link: '/docs/red-team/plugins/prompt-extraction/',
    name: 'Prompt Extraction',
    pluginId: 'prompt-extraction',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Security and Access Control',
    description: 'Tests whether the model properly implements Role-Based Access Control (RBAC)',
    label: 'technical',
    link: '/docs/red-team/plugins/rbac/',
    name: 'RBAC Enforcement',
    pluginId: 'rbac',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Trust and Safety',
    description: 'Tests handling of religious content and bias',
    label: 'brand',
    link: '/docs/red-team/plugins/religion/',
    name: 'Religious Sensitivity',
    pluginId: 'religion',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: true,
    },
    vulnerabilityType: 'misinformation and misuse',
  },
  {
    category: 'Security and Access Control',
    description: 'Attempts to execute shell commands through the model',
    label: 'technical',
    link: '/docs/red-team/plugins/shell-injection/',
    name: 'Shell Injection',
    pluginId: 'shell-injection',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Security and Access Control',
    description: 'Attempts to perform SQL injection attacks to manipulate database queries',
    label: 'technical',
    link: '/docs/red-team/plugins/sql-injection/',
    name: 'SQL Injection',
    pluginId: 'sql-injection',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Security and Access Control',
    description: 'Server-Side Request Forgery (SSRF) tests',
    label: 'technical',
    link: '/docs/red-team/plugins/ssrf/',
    name: 'Malicious Resource Fetching',
    pluginId: 'ssrf',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'security',
  },
  {
    category: 'Security and Access Control',
    description:
      'Tests if an AI system can be manipulated to ignore or override its original system prompt',
    label: 'security',
    link: '/docs/red-team/plugins/system-prompt-override',
    name: 'System Prompt Override',
    pluginId: 'system-prompt-override',
    applicationTypes: {
      rag: true,
      agent: true,
      chat: false,
    },
    vulnerabilityType: 'security',
  },
] as const as readonly Plugin[];

// Compile-time check
type _CheckSort = typeof PLUGINS extends AssertArrayIsSorted<typeof PLUGINS> ? true : false;
// Runtime check in development
if (process.env.NODE_ENV === 'development') {
  const sorted = [...PLUGINS].sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  for (let i = 0; i < PLUGINS.length; i++) {
    if (PLUGINS[i].pluginId !== sorted[i].pluginId) {
      console.error(
        `PLUGINS array is not sorted correctly at index ${i}. Expected "${sorted[i].pluginId}" but found "${PLUGINS[i].pluginId}"`,
      );
    }
  }
}
