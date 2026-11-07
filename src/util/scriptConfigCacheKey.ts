import { sha256 } from './createHash';
import { isSecretEnvVarName, isSecretField, REDACTED } from './sanitizer';

/**
 * Credential-shaped values under a non-secret field name. The long base64 rule
 * in `looksLikeSecret` is intentionally not used: system prompts and other
 * response-affecting settings are often long alphanumeric strings, and
 * redacting them would make distinct configs share a cache entry.
 */
function isCredentialShapedValue(value: string): boolean {
  return (
    /^sk-(?:proj-|ant-)?[a-zA-Z0-9_-]{20,}/.test(value) ||
    /^key-[a-zA-Z0-9]{20,}/.test(value) ||
    /^Bearer\s+\S+/i.test(value) ||
    /^Basic\s+\S+/i.test(value) ||
    /^AKIA[A-Z0-9]{16}/.test(value) ||
    /^AIza[a-zA-Z0-9_-]{35}/.test(value)
  );
}

function isSensitiveCacheField(key: string, parentKey?: string): boolean {
  const parent = parentKey?.toLowerCase();
  if (parent === 'env' || parent === 'environment') {
    return isSecretEnvVarName(key);
  }
  if (parent === 'headers') {
    return (
      isSecretField(key) ||
      /authorization|cookie|api[-_]?key|token|secret|password|signature/i.test(key)
    );
  }
  return isSecretField(key);
}

/**
 * JSON-safe copy of resolved provider config for a cache fingerprint.
 * Secret field names and credential-shaped values become {@link REDACTED}.
 * Object keys are inserted in sorted order so identical settings hash the same.
 */
function canonicalizeResolvedConfig(
  value: unknown,
  parentKey?: string,
  stack: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === undefined || value === null) {
    return value ?? null;
  }
  if (typeof value === 'string') {
    return isCredentialShapedValue(value) ? REDACTED : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return value.toString();
  }
  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}] ${value.toString()}`;
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (stack.has(value)) {
    return '[Circular]';
  }

  stack.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalizeResolvedConfig(item, undefined, stack));
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) {
        continue;
      }
      result[key] = isSensitiveCacheField(key, parentKey)
        ? REDACTED
        : canonicalizeResolvedConfig(source[key], key, stack);
    }
    return result;
  } finally {
    stack.delete(value);
  }
}

/**
 * Fingerprint of the config `initialize()` resolved into `this.config`.
 *
 * `this.options` still carries the original `file://` strings, which do not
 * change when the referenced file does. This hash covers the resolved,
 * response-affecting config with secrets removed so an updated settings file
 * misses the cache without writing credentials into the disk cache key.
 */
export function scriptResolvedConfigCacheKey(config: unknown): string {
  return sha256(`script-config-v1:${JSON.stringify(canonicalizeResolvedConfig(config))}`);
}
