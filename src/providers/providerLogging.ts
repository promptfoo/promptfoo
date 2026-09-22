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

/** Redact header values, bare tokens, and both parts of decoded Basic credentials. */
export function getHeaderCredentialForms(value: string): string[] {
  // HTTP drops surrounding whitespace, so a gateway echoes the trimmed value.
  const trimmed = value.trim();
  // RFC 9110 auth-scheme uses the complete HTTP token grammar, including punctuation.
  const token = trimmed.replace(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\s+/, '');
  const keyValueTokens = trimmed.split(/[;,]\s*/).flatMap((part) => {
    if (!part.includes('=')) {
      return [];
    }
    const raw = part.slice(part.indexOf('=') + 1).trim();
    const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    try {
      const decoded = decodeURIComponent(unquoted);
      return [raw, unquoted, decoded, decoded.replace(/^"(.*)"$/, '$1')];
    } catch {
      return [raw, unquoted];
    }
  });
  if (!/^Basic\s/i.test(trimmed)) {
    return [trimmed, token, ...keyValueTokens];
  }
  const pair = Buffer.from(token, 'base64').toString('utf8');
  const separator = pair.indexOf(':');
  const parts = [pair, pair.slice(0, separator), pair.slice(separator + 1)];
  const encoded = parts.map((part) =>
    encodeURIComponent(part).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    ),
  );
  return [trimmed, token, ...parts, ...encoded];
}

/** Characters that continue a credential-like token, such as base64 or URL-safe text. */
const TOKEN_CHARACTER = /[A-Za-z0-9._~+/=-]/;

/**
 * Replace a credential in diagnostic text. Values of eight or more characters are replaced
 * anywhere. Shorter values are replaced only as whole tokens, so `api-key abc`,
 * `"api-key":"abc"`, and `user:abc@` lose the secret while longer words containing it stay intact.
 */
export function redactCredential(text: string, credential: string): string {
  if (credential.length >= 8) {
    return text.split(credential).join(REDACTED);
  }
  let redacted = '';
  let copied = 0;
  let index = text.indexOf(credential);
  while (index !== -1) {
    const end = index + credential.length;
    const before = text.charAt(index - 1);
    const after = text.charAt(end);
    // A key=value separator can precede a token, and a sentence-ending period can follow it.
    const startsToken = before === '=' || !TOKEN_CHARACTER.test(before);
    const endsToken =
      !TOKEN_CHARACTER.test(after) ||
      (after === '.' && !TOKEN_CHARACTER.test(text.charAt(end + 1)));
    if (startsToken && endsToken) {
      redacted += text.slice(copied, index) + REDACTED;
      copied = end;
      index = text.indexOf(credential, end);
    } else {
      index = text.indexOf(credential, index + 1);
    }
  }
  return redacted + text.slice(copied);
}

/**
 * Redact known credentials, longest first so a credential containing another is fully removed,
 * then bearer/Basic tokens and OpenAI-style keys that were never configured locally.
 */
export function redactCredentials(text: string, credentials: Iterable<string>): string {
  let redacted = text;
  const ordered = [...new Set(credentials)].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const credential of ordered) {
    redacted = redactCredential(redacted, credential);
  }
  return redacted
    .replace(/\b(Bearer|Basic)\s+(?!\[REDACTED\])[\w.~+/=-]{8,}/gi, `$1 ${REDACTED}`)
    .replace(/\bsk-[\w-]{16,}/g, REDACTED);
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
    (match: string, group: string | number | undefined) =>
      (prefix?.(match, typeof group === 'string' ? group : '') ?? '') + REDACTED,
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
