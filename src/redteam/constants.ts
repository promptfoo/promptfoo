export const REDTEAM_MODEL = 'openai:chat:gpt-4o';
export const LLAMA_GUARD_REPLICATE_PROVIDER =
  'replicate:moderation:meta/meta-llama-guard-2-8b:b063023ee937f28e922982abdbf97b041ffe34ad3b35a53d33e1d74bb19b36c4';

export const BASE_PLUGINS = [
  'contracts',
  'excessive-agency',
  'hallucination',
  'harmful',
  'hijacking',
  'jailbreak',
  'overreliance',
  'pii',
  'politics',
  'prompt-injection',
];

export const ADDITIONAL_PLUGINS = ['competitors', 'experimental-jailbreak'];

export const LLAMA_GUARD_HARM_CATEGORIES: { [key: string]: string } = {
  // MLCommons harm categories
  // https://llama.meta.com/docs/model-cards-and-prompt-formats/meta-llama-guard-2/
  'harmful:violent-crime': 'Violent Crimes',
  'harmful:non-violent-crime': 'Non-Violent Crimes',
  'harmful:sex-crime': 'Sex Crimes',
  'harmful:child-exploitation': 'Child Exploitation',
  'harmful:specialized-advice': 'Specialized Advice - Financial',

  'harmful:indiscriminate-weapons': 'Indiscriminate Weapons',
  'harmful:hate': 'Hate',
  'harmful:self-harm': 'Self-Harm',
  'harmful:sexual-content': 'Sexual Content',

  // Harmbench taxonomy
  // https://arxiv.org/pdf/2402.04249
  'harmful:cybercrime': 'Cybercrime & Unauthorized Intrusion - Hacking and Malware',
  'harmful:chemical-biological-weapons': 'Chemical & Biological Weapons',
  'harmful:illegal-drugs': 'Illegal Drugs',
  'harmful:copyright-violations': 'Copyright Violations - Copyrighted text',
  'harmful:harassment-bullying': 'Harassment & Bullying',
  'harmful:illegal-activities': 'Illegal Activities - Fraud & scams',
  'harmful:graphic-content': 'Graphic & age-restricted content',
  'harmful:unsafe-practices': 'Promotion of unsafe practices',
  //'harmful:privacy-violations': 'Privacy violations & data exploitation',  // redundant with MLCommons category

  // Other
  'harmful:radicalization': 'Radicalization',
  'harmful:profanity': 'Requests containing profanity',
  'harmful:insults': 'Insults and personal attacks',
  //'scam_fraud_creation',
  //'locale_specific_illegal (e.g. hate speech in Germany, alcohol in Saudi Arabia)',
};

export const REDTEAM_PROVIDER_HARM_CATEGORIES: { [key: string]: string } = {
  'harmful:intellectual-property': 'Intellectual Property violation',
  'harmful:misinformation-disinformation':
    'Misinformation & Disinformation - Harmful lies and propaganda',
  'harmful:privacy': 'Privacy violations',
};

export const DEFAULT_PLUGINS = new Set([
  ...BASE_PLUGINS,
  ...Object.keys(LLAMA_GUARD_HARM_CATEGORIES),
  ...Object.keys(REDTEAM_PROVIDER_HARM_CATEGORIES),
]);
export const ALL_PLUGINS = new Set([...DEFAULT_PLUGINS, ...ADDITIONAL_PLUGINS]);
