import { sha256 } from './createHash';

/**
 * Ids the script can read that are new on every eval run or trace. They must
 * not split the response cache. `evaluationId` is copied onto `test.metadata`
 * when tracing is enabled; `__evalId` is the per-run var.
 */
const PER_RUN_SCRIPT_METADATA_KEYS = new Set([
  '__evalId',
  'evaluationId',
  'spanId',
  'traceId',
  'traceparent',
  'tracestate',
]);

/**
 * JSON-visible copy of a value the script receives. Functions are dropped, the
 * same way `JSON.stringify` drops them before the worker reads the context.
 * Object keys are sorted so key order does not split the cache. When
 * `omitPerRunKeys` is set, evaluator trace IDs are removed only at the metadata root.
 */
function canonicalizeScriptVisible(
  value: unknown,
  omitPerRunKeys: boolean,
  stack: WeakSet<object>,
): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  if (stack.has(value)) {
    return '[Circular]';
  }

  stack.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => {
        const next = canonicalizeScriptVisible(item, false, stack);
        return next === undefined ? null : next;
      });
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(source).sort()) {
      if (omitPerRunKeys && PER_RUN_SCRIPT_METADATA_KEYS.has(key)) {
        continue;
      }
      const next = canonicalizeScriptVisible(source[key], false, stack);
      if (next !== undefined) {
        result[key] = next;
      }
    }
    return result;
  } finally {
    stack.delete(value);
  }
}

function visibleOrNull(value: unknown, omitPerRunKeys: boolean): unknown {
  return canonicalizeScriptVisible(value, omitPerRunKeys, new WeakSet()) ?? null;
}

/**
 * Fingerprint of the context fields a Python or Ruby provider script can read
 * and branch on, besides vars (those are keyed separately).
 *
 * The provider contract passes `context.prompt` and `context.test.metadata`
 * through `sanitizeScriptContext`. A rendered prompt string can stay the same
 * while the prompt label or `pluginId` / `strategyId` changes. Per-run tracing
 * ids are omitted so a new eval still reuses an otherwise identical response.
 */
export function scriptVisibleContextCacheKey(
  context:
    | {
        prompt?: unknown;
        test?: { metadata?: unknown } | null;
      }
    | null
    | undefined,
): string {
  const visible = {
    metadata: visibleOrNull(context?.test?.metadata, true),
    prompt: visibleOrNull(context?.prompt, false),
  };
  return sha256(`script-context-v1:${JSON.stringify(visible)}`);
}
