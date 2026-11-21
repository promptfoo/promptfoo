import cliState from '../cliState';
import { getEnvOverrides, getEnvString } from '../envars';

import type { EnvOverrides } from '../contracts/env';
import type { ApiProvider } from '../types/providers';

/** Bind a fresh automatic provider's lazy environment reads for its entire call. */
export function bindRedteamProviderEnvironment<T extends ApiProvider>(
  provider: T,
  env?: EnvOverrides,
  jsonOnly = false,
): T {
  const snapshot = { ...(env ?? getEnvOverrides()) };
  const fileEnv = { ...getEnvOverrides('file') };
  const callApi = provider.callApi.bind(provider);
  provider.callApi = async (...args) => {
    const response = await cliState.withEnvFileOverrides(fileEnv, () =>
      cliState.withEnv(snapshot, () => callApi(...args)),
    );
    return jsonOnly && response.output !== null && typeof response.output === 'object'
      ? { ...response, output: JSON.stringify(response.output) }
      : response;
  };
  return provider;
}

export function getDefaultRedteamTemperature(env?: EnvOverrides): number {
  const value =
    env?.PROMPTFOO_JAILBREAK_TEMPERATURE ?? getEnvString('PROMPTFOO_JAILBREAK_TEMPERATURE');
  if (value === undefined || value === '') {
    return 0.7;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0.7;
}

/** Ordinary grading must not initialize or authenticate extra provider clients. */
export function withRedteamDefaults<T extends object>(
  defaults: T,
  env: EnvOverrides | undefined,
  create: (env: EnvOverrides, temperature: number, jsonOnly: boolean) => ApiProvider,
) {
  const snapshot = { ...getEnvOverrides(), ...env };
  const fileEnv = { ...getEnvOverrides('file') };
  const temperature = getDefaultRedteamTemperature(snapshot);
  const build = (jsonOnly: boolean) =>
    cliState.withEnvFileOverrides(fileEnv, () =>
      cliState.withEnv(snapshot, () =>
        bindRedteamProviderEnvironment(create(snapshot, temperature, jsonOnly), snapshot, jsonOnly),
      ),
    );
  let plain: ApiProvider | undefined;
  let json: ApiProvider | undefined;
  return {
    ...defaults,
    get redteamProvider() {
      return (plain ??= build(false));
    },
    get redteamJsonProvider() {
      return (json ??= build(true));
    },
  };
}
