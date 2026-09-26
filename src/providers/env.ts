import { type EnvVarKey, getEnvOverrides, getEnvString } from '../envars';

/** Resolve aliases within each scope; an empty value masks only that variable. */
export function resolveProviderEnv(
  env: Readonly<Record<string, string | undefined>> | undefined,
  names: readonly string[],
): { name: string; value: string } | undefined {
  const masked = new Set<string>();
  for (const layer of [
    env,
    getEnvOverrides(),
    getEnvOverrides('file'),
    Object.fromEntries(names.map((name) => [name, getEnvString(name as EnvVarKey)])),
  ]) {
    for (const name of names) {
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
