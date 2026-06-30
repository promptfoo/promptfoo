import type { EnvOverrides } from './types/env';

const REDACTED_ENV_VALUE = '[REDACTED]';

function isSensitiveEnvEntry(key: string, value: string): boolean {
  return (
    /(?:^|_)(?:auth|authorization|cookie|credential|credentials|password|passwd|pwd|secret|session|sig|signature|token)(?:_|$)|api[_-]?key|apikey/i.test(
      key,
    ) ||
    /^(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|key-[A-Za-z0-9]{20,}|Bearer\s+.{20,}|Basic\s+.{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{35}|[A-Za-z0-9+/=_-]{64,})$/i.test(
      value,
    )
  );
}

function getSensitiveValueVariants(value: string): string[] {
  const trimmed = value.trim();
  const normalizedValues = [value, trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()];
  return Array.from(
    new Set(
      normalizedValues.flatMap((normalized) => {
        const variants = [normalized];
        try {
          variants.push(encodeURI(normalized), encodeURIComponent(normalized));
        } catch {}
        return variants;
      }),
    ),
  ).filter(Boolean);
}

/**
 * Redacts source-environment values from diagnostics in one pass. Matching is
 * performed only against the original input so a short secret cannot expand
 * exponentially by matching characters in the replacement marker.
 */
export function redactEnvValues(value: string, overrides?: EnvOverrides): string {
  const candidates = Array.from(
    new Set(
      Object.entries({ ...process.env, ...overrides })
        .filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === 'string' &&
            entry[1].length > 0 &&
            isSensitiveEnvEntry(entry[0], entry[1]),
        )
        .flatMap(([, envValue]) => getSensitiveValueVariants(envValue)),
    ),
  ).sort((left, right) => right.length - left.length);

  let redacted = '';
  let index = 0;
  while (index < value.length) {
    const match = candidates.find((candidate) => value.startsWith(candidate, index));
    if (match) {
      redacted += REDACTED_ENV_VALUE;
      index += match.length;
    } else {
      redacted += value[index];
      index++;
    }
  }
  return redacted;
}

export type EnvOverridesProvider = () => EnvOverrides | undefined;

/**
 * Module-level singleton; last-writer-wins. Scoped to the current process —
 * not propagated to `worker_threads` or child processes, which must register
 * their own provider (typically by importing `./cliState`).
 *
 * Kept dependency-free on purpose: this module is reachable from the bottom
 * of the import graph (via `envars`), so adding imports here risks circular
 * cycles with logger / cliState.
 */
let envOverridesProvider: EnvOverridesProvider | undefined;

export function setEnvOverridesProvider(provider: EnvOverridesProvider | undefined): void {
  envOverridesProvider = provider;
}

/**
 * Returns the current env overrides snapshot, or `undefined` if no provider is
 * registered. Swallows provider exceptions to preserve the invariant that
 * `getEnvString` (and its delegates `getEnvBool` / `getEnvInt` / etc.) never
 * throw on environment access — relied on by ~148 call sites.
 */
export function getEnvOverrides(): EnvOverrides | undefined {
  if (!envOverridesProvider) {
    return undefined;
  }
  try {
    return envOverridesProvider();
  } catch {
    return undefined;
  }
}
