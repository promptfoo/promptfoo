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
