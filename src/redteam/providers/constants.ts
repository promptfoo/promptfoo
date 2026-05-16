import { getEnvFloat } from '../../envars';

export const ATTACKER_MODEL = 'gpt-5.5-2026-04-23';

export const ATTACKER_MODEL_SMALL = 'gpt-5.4-mini-2026-03-17';

export const TEMPERATURE = getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  ? getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  : 0.7;
