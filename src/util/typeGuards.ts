/**
 * Type guard utilities for runtime type narrowing.
 * Use these to narrow types early and simplify downstream code.
 */

import type { ProviderOptions } from '../types/providers';

/**
 * Check if a value is a non-null object.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Check if a value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a value is a function.
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Provider type guards for config loading and processing.
 */

/**
 * Check if a provider value is a string ID (e.g., "openai:gpt-4").
 */
export function isProviderString(provider: unknown): provider is string {
  return typeof provider === 'string';
}

/**
 * Check if a provider value is a function.
 */
export function isProviderFunction(provider: unknown): provider is (...args: unknown[]) => unknown {
  return typeof provider === 'function';
}

/**
 * Check if a provider has a config property with actual content.
 */
export function isProviderWithConfig(
  provider: unknown,
): provider is ProviderOptions & { config: NonNullable<ProviderOptions['config']> } {
  return isObject(provider) && 'config' in provider && provider.config != null;
}

/**
 * Check if provider is a map-style object (e.g., { "openai:gpt-4": { config: ... } }).
 * Map-style providers have a single key that is the provider ID.
 */
export function isProviderMap(provider: unknown): provider is Record<string, ProviderOptions> {
  if (!isObject(provider)) return false;
  const keys = Object.keys(provider);
  // A map-style provider has exactly one key and no 'id' or 'config' at top level
  return keys.length === 1 && !('id' in provider) && !('config' in provider);
}

/**
 * Resolve a provider to ProviderOptions, handling map-style providers.
 * Returns null for string or function providers.
 */
export function resolveProviderOptions(provider: unknown): ProviderOptions | null {
  if (isProviderString(provider) || isProviderFunction(provider)) {
    return null;
  }
  if (isProviderMap(provider)) {
    const values = Object.values(provider);
    return values[0] ?? null;
  }
  if (isObject(provider)) {
    return provider as ProviderOptions;
  }
  return null;
}

/**
 * Default test config type guard for redteam provider loading.
 */
export interface DefaultTestConfig {
  provider?: unknown;
  options?: {
    provider?: unknown | { text?: unknown };
  };
}

export function isDefaultTestConfig(value: unknown): value is DefaultTestConfig {
  return isObject(value);
}

/**
 * Extract provider config from defaultTest, checking multiple paths.
 */
export function extractProviderFromDefaultTest(defaultTest: unknown): unknown {
  if (!isDefaultTestConfig(defaultTest)) {
    return undefined;
  }

  // Check direct provider property
  if (defaultTest.provider !== undefined) {
    return defaultTest.provider;
  }

  // Check options.provider.text path
  const optionsProvider = defaultTest.options?.provider;
  if (isObject(optionsProvider) && 'text' in optionsProvider) {
    return optionsProvider.text;
  }

  // Check options.provider path
  if (optionsProvider !== undefined) {
    return optionsProvider;
  }

  return undefined;
}

/**
 * Convert a string array to a Zod-compatible non-empty tuple type.
 * Use this to avoid `as unknown as [string, ...string[]]` casts.
 *
 * This function asserts at runtime that the array is non-empty,
 * then returns it with the correct tuple type for z.enum().
 *
 * @example
 * const OPTIONS = ['a', 'b', 'c'] as const;
 * z.enum(toZodEnum(OPTIONS))  // No cast needed
 */
export function toZodEnum<T extends string>(arr: readonly T[] | T[]): [T, ...T[]] {
  if (arr.length === 0) {
    throw new Error('toZodEnum requires a non-empty array');
  }
  return arr as unknown as [T, ...T[]];
}

/**
 * Type-safe array inclusion check.
 * Use this instead of `arr.includes(value as any)`.
 */
export function includesString<T extends string>(arr: readonly T[], value: string): value is T {
  return (arr as readonly string[]).includes(value);
}

/**
 * Assert that a condition is true, narrowing the type.
 */
export function assertDefined<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}
