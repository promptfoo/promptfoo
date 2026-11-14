import { sha256 } from './createHash';
import {
  isNonCredentialHeader,
  isSecretEnvVarName,
  isSecretField,
  looksLikeSecret,
  sanitizeUrlEncodedString,
  sanitizeUrlForLogging,
} from './sanitizer';

function containsCredential(value: unknown, key = '', parentKey = ''): boolean {
  if (value === null) {
    return false;
  }
  if (
    isSecretField(key) ||
    ((parentKey === 'env' || parentKey === 'environment') && isSecretEnvVarName(key)) ||
    (parentKey === 'headers' && !isNonCredentialHeader(key))
  ) {
    return true;
  }
  if (typeof value === 'string') {
    if (looksLikeSecret(value) || /^(?:Basic|Bearer)\s+\S+/i.test(value)) {
      return true;
    }
    if (sanitizeUrlEncodedString(value) !== value) {
      return true;
    }
    // Chat prompts and config fields can themselves be serialized JSON.
    const trimmed = value.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return containsCredential(JSON.parse(value));
      } catch {
        // A prose prompt can start with a bracket.
      }
    }
    if (value.includes('://') || value.startsWith('/')) {
      return sanitizeUrlForLogging(value) !== value;
    }
    return false;
  }
  return (
    typeof value === 'object' &&
    Object.entries(value).some(([childKey, child]) =>
      containsCredential(child, childKey, key.toLowerCase()),
    )
  );
}

/**
 * Hash JSON that a worker can observe. An unrepresentable or credential-bearing
 * input bypasses both cache operations, before any digest of that input exists.
 */
export function scriptInputDigest(value: unknown): string | undefined {
  try {
    // Respect Date, toJSON, omitted functions, and array nulls just like worker IPC.
    // For cyclic objects we can still execute the worker, but skip caching.
    const json = JSON.stringify(value);
    if (!json || containsCredential(JSON.parse(json))) {
      return undefined;
    }
    // Python dictionaries and Ruby hashes preserve and expose insertion order.
    return sha256(json);
  } catch {
    return undefined;
  }
}
