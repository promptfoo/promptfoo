import { getEnvFloat, getEnvInt } from '../../envars';

export const ATTACKER_MODEL = 'gpt-5.5-2026-04-23';

export const ATTACKER_MODEL_SMALL = 'gpt-5.4-mini-2026-03-17';

export const TEMPERATURE = getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  ? getEnvFloat('PROMPTFOO_JAILBREAK_TEMPERATURE')
  : 0.7;

/** Resolve the short-call default after request-scoped env files have loaded. */
export function getRedteamProviderMaxTokens(): number {
  const value = getEnvInt('PROMPTFOO_REDTEAM_PROVIDER_MAX_TOKENS', 4096);
  return Number.isSafeInteger(value) ? Math.max(1, value) : 4096;
}
