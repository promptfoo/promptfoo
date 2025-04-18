export const ATTACKER_MODEL = 'gpt-4.1-2025-04-14';

export const ATTACKER_MODEL_SMALL = 'gpt-4o-mini';

export const TEMPERATURE = process.env.PROMPTFOO_JAILBREAK_TEMPERATURE
  ? Number.parseFloat(process.env.PROMPTFOO_JAILBREAK_TEMPERATURE)
  : 0.5;
