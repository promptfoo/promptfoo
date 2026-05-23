import { getEnvString } from '../envars';

export function getDefaultRedteamTemperature(): number {
  const value = getEnvString('PROMPTFOO_JAILBREAK_TEMPERATURE');
  if (value === undefined || value === '') {
    return 0.7;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0.7 : parsed;
}
