import { HARM_CATEGORIES } from './legacy/harmful';

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

export const DEFAULT_PLUGINS = new Set([...BASE_PLUGINS, ...Object.keys(HARM_CATEGORIES)]);
export const ALL_PLUGINS = new Set([...DEFAULT_PLUGINS, ...ADDITIONAL_PLUGINS]);
