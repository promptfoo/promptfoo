import { REDACTED, sanitizeObject, sanitizeUrl } from '../util/sanitizer';

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

/** Escape a literal before inserting it into a provider redaction expression. */
export function escapeProviderRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace known provider secrets with the same marker used by structured logging. */
export function redactProviderText(
  value: string,
  pattern: string | RegExp,
  prefix?: (match: string, group: string) => string,
): string {
  if (typeof pattern === 'string') {
    return value.split(pattern).join(REDACTED);
  }
  return value.replace(
    pattern,
    (match: string, group: string) => (prefix?.(match, group) ?? '') + REDACTED,
  );
}

/** Whether redaction changed only one-to-three-digit fragments of a structured value. */
export function isShortNumericProviderRedaction(value: string, redacted: string): boolean {
  return (
    redacted.includes(REDACTED) &&
    new RegExp(
      `^${redacted.split(REDACTED).map(escapeProviderRegexLiteral).join('\\d{1,3}')}$`,
    ).test(value)
  );
}
