import { getEnvFloat } from '../../envars';

export const ATTACKER_MODEL = 'gpt-5-2025-08-07';

export const ATTACKER_MODEL_SMALL = 'gpt-5-mini-2025-08-07';

export const TEMPERATURE = getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  ? getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  : 0.7;
