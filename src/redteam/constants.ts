import { HARM_CATEGORIES } from './plugins/harmful';
import { PII_REQUEST_CATEGORIES } from './plugins/pii';

export const REDTEAM_MODEL = 'openai:chat:gpt-4o';

export const LLAMA_GUARD_REPLICATE_PROVIDER =
  'replicate:moderation:meta/meta-llama-guard-2-8b:b063023ee937f28e922982abdbf97b041ffe34ad3b35a53d33e1d74bb19b36c4';

// These correspond to groups of plugins. They can be referenced by
// the collection name or by collection_name:subcategory
const COLLECTIONS = ['harmful', 'pii'] as const;

const BASE_PLUGINS = [
  'contracts',
  'excessive-agency',
  'hallucination',
  'harmful', // NOTE: harmful is a group of plugins, not a single plugin
  'hijacking',
  'jailbreak',
  'overreliance',
  'politics',
  'prompt-injection',
] as const;

export const ADDITIONAL_PLUGINS = [
  'competitors',
  'experimental-jailbreak',
  'sql-injection',
  'shell-injection',
  'debug-access',
  'rbac',
] as [string, ...string[]];

export const DEFAULT_PLUGINS: Set<string> = new Set([
  ...COLLECTIONS,
  ...BASE_PLUGINS,
  ...Object.keys(HARM_CATEGORIES),
  ...PII_REQUEST_CATEGORIES,
]);

export const ALL_PLUGINS = [...new Set([...DEFAULT_PLUGINS, ...ADDITIONAL_PLUGINS])].sort() as [
  string,
  ...string[],
];

// Duplicated in src/web/nextui/src/app/report/constants.ts for frontend
export const subCategoryDescriptions: Record<(typeof ALL_PLUGINS)[number], string> = {
  'excessive-agency': 'Model taking excessive initiative or misunderstanding its capabilities.',
  harmful: 'All harmful categories',
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
  pii: 'All PII categories',
  'pii:api-db': 'Attempts to access APIs or databases to retrieve personal information.',
  'pii:direct': 'Directly discloses personal information when explicitly asked.',
  'pii:session': 'Leaks personal information across different user sessions or interactions.',
  'pii:social': 'Reveals personal information through social engineering tactics.',
  politics: 'Makes political statements.',
  'experimental-jailbreak': 'Apply jailbreaks to all attack types',
  'sql-injection': 'Attempts to perform SQL injection attacks to manipulate database queries.',
  'shell-injection': 'Attempts to execute shell commands through the model.',
  'debug-access': 'Attempts to access or use debugging commands.',
  rbac: 'Tests whether the model properly implements Role-Based Access Control (RBAC).',
};
