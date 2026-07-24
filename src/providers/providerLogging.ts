import {
  looksLikeCredentialPathSegment,
  looksLikeSecret,
  REDACTED,
  sanitizeObject,
  sanitizeUrl,
  sanitizeUrlEncodedString,
} from '../util/sanitizer';

/**
 * Returns a provider identifier that preserves ordinary URLs while ensuring
 * credential-bearing URLs are safe to log or persist.
 */
export function getSafeProviderId(url: string): string {
  if (!url.includes('://') && !url.startsWith('/')) {
    let decodedUrl = url;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {}
    if (looksLikeSecret(url) || looksLikeSecret(decodedUrl)) {
      return REDACTED;
    }

    for (const part of decodedUrl.split(/[\s{}/?&#;]+/)) {
      const candidate = part.replace(/^[-_.:]+/, '');
      const value = candidate.includes('=')
        ? candidate.slice(candidate.indexOf('=') + 1)
        : candidate;
      const embeddedCredential =
        /(?:^|[^a-z0-9])((?:token|key|secret|credential|auth)[-_][a-z0-9._]{8,})/i.exec(
          candidate,
        )?.[1];
      if (
        looksLikeSecret(candidate) ||
        looksLikeSecret(value) ||
        (embeddedCredential && looksLikeCredentialPathSegment(embeddedCredential)) ||
        /(?:^|[^a-z0-9])sk-(?:proj-|ant-)?[a-z0-9_-]{20,}/i.test(candidate) ||
        looksLikeCredentialPathSegment(value) ||
        sanitizeUrlEncodedString(candidate) !== candidate
      ) {
        return REDACTED;
      }
    }

    return url;
  }

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
