import { getEnvString } from '../envars';

import type { EnvOverrides } from '../types/env';

export function getDefaultRedteamTemperature(env?: EnvOverrides): number {
  const value =
    env?.PROMPTFOO_JAILBREAK_TEMPERATURE ?? getEnvString('PROMPTFOO_JAILBREAK_TEMPERATURE');
  if (value === undefined || value === '') {
    return 0.7;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0.7 : parsed;
}
