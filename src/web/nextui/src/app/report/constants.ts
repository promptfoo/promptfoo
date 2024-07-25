export const riskCategories = {
  'Brand Risk': [
    'competitors',
    'politics',
    'excessive-agency',
    'hallucination',
    'overreliance',
    'harmful:graphic-content',
    'harmful:indiscriminate-weapons',
    'harmful:misinformation-disinformation',
    'harmful:non-violent-crime',
    'harmful:radicalization',
    'harmful:unsafe-practices',
  ],
  'Legal Risk': [
    'harmful:child-exploitation',
    'harmful:copyright-violations',
    'harmful:cybercrime',
    'harmful:illegal-activities',
    'harmful:illegal-drugs',
    'harmful:intellectual-property',
    'harmful:privacy',
    'harmful:sex-crime',
    'harmful:sexual-content',
    'harmful:specialized-advice',
    'harmful:violent-crime',
    'harmful:self-harm',
    'rbac',
    'contracts',
  ],
  'Malicious Attacks': [
    'harmful:harassment-bullying',
    'harmful:hate',
    'harmful:insults',
    'harmful:profanity',
    'hijacking',
    'jailbreak',
    'pii',
    'prompt-injection',
    'shell-injection',
    'sql-injection',
    'debug-access',
  ],
};

export const categoryDescriptions = {
  'Brand Risk': 'Risks that can affect the brand reputation and trustworthiness.',
  'Legal Risk': 'Risks that can lead to legal consequences or violations.',
  'Malicious Attacks': 'Risks involving malicious activities targeting the system or users.',
};

export enum Severity {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
}

export const riskCategorySeverityMap: Record<string, Severity> = {
  'debug-access': Severity.High,
  'excessive-agency': Severity.Medium,
  'harmful:child-exploitation': Severity.Critical,
  'harmful:copyright-violations': Severity.Medium,
  'harmful:cybercrime': Severity.High,
  'harmful:graphic-content': Severity.Medium,
  'harmful:harassment-bullying': Severity.High,
  'harmful:hate': Severity.Critical,
  'harmful:illegal-activities': Severity.High,
  'harmful:illegal-drugs': Severity.High,
  'harmful:indiscriminate-weapons': Severity.Medium,
  'harmful:insults': Severity.Low,
  'harmful:intellectual-property': Severity.Medium,
  'harmful:misinformation-disinformation': Severity.Medium,
  'harmful:non-violent-crime': Severity.Medium,
  'harmful:privacy': Severity.High,
  'harmful:profanity': Severity.Low,
  'harmful:radicalization': Severity.High,
  'harmful:self-harm': Severity.Critical,
  'harmful:sex-crime': Severity.Critical,
  'harmful:sexual-content': Severity.High,
  'harmful:specialized-advice': Severity.High,
  'harmful:unsafe-practices': Severity.Low,
  'harmful:violent-crime': Severity.Critical,
  'prompt-injection': Severity.Medium,
  'shell-injection': Severity.High,
  'sql-injection': Severity.High,
  competitors: Severity.Low,
  contracts: Severity.Medium,
  hallucination: Severity.Medium,
  hijacking: Severity.High,
  jailbreak: Severity.Medium,
  overreliance: Severity.Low,
  pii: Severity.High,
  politics: Severity.Low,
  rbac: Severity.High,
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

// Map from metric name or harm category to plugin name
export const categoryAliases = {
  'debug-access': 'DebugInterface',
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
  jailbreak: 'Harmful/Iterative',
  overreliance: 'Overreliance',
  pii: 'PIILeak',
  politics: 'PoliticalStatement',
  rbac: 'RbacEnforcement',
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
  'excessive-agency': 'Excessive Agency',
  'prompt-injection': 'Prompt Injection',
  competitors: 'Competitor Endorsements',
  contracts: 'Unsupervised Contracts',
  jailbreak: 'Jailbreak',
  pii: 'PII Leaks',
  politics: 'Political Opinions',
  'shell-injection': 'Shell Injection',
  'sql-injection': 'SQL Injection',
  rbac: 'RBAC Enforcement',
  'debug-access': 'Debug Access',
  'harmful:specialized-advice': 'Specialized Advice',
  'harmful:illegal-activities': 'Illegal Activities',
  'harmful:cybercrime': 'Cybercrime',
  'harmful:copyright-violations': 'Copyright Violations',
  'harmful:misinformation-disinformation': 'Misinformation & disinformation',
};

// Duplicated in src/redteam/constants.ts for backend
export const subCategoryDescriptions: Record<string, string> = {
  'excessive-agency': 'Model taking excessive initiative or misunderstanding its capabilities.',
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
  'prompt-injection': "Malicious inputs designed to manipulate the model's behavior.",
  competitors: 'Competitor mentions and endorsements',
  contracts: 'Enters business or legal commitments without supervision.',
  hallucination: 'Model generating false or misleading information.',
  hijacking: 'Unauthorized or off-topic resource use.',
  jailbreak: 'Bypassing security measures or restrictions.',
  overreliance: 'Model susceptible to relying on an incorrect user assumption or input.',
  pii: 'Exposure or misuse of personally identifiable information.',
  politics: 'Makes political statements.',
  'jailbreak:tree': 'Apply tree jailbreaks to all attack types',
  'sql-injection': 'Attempts to perform SQL injection attacks to manipulate database queries.',
  'shell-injection': 'Attempts to execute shell commands through the model.',
  'debug-access': 'Attempts to access or use debugging commands.',
  rbac: 'Tests whether the model properly implements Role-Based Access Control (RBAC).',
};
