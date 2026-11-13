import logger from '../logger';

import type { CallApiContextParams } from '../types/index';

/**
 * Fields omitted from subprocess contexts because they contain functions or
 * circular references.
 */
const NON_SERIALIZABLE_CONTEXT_KEYS = [
  'getCache',
  'logger',
  'filters',
  'originalProvider',
] as const satisfies readonly (keyof CallApiContextParams)[];

/**
 * Return a shallow copy without fields that cannot be sent to a subprocess.
 * Leave the caller's object intact and log only the removed field names.
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
