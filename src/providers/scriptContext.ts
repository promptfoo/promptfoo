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
 * Snapshot the subprocess JSON without exposing host-only context fields.
 * Leave the caller's object intact and log only the removed field names.
 */
export function sanitizeScriptContext(
  providerLabel: string,
  context: CallApiContextParams | undefined,
  // Most subprocesses receive context as args[2]. Exec serializes it separately.
  rootKey = '2',
): CallApiContextParams | undefined {
  if (!context) {
    return undefined;
  }

  const stripped = NON_SERIALIZABLE_CONTEXT_KEYS.filter((key) => key in context);
  if (stripped.length > 0) {
    logger.debug(
      `${providerLabel} sanitized context: stripped non-serializable keys [${stripped.join(', ')}]`,
    );
  }

  // Remember both identities if a toJSON hook returns a different object.
  // A back-reference to the caller must never expose the unfiltered context.
  const ancestors = new Set<object>();
  function snapshot(value: unknown, key: string): unknown {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      return value;
    }
    if (ancestors.has(value)) {
      return undefined;
    }
    const hook = 'toJSON' in value ? value.toJSON : undefined;
    const source: unknown = typeof hook === 'function' ? hook.call(value, key) : value;
    if (!source || typeof source !== 'object') {
      return typeof source === 'function' ? undefined : source;
    }
    if (ancestors.has(source)) {
      return undefined;
    }
    ancestors.add(value);
    ancestors.add(source);
    const copy = Array.isArray(source)
      ? Array.from(source, (item, index) => snapshot(item, String(index)))
      : Object.fromEntries(
          Object.keys(source)
            .filter(
              (field) =>
                value !== context ||
                !NON_SERIALIZABLE_CONTEXT_KEYS.some((excluded) => excluded === field),
            )
            .map((field) => [field, snapshot(Reflect.get(source, field), field)]),
        );
    ancestors.delete(value);
    ancestors.delete(source);
    return copy;
  }
  return snapshot(context, rootKey) as CallApiContextParams | undefined;
}
