import { getEnvString } from '../envars';
import { getEnvOverrides, withEnvOverrides } from '../envOverrides';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider } from '../types/providers';

/** Bind a fresh automatic provider's lazy environment reads for its entire call. */
export function bindRedteamProviderEnvironment<T extends ApiProvider>(
  provider: T,
  env?: EnvOverrides,
): T {
  const snapshot = { ...(env ?? getEnvOverrides()) };
  const callApi = provider.callApi.bind(provider);
  provider.callApi = (...args) => withEnvOverrides(snapshot, () => callApi(...args));
  return provider;
}

export function getDefaultRedteamTemperature(env?: EnvOverrides): number {
  const value =
    env?.PROMPTFOO_JAILBREAK_TEMPERATURE ?? getEnvString('PROMPTFOO_JAILBREAK_TEMPERATURE');
  if (value === undefined || value === '') {
    return 0.7;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0.7 : parsed;
}
