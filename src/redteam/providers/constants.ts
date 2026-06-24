import { getEnvFloat, getEnvInt } from '../../envars';

export const ATTACKER_MODEL = 'gpt-5.5-2026-04-23';

export const ATTACKER_MODEL_SMALL = 'gpt-5.4-mini-2026-03-17';

export const TEMPERATURE = getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  ? getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  : 0.7;

/**
 * Bounded output cap for redteam attack/grading model calls.
 *
 * These calls produce short structured decisions/attack prompts (typically a few
 * hundred tokens). Without an explicit cap they fall through to `OPENAI_MAX_TOKENS`
 * (or the model's output ceiling), so an occasional degenerate / non-terminating
 * generation can run all the way to tens of thousands of tokens — minutes of latency
 * followed by an unparseable response. Cap it here, independently of the generic
 * `OPENAI_MAX_TOKENS` knob (which is often raised for large *generation* outputs), so
 * tuning generation can never silently uncap the attack/grading providers.
 */
export const REDTEAM_PROVIDER_MAX_TOKENS = getEnvInt('PROMPTFOO_REDTEAM_PROVIDER_MAX_TOKENS', 4096);
