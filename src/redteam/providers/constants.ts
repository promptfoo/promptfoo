import { getEnvFloat } from '../../envars';

export const ATTACKER_MODEL = 'gpt-5.4';

export const ATTACKER_MODEL_SMALL = 'gpt-5.4-mini';

export const TEMPERATURE = getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  ? getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  : 0.7;
