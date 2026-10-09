import { type EnvVarKey, getEnvOverrides, getEnvString } from '../envars';

/** Resolve aliases within each scope; an empty value masks only that variable. */
export function resolveProviderEnv(
  env: Readonly<Record<string, string | undefined>> | undefined,
  names: readonly string[],
  ambientNames: readonly string[] = names,
): { name: string; value: string } | undefined {
  const masked = new Set<string>();
  const ambient = Object.fromEntries(names.map((name) => [name, getEnvString(name as EnvVarKey)]));
  for (const layer of [env, getEnvOverrides(), getEnvOverrides('file'), ambient]) {
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
