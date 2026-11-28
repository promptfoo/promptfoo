import {
  isCredentialHeader,
  isSecretEnvVarName,
  isSecretParameter,
  looksLikeSecret,
  normalizeFieldName,
  REDACTED,
  SECRET_FIELD_NAMES,
  sanitizeObject,
  sanitizePathnameForLogging,
  sanitizeUrl,
} from '../util/sanitizer';

/**
 * Returns a provider identifier that preserves ordinary URLs while ensuring
 * credential-bearing URLs are safe to log or persist.
 */
export function getSafeProviderId(url: string): string {
  const sanitizedUrl = sanitizeUrl(url);
  return sanitizedUrl === REDACTED ||
    sanitizedUrl.includes(encodeURIComponent(REDACTED)) ||
    sanitizedUrl.includes('***')
    ? sanitizedUrl
    : url;
}

/**
 * Sanitizes provider-owned data before including it in logs or error messages.
 */
export function sanitizeProviderObject(value: unknown, context: string): unknown {
  return sanitizeObject(value, { context });
}

type Container = 'env' | 'headers' | 'params';

export { isCredentialHeader, looksLikeSecret, sanitizePathnameForLogging };

export function credentialContainer(key: string): Container | undefined {
  if (/env(?:iron(?:ment)?)?(?:[._-]?(?:vars|variables))?(?:\.|$)/i.test(key)) {
    return 'env';
  }
  if (/headers?(?:\.|$)/i.test(key)) {
    return 'headers';
  }
  if (/(?:query|search|form)[._-]?(?:params|parameters|data|fields)(?:\.|$)/i.test(key)) {
    return 'params';
  }
}

/** Classify credential fields in provider traces while preserving usage and other descriptive metadata. */
export function isCredentialAttributeKey(key: string, container?: Container): boolean {
  if (key.includes('\\')) {
    const decoded = key.replace(/(?<!\\)\\+(?:u([\da-f]{4})|[bfnrt])/gi, (_, hex?: string) =>
      hex ? String.fromCharCode(Number.parseInt(hex, 16)) : ' ',
    );
    if (decoded !== key && isCredentialName(decoded, container)) {
      return true;
    }
  }
  return isCredentialName(key, container);
}

function isCredentialName(key: string, container = credentialContainer(key)): boolean {
  const name = key.slice(key.lastIndexOf('.') + 1);
  if (container === 'env' && isSecretEnvVarName(name)) {
    return true;
  }
  // Java/Maven system properties and Gradle project properties attach a short
  // option to the name. Preserve standalone spellings such as -Password.
  const property = /^-[DP]\w/.test(key);
  if (property && isCredentialName(key.slice(2))) {
    return true;
  }
  // Trace metadata and tool fields can be qualified. Use the shared registry
  // for the final field, including vendors' lowercase and fused spellings.
  const normalized = normalizeFieldName(key);
  const field = normalized.slice(normalized.lastIndexOf('.') + 1);
  if (
    (SECRET_FIELD_NAMES.has(field) && field !== 'token' && field !== 'signature') ||
    // Check auth and token compounds below so diagnostics like X-Token-Count survive.
    (field.startsWith('x') && !/auth|token/.test(field) && isCredentialHeader(field, '')) ||
    /(?:connstr_|connectionstrings(?:__|[.:]))/i.test(key) ||
    /(?:jkscontent|sshkeys?|connectionstrings?|connstr|dsn|(?:account|storage|sharedaccess)keys?[12]?|sharedaccesssignature|xsessionid|(?:code|pkce)verifier)$/.test(
      normalized.replace(/[.[\]]/g, ''),
    )
  ) {
    return true;
  }

  const parts = key
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean);

  // The shared HTTP predicates cover fused and vendor-specific credentials.
  // Token and auth diagnostics have more specific rules below.
  if (!parts.some((part) => /^(?:auth|authorization|tokens?)$/.test(part))) {
    if (container === 'headers' && isCredentialHeader(name, '')) {
      return true;
    }
    if (container === 'params' && (key.length > 1024 || isSecretParameter(key))) {
      return true;
    }
  }

  return parts.some((part, index) => {
    const previous = parts[index - 1];
    const next = parts[index + 1];
    if (part === 'session' || part === 'sessionid') {
      return /(?:^(?:--?)?|\.)session(?:[._-]?id)?$/i.test(key);
    }
    // For properties, token and signature qualifiers were already checked
    // without the leading D or P (e.g. -Dinput.tokens).
    if (part === 'token' || part === 'tokens') {
      return (
        !property &&
        !/^(?:used|counts?|usage|limit|budget|length|type|ids?|index|indices|positions?|masks?|endpoint|url|uri)$/.test(
          next,
        ) &&
        !/^(?:num|estimated|used|usage|input|output|total|cached|reasoning|prompt|completion|prediction|response|max|min)$/.test(
          previous,
        )
      );
    }
    if (part === 'assertion') {
      return previous === 'client' && !['type', 'types'].includes(next);
    }
    if (part === 'auth') {
      return !['type', 'method', 'methods', 'supported', 'status', 'enabled'].includes(next);
    }
    if (part === 'authorization') {
      return !['endpoint', 'url', 'uri'].includes(next);
    }
    if (part === 'signature') {
      return (
        !property &&
        previous !== 'function' &&
        !['algorithm', 'method', 'type', 'version', 'format', 'scheme', 'encoding'].includes(next)
      );
    }
    if (part !== 'key' && part !== 'keys') {
      return (
        SECRET_FIELD_NAMES.has(part) ||
        /^(?:cookies|passwords|passphrases|credential|apikeys|jwt|pgpassword)$/.test(part)
      );
    }
    return (
      (!['algorithm', 'type', 'format', 'id'].includes(next) ||
        (previous === 'access' && next === 'id')) &&
      /^(?:api|access|subscription|private|client|ssh|ssl|tls|signing|encryption)$/.test(previous)
    );
  });
}
