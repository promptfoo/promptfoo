import { type EnvVarKey, getEnvOverrides, getEnvString } from '../envars';
import { getExplicitProviderEnv } from '../envOverrides';

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

// A process-only credential or executable must never fall back to the host
// setting when an invocation clears or replaces it.
export function hasAgentEnvOverride(
  names: readonly string[],
  env?: Readonly<Record<string, string | undefined>>,
): boolean {
  return [env, getEnvOverrides('provider'), getEnvOverrides(), getEnvOverrides('file')].some(
    (layer) => names.some((name) => layer?.[name] !== undefined),
  );
}
