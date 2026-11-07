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

type RedactionState = { found: boolean };

function noteRedaction(redaction?: RedactionState): void {
  if (redaction) {
    redaction.found = true;
  }
}

/**
 * JSON-safe copy of resolved provider config for a cache fingerprint.
 * Secret field names and credential-shaped values become {@link REDACTED}.
 * Object keys are inserted in sorted order so identical settings hash the same.
 * When `redaction` is set, it records that a secret was removed.
 */
function canonicalizeResolvedConfig(
  value: unknown,
  parentKey?: string,
  stack: WeakSet<object> = new WeakSet(),
  redaction?: RedactionState,
): unknown {
  if (value === undefined || value === null) {
    return value ?? null;
  }
  if (typeof value === 'string') {
    if (isCredentialShapedValue(value)) {
      noteRedaction(redaction);
      return REDACTED;
    }
    return value;
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
      return value.map((item) => canonicalizeResolvedConfig(item, undefined, stack, redaction));
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) {
        continue;
      }
      if (isSensitiveCacheField(key, parentKey)) {
        noteRedaction(redaction);
        result[key] = REDACTED;
      } else {
        result[key] = canonicalizeResolvedConfig(source[key], key, stack, redaction);
      }
    }
    return result;
  } finally {
    stack.delete(value);
  }
}

function subtreeRedactsSecrets(value: unknown, parentKey?: string): boolean {
  const redaction: RedactionState = { found: false };
  canonicalizeResolvedConfig(value, parentKey, new WeakSet(), redaction);
  return redaction.found;
}

function collectFileReferencePaths(
  value: unknown,
  path: Array<string | number>,
  paths: Array<Array<string | number>>,
  stack: WeakSet<object>,
): void {
  if (typeof value === 'string') {
    if (value.startsWith('file://')) {
      paths.push(path);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (stack.has(value)) {
    return;
  }

  stack.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        collectFileReferencePaths(item, [...path, index], paths, stack);
      });
      return;
    }

    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      collectFileReferencePaths(source[key], [...path, key], paths, stack);
    }
  } finally {
    stack.delete(value);
  }
}

function valueAtPath(root: unknown, path: ReadonlyArray<string | number>): unknown {
  let current = root;
  for (const segment of path) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

/**
 * Fingerprint of the config `initialize()` resolved into `this.config`.
 *
 * `this.options` still carries the original `file://` strings, which do not
 * change when the referenced file does. This hash covers the resolved,
 * response-affecting config with secrets removed so an updated settings file
 * misses the cache without writing credentials into the disk cache key.
 * Callers must skip the cache when {@link isScriptResolvedConfigCacheable}
 * is false: a secret-only file change hashes the same as the previous secret.
 */
export function scriptResolvedConfigCacheKey(config: unknown): string {
  return sha256(`script-config-v1:${JSON.stringify(canonicalizeResolvedConfig(config))}`);
}

/**
 * Whether a resolved script-provider config is safe to use as a cache identity.
 *
 * Secret fields are replaced with one placeholder before hashing. For a
 * `file://` payload, `options` still holds that unchanged reference, so two
 * configs that differ only by the credential would share a response. Script
 * config has no separate non-secret tenant id, and the secret must not be
 * hashed into the disk key, so that path is not cached. Inline secrets stay
 * cacheable: they are not file-backed, and `options` still distinguishes them.
 */
export function isScriptResolvedConfigCacheable(
  resolvedConfig: unknown,
  originalConfig: unknown,
): boolean {
  const paths: Array<Array<string | number>> = [];
  collectFileReferencePaths(originalConfig, [], paths, new WeakSet());
  for (const refPath of paths) {
    const keys = refPath.filter((segment): segment is string => typeof segment === 'string');
    const fieldName = keys[keys.length - 1];
    const parentName = keys[keys.length - 2];
    if (fieldName !== undefined && isSensitiveCacheField(fieldName, parentName)) {
      return false;
    }
    if (subtreeRedactsSecrets(valueAtPath(resolvedConfig, refPath), fieldName)) {
      return false;
    }
  }
  return true;
}
