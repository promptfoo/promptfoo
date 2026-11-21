import {
  isCredentialHeader,
  normalizeFieldName,
  REDACTED,
  SECRET_FIELD_NAMES,
  sanitizeObject,
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

/** Classify credential fields in provider traces while preserving usage and other descriptive metadata. */
export function isCredentialAttributeKey(key: string): boolean {
  if (key.includes('\\')) {
    const decoded = key.replace(/(?<!\\)\\+(?:u([\da-f]{4})|[bfnrt])/gi, (_, hex?: string) =>
      hex ? String.fromCharCode(Number.parseInt(hex, 16)) : ' ',
    );
    if (decoded !== key && isCredentialName(decoded)) {
      return true;
    }
  }
  return isCredentialName(key);
}

function isCredentialName(key: string): boolean {
  // Trace metadata and tool fields can be qualified. Use the shared registry
  // for the final field, including vendors' lowercase and fused spellings.
  const normalized = normalizeFieldName(key);
  const field = normalized.slice(normalized.lastIndexOf('.') + 1);
  if (
    (SECRET_FIELD_NAMES.has(field) && field !== 'token' && field !== 'signature') ||
    // Check auth and token compounds below so diagnostics like X-Token-Count survive.
    (field.startsWith('x') && !/auth|token/.test(field) && isCredentialHeader(field, '')) ||
    /(?:connstr_|connectionstrings(?:__|[.:]))/i.test(key) ||
    /(?:connectionstrings?|connstr|dsn|(?:account|storage|sharedaccess)keys?[12]?|sharedaccesssignature|xsessionid|(?:code|pkce)verifier)$/.test(
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

  return parts.some((part, index) => {
    const previous = parts[index - 1];
    const next = parts[index + 1];
    if (part === 'session' || part === 'sessionid') {
      return /(?:^(?:--?)?|\.)session(?:[._-]?id)?$/i.test(key);
    }
    if (part === 'token' || part === 'tokens') {
      return (
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
    if (
      SECRET_FIELD_NAMES.has(part) ||
      /^(?:cookies|passwords|passphrases|credential|apikeys|jwt|pgpassword)$/.test(part)
    ) {
      if (
        part === 'auth' &&
        ['type', 'method', 'methods', 'supported', 'status', 'enabled'].includes(next)
      ) {
        return false;
      }
      if (
        part === 'signature' &&
        (previous === 'function' ||
          ['algorithm', 'method', 'type', 'version', 'format', 'scheme', 'encoding'].includes(next))
      ) {
        return false;
      }
      if (part === 'authorization' && ['endpoint', 'url', 'uri'].includes(next)) {
        return false;
      }
      return true;
    }
    return (
      (part === 'key' || part === 'keys') &&
      (!['algorithm', 'type', 'format', 'id'].includes(next) ||
        (previous === 'access' && next === 'id')) &&
      /^(?:api|access|subscription|private|client|ssl|tls|signing|encryption)$/.test(previous)
    );
  });
}
