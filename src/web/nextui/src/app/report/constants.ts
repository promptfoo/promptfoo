export const riskCategories = {
  'Brand Risk': [
    'competitors',
    'excessive-agency',
    'hallucination',
    'overreliance',
    'underconfidence',
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

export const subCategoryDescriptions = {
  competitors: 'Competitor mentions and endorsements',
  'excessive-agency': 'Model taking excessive initiative or misunderstanding its capabilities.',
  hallucination: 'Model generating false or misleading information.',
  overreliance: 'Model susceptible to relying on an incorrect user assumption or input.',
  underconfidence: 'Model being overly cautious or uncertain.',
  'harmful:graphic-content': 'Displaying graphic or violent content.',
  'harmful:harassment-bullying': 'Content that harasses or bullies individuals.',
  'harmful:hate': 'Content that promotes hate or discrimination.',
  'harmful:indiscriminate-weapons': 'Content related to weapons without context.',
  'harmful:insults': 'Content that insults or demeans individuals.',
  'harmful:misinformation-disinformation': 'Spreading false or misleading information.',
  'harmful:non-violent-crime': 'Content related to non-violent criminal activities.',
  'harmful:profanity': 'Content containing profane or inappropriate language.',
  'harmful:radicalization': 'Content that promotes radical or extremist views.',
  'harmful:self-harm': 'Content that encourages self-harm or suicide.',
  'harmful:unsafe-practices': 'Content promoting unsafe or harmful practices.',
  'harmful:child-exploitation': 'Content exploiting or harming children.',
  'harmful:copyright-violations': 'Content violating copyright laws.',
  'harmful:cybercrime': 'Content related to cybercriminal activities.',
  'harmful:illegal-activities': 'Content promoting illegal activities.',
  'harmful:illegal-drugs': 'Content related to illegal drug use or trade.',
  'harmful:intellectual-property': 'Content violating intellectual property rights.',
  'harmful:privacy': 'Content violating privacy rights.',
  'harmful:sex-crime': 'Content related to sexual crimes.',
  'harmful:sexual-content': 'Explicit or inappropriate sexual content.',
  'harmful:specialized-advice': 'Providing advice in specialized fields without expertise.',
  'harmful:violent-crime': 'Content related to violent criminal activities.',
  hijacking: 'Unauthorized or off-topic resource use.',
  jailbreak: 'Bypassing security measures or restrictions.',
  pii: 'Exposure or misuse of personally identifiable information.',
  'prompt-injection': "Malicious inputs designed to manipulate the model's behavior.",
};

export enum Severity {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
}

export const riskCategorySeverityMap: Record<string, Severity> = {
  competitors: Severity.Low,
  'excessive-agency': Severity.Medium,
  hallucination: Severity.Medium,
  overreliance: Severity.Low,
  underconfidence: Severity.Low,
  'harmful:graphic-content': Severity.Medium,
  'harmful:harassment-bullying': Severity.High,
  'harmful:hate': Severity.Critical,
  'harmful:indiscriminate-weapons': Severity.Medium,
  'harmful:insults': Severity.Low,
  'harmful:misinformation-disinformation': Severity.Medium,
  'harmful:non-violent-crime': Severity.Medium,
  'harmful:profanity': Severity.Low,
  'harmful:radicalization': Severity.High,
  'harmful:self-harm': Severity.Critical,
  'harmful:unsafe-practices': Severity.Low,
  'harmful:child-exploitation': Severity.Critical,
  'harmful:copyright-violations': Severity.Medium,
  'harmful:cybercrime': Severity.High,
  'harmful:illegal-activities': Severity.High,
  'harmful:illegal-drugs': Severity.High,
  'harmful:intellectual-property': Severity.Medium,
  'harmful:privacy': Severity.High,
  'harmful:sex-crime': Severity.Critical,
  'harmful:sexual-content': Severity.High,
  'harmful:specialized-advice': Severity.High,
  'harmful:violent-crime': Severity.Critical,
  hijacking: Severity.High,
  jailbreak: Severity.Medium,
  pii: Severity.High,
  'prompt-injection': Severity.Medium,
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

export const categoryAliases = {
  'excessive-agency': 'Excessive Agency',
  overreliance: 'Overreliance',
  competitors: 'Competitor Endorsements',
  hallucination: 'Hallucination',
  underconfidence: 'Underconfidence',
  'harmful:non-violent-crime': 'Non-Violent Crime',
  'harmful:indiscriminate-weapons': 'Indiscriminate Weapons',
  'harmful:hate': 'Hate',
  'harmful:self-harm': 'Self-Harm',
  'harmful:radicalization': 'Radicalization',
  'harmful:profanity': 'Profanity',
  'harmful:insults': 'Insults',
  'harmful:harassment-bullying': 'Harassment & Bullying',
  'harmful:illegal-activities': 'Illegal Activities',
  'harmful:graphic-content': 'Graphic Content',
  'harmful:unsafe-practices': 'Unsafe Practices',
  'harmful:misinformation-disinformation': 'Misinformation & Disinformation',
  'harmful:cybercrime': 'Cybercrime',
  'harmful:illegal-drugs': 'Illegal Drugs',
  'harmful:violent-crime': 'Violent Crimes',
  'harmful:sex-crime': 'Sex Crimes',
  'harmful:child-exploitation': 'Child Exploitation',
  'harmful:sexual-content': 'Sexual Content',
  'harmful:copyright-violations': 'Copyright Violations',
  'harmful:privacy': 'Privacy',
  'harmful:intellectual-property': 'Intellectual Property',
  'harmful:specialized-advice': 'Specialized Advice',
  hijacking: 'Hijacking',
  jailbreak: 'Jailbreak',
  'prompt-injection': 'Prompt Injection',
  pii: 'Personally Identifiable Information (PII)',
};

export const categoryAliasesReverse = Object.entries(categoryAliases).reduce(
  (acc, [key, value]) => {
    acc[value] = key;
    return acc;
  },
  {} as Record<string, string>,
);
