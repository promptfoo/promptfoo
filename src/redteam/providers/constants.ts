export const ATTACKER_MODEL = 'o3-mini-2025-01-31';

export const ATTACKER_MODEL_SMALL = 'gpt-4o-mini';

export const TEMPERATURE = process.env.PROMPTFOO_JAILBREAK_TEMPERATURE
  ? Number.parseFloat(process.env.PROMPTFOO_JAILBREAK_TEMPERATURE)
  : 0.5;
