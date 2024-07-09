import { HARM_CATEGORIES } from './plugins/legacy/harmful';

export const REDTEAM_MODEL = 'openai:chat:gpt-4o';

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
