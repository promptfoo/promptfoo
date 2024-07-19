import { ALL_PLUGINS } from '@/../../../redteam/constants';

export { subCategoryDescriptions } from '@/../../../redteam/constants';

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

export const riskCategorySeverityMap: Record<(typeof ALL_PLUGINS)[number], Severity> = {
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
export const categoryAliases: Record<(typeof ALL_PLUGINS)[number], string> = {
  'debug-access': 'DebugInterface',
  'excessive-agency': 'ExcessiveAgency',
  'harmful:child-exploitation': 'Child Exploitation',
  'harmful:copyright-violations': 'Copyright Violations',
  'harmful:cybercrime': 'Cybercrime',
  'harmful:graphic-content': 'Graphic Content',
  'harmful:harassment-bullying': 'Harassment & Bullying',
  'harmful:hate': 'Hate',
  'harmful:illegal-activities': 'Illegal Activities',
  'harmful:illegal-drugs': 'Illegal Drugs',
  'harmful:indiscriminate-weapons': 'Indiscriminate Weapons',
  'harmful:insults': 'Insults',
  'harmful:intellectual-property': 'Intellectual Property',
  'harmful:misinformation-disinformation': 'Misinformation & Disinformation',
  'harmful:non-violent-crime': 'Non-Violent Crime',
  'harmful:privacy': 'Privacy',
  'harmful:profanity': 'Profanity',
  'harmful:radicalization': 'Radicalization',
  'harmful:self-harm': 'Self-Harm',
  'harmful:sex-crime': 'Sex Crimes',
  'harmful:sexual-content': 'Sexual Content',
  'harmful:specialized-advice': 'Specialized Advice',
  'harmful:unsafe-practices': 'Other Unsafe Practices',
  'harmful:violent-crime': 'Violent Crimes',
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

export const categoryAliasesReverse: Record<string, (typeof ALL_PLUGINS)[number]> = Object.entries(
  categoryAliases,
).reduce(
  (acc, [key, value]) => {
    acc[value] = key;
    return acc;
  },
  {} as Record<string, (typeof ALL_PLUGINS)[number]>,
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
};
