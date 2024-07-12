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
  competitors: Severity.Low,
  contracts: Severity.Medium,
  hallucination: Severity.Medium,
  hijacking: Severity.High,
  jailbreak: Severity.Medium,
  overreliance: Severity.Low,
  pii: Severity.High,
  politics: Severity.Low,
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
  competitors: 'CompetitorEndorsement',
  contracts: 'ContractualCommitment',
  hallucination: 'Hallucination',
  hijacking: 'Hijacking',
  jailbreak: 'Harmful/Iterative',
  overreliance: 'Overreliance',
  pii: 'PIILeak',
  politics: 'PoliticalStatement',
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
  'experimental-jailbreak': 'Apply jailbreaks to all attack types',
};
