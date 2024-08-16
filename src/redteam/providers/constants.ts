export const ATTACKER_MODEL = 'gpt-4o';

export const TEMPERATURE = process.env.PROMPTFOO_JAILBREAK_TEMPERATURE
  ? parseFloat(process.env.PROMPTFOO_JAILBREAK_TEMPERATURE)
  : 0.5;

export const PENALIZED_PHRASES = ['in the face of impending doom'];
