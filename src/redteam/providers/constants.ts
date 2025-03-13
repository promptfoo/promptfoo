export const ATTACKER_MODEL = 'gpt-4o-2024-05-13';

export const ATTACKER_MODEL_SMALL = 'gpt-4o-mini';

export const TEMPERATURE = process.env.PROMPTFOO_JAILBREAK_TEMPERATURE
  ? Number.parseFloat(process.env.PROMPTFOO_JAILBREAK_TEMPERATURE)
  : 0.5;
