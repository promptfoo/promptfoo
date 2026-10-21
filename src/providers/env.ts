import { type EnvVarKey, getEnvOverrides, getEnvString } from '../envars';

type ProviderEnv = Readonly<Record<string, string | undefined>>;

// Keep the loader's explicit overrides separate without adding registered secrets
// to the environment used by templates or subprocesses.
const explicitProviderEnvs = new WeakMap<ProviderEnv, ProviderEnv | undefined>();

export function setExplicitProviderEnv(
  env: ProviderEnv | undefined,
  explicit: ProviderEnv | undefined,
): void {
  if (env) {
    explicitProviderEnvs.set(env, explicit);
  }
}

export function getExplicitProviderEnv(env: ProviderEnv | undefined): ProviderEnv | undefined {
  return env && explicitProviderEnvs.has(env) ? explicitProviderEnvs.get(env) : env;
}

/** Resolve aliases within each scope; an empty value masks only that variable. */
export function resolveProviderEnv(
  env: Readonly<Record<string, string | undefined>> | undefined,
  names: readonly string[],
  ambientNames: readonly string[] = names,
): { name: string; value: string } | undefined {
  const masked = new Set<string>();
  const ambient = Object.fromEntries(names.map((name) => [name, getEnvString(name as EnvVarKey)]));
  for (const layer of [
    getExplicitProviderEnv(env),
    getEnvOverrides('provider'),
    env,
    getEnvOverrides(),
    getEnvOverrides('file'),
    ambient,
  ]) {
    // A few providers historically prefer a different alias in the host environment.
    for (const name of layer === ambient ? ambientNames : names) {
      const value = layer?.[name];
      if (masked.has(name) || value === undefined) {
        continue;
      }
      masked.add(name);
      if (value) {
        return { name, value };
      }
    }
  }
  return undefined;
}
