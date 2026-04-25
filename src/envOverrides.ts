export type EnvOverrideValue = string | number | boolean | undefined;
export type EnvOverridesProvider = () => Record<string, EnvOverrideValue> | undefined;

let envOverridesProvider: EnvOverridesProvider | undefined;

export function setEnvOverridesProvider(provider: EnvOverridesProvider | undefined): void {
  envOverridesProvider = provider;
}

export function getEnvOverrides(): Record<string, EnvOverrideValue> | undefined {
  return envOverridesProvider?.();
}
