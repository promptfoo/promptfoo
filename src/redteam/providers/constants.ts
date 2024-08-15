export const ATTACKER_MODEL = 'gpt-4o';

export const NUM_ITERATIONS = process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS
  ? parseInt(process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS, 10)
  : 4;

export const TEMPERATURE = process.env.PROMPTFOO_JAILBREAK_TEMPERATURE
  ? parseFloat(process.env.PROMPTFOO_JAILBREAK_TEMPERATURE)
  : 0.5;

export const PENALIZED_PHRASES = ['in the face of impending doom'];
