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
      // URL parsing strips tabs and newlines and collapses parent path segments.
      // Inspect the original spelling before a credential component can disappear.
      if (/[\t\r\n]/.test(value) || /[\\/](?:\.|%2e){2}(?=[\\/?#]|$)/i.test(value)) {
        return true;
      }
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

interface ScriptOptions {
  config?: { basePath?: unknown };
}

interface ScriptInvocation {
  path: string;
  functionName: string;
  sourceOptions?: ScriptOptions;
  inputs: [string, ScriptOptions, unknown?];
}

function asFileReference(value: string): string {
  // A long POSIX directory can consist entirely of base64 characters, including '/'.
  // Check its individual components and any query or fragment as a file URL.
  return value.startsWith('/') && !value.startsWith('//') ? `file://${value}` : value;
}

/**
 * Hash JSON that a worker can observe. An unrepresentable or credential-bearing
 * input bypasses both cache operations, before any digest of that input exists.
 */
export function scriptInputDigest(invocation: ScriptInvocation): string | undefined {
  try {
    // Respect Date, toJSON, omitted functions, and array nulls just like worker IPC.
    // For cyclic objects we can still execute the worker, but skip caching.
    const json = JSON.stringify(invocation);
    const copy: ScriptInvocation = JSON.parse(json);
    copy.path = asFileReference(copy.path);
    for (const config of [copy.sourceOptions?.config, copy.inputs[1]?.config]) {
      if (typeof config?.basePath === 'string') {
        config.basePath = asFileReference(config.basePath);
      }
    }
    if (containsCredential(copy)) {
      return undefined;
    }
    // Hash the original JSON, preserving exact path spellings and worker-visible key order.
    return sha256(json);
  } catch {
    return undefined;
  }
}
