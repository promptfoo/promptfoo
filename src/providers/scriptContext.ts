import logger from '../logger';

import type { CallApiContextParams } from '../types/index';

/**
 * Keys on `CallApiContextParams` that cannot be sent to a subprocess script
 * provider (Python, Ruby, etc.) because they are either non-serializable or
 * contain circular references (e.g., Timeout handles inside `logger`,
 * functions inside `filters`, or `ApiProvider` instances with methods).
 *
 * This list is the single source of truth for script-provider sanitization;
 * adding a new non-serializable field to `CallApiContextParams` requires only
 * a single update here so every script provider stays in lockstep.
 */
const NON_SERIALIZABLE_CONTEXT_KEYS = [
  'getCache',
  'logger',
  'filters',
  'originalProvider',
] as const satisfies readonly (keyof CallApiContextParams)[];

/**
 * Keys on `CallApiContextParams` that change between otherwise-identical eval
 * runs and therefore must NOT contribute to a cache key. Including any of
 * these in the hash would defeat caching across runs:
 *
 * - `evaluationId`, `testCaseId`: fresh UUID-like identifiers generated per
 *   eval run (see `evaluator.ts`).
 * - `traceparent`, `tracestate`: W3C trace headers regenerated per request.
 * - `testIdx`, `promptIdx`: positional identifiers that are stable within a
 *   run but carry no semantic meaning for the script's deterministic output.
 *   Two semantically identical invocations at different table positions
 *   should still hit the same cache entry.
 *
 * These fields are still forwarded to the subprocess (they're useful for
 * distributed tracing, correlation, and debugging) — they are only stripped
 * when building the cache-key hash.
 */
const NON_CACHEABLE_CONTEXT_KEYS = [
  'evaluationId',
  'testCaseId',
  'traceparent',
  'tracestate',
  'testIdx',
  'promptIdx',
] as const satisfies readonly (keyof CallApiContextParams)[];

/**
 * Returns a shallow-cloned copy of `context` with non-serializable keys
 * removed. The caller's `context` is never mutated so wrappers that reuse
 * the same object across turns (e.g., redteam multi-turn strategies) are
 * safe. Logs the stripped keys at debug level for traceability when script
 * authors are investigating "missing filters/logger in my script" reports.
 *
 * @param providerLabel - Label used in debug logs (e.g., `"PythonProvider"`).
 * @param context - Caller-owned context, possibly `undefined`.
 * @returns A sanitized clone, or `undefined` if `context` was `undefined`.
 */
export function sanitizeScriptContext(
  providerLabel: string,
  context: CallApiContextParams | undefined,
): CallApiContextParams | undefined {
  if (!context) {
    return undefined;
  }

  const sanitizedContext = { ...context };
  const stripped: string[] = [];
  for (const key of NON_SERIALIZABLE_CONTEXT_KEYS) {
    if (key in sanitizedContext) {
      stripped.push(key);
      delete sanitizedContext[key];
    }
  }

  if (stripped.length > 0) {
    logger.debug(
      `${providerLabel} sanitized context: stripped non-serializable keys [${stripped.join(', ')}]`,
    );
  }

  return sanitizedContext;
}

/**
 * Returns a shallow-cloned copy of `context` with BOTH non-serializable keys
 * AND per-run non-deterministic keys removed. Use this to build the
 * cache-key hash so that semantically identical invocations across different
 * eval runs hash to the same key and hit the cache.
 *
 * Note: the result of this function must NOT be sent to the subprocess.
 * Use `sanitizeScriptContext` for the runtime payload so scripts still
 * receive `evaluationId`/`traceparent` for distributed tracing.
 *
 * @param context - Caller-owned context, possibly `undefined`.
 * @returns A cache-safe clone, or `undefined` if `context` was `undefined`.
 */
export function buildCacheableScriptContext(
  context: CallApiContextParams | undefined,
): CallApiContextParams | undefined {
  if (!context) {
    return undefined;
  }

  const cacheable = { ...context };
  for (const key of NON_SERIALIZABLE_CONTEXT_KEYS) {
    delete cacheable[key];
  }
  for (const key of NON_CACHEABLE_CONTEXT_KEYS) {
    delete cacheable[key];
  }
  return cacheable;
}
