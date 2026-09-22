import {
  isNonCredentialHeader,
  isSecretEnvVarName,
  isSecretField,
  REDACTED,
  sanitizeObject,
  sanitizeUrl,
  sanitizeUrlForLogging,
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
function redactCredential(text: string, credential: string): string {
  if (credential.length > text.length) {
    return text;
  }
  if (credential.length >= 8 && !/%[\da-f]{2}/i.test(credential)) {
    return text.split(credential).join(REDACTED);
  }
  // A percent escape may change hex case or have its '%' encoded again by nested transports.
  const pattern = credential
    .split(/(%[\da-f]{2})/i)
    .map((part, index) =>
      index % 2
        ? `%(?:25){0,2}${part.slice(1).replace(/[a-f]/gi, (hex) => `[${hex.toLowerCase()}${hex.toUpperCase()}]`)}`
        : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return text.replace(new RegExp(pattern, 'g'), (match, start: number) => {
    if (credential.length >= 8) {
      return REDACTED;
    }
    const end = start + match.length;
    const before = text.charAt(start - 1);
    const after = text.charAt(end);
    // A key=value separator can precede a token, and a sentence-ending period can follow it.
    const startsToken = before === '=' || !TOKEN_CHARACTER.test(before);
    const endsToken =
      !TOKEN_CHARACTER.test(after) ||
      (after === '.' && !TOKEN_CHARACTER.test(text.charAt(end + 1)));
    return startsToken && endsToken ? REDACTED : match;
  });
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

/** Credential names per the shared sanitizer: config keys, env vars, headers, and text fields. */
export function isCredentialName(name: string): boolean {
  return (
    /authorization|cookie/i.test(name) ||
    isSecretField(name) ||
    isSecretEnvVarName(name.replace(/\W/g, '_'))
  );
}

/** Credential forms of every header value except headers with a standard non-credential meaning. */
export function getHeadersCredentialForms(headers: unknown): string[] {
  return Object.entries(headers && typeof headers === 'object' ? headers : {}).flatMap(
    ([name, value]) =>
      typeof value === 'string' && !isNonCredentialHeader(name)
        ? getHeaderCredentialForms(value)
        : [],
  );
}

const DIAGNOSTIC_URL = /\b[a-z][a-z\d+.-]{0,31}:\/\/[^\s"'<>]+/gi;
// `name: value`, `name=value`, and quoted or (repeatedly) JSON-escaped `"name": "value"` fields.
const CREDENTIAL_FIELD =
  /(?<![\w.\\-])(\\{0,8}["']?)([A-Za-z_][\w.-]{0,63})\1\s{0,8}[:=]\s{0,8}(\\{0,8}["'])?/g;
const CREDENTIAL_FIELD_END: Record<string, RegExp> = {
  '"': /(?<!\\)"|[\r\n]/g,
  "'": /(?<!\\)'|[\r\n]/g,
  // An escaped value has no reliable end: its own quotes can be escaped once more.
  escaped: /[\r\n]/g,
  // Authorization values can span several tokens and comma-separated parameters; cookie values
  // span `;`-separated pairs but cannot contain a comma.
  authorization: /[;\r\n]/g,
  cookie: /[,\r\n]/g,
  bare: /[\s,;&})\]"'\\]/g,
};

/**
 * Redact diagnostic text from an upstream service: known credentials (see `redactCredentials`),
 * then URLs with userinfo, secret parameters, or opaque path tokens, and the values of
 * credential-named fields that only the upstream knows. Every pattern is linear in the text length.
 */
export function redactDiagnosticText(text: string, credentials: Iterable<string>): string {
  const source = redactCredentials(text, credentials).replace(DIAGNOSTIC_URL, (url) =>
    sanitizeUrlForLogging(url),
  );
  let redacted = '';
  let copied = 0;
  for (const match of source.matchAll(CREDENTIAL_FIELD)) {
    const [field, , name, quote] = match;
    const start = match.index + field.length;
    if (match.index < copied || source.startsWith(REDACTED, start) || !isCredentialName(name)) {
      continue;
    }
    const end =
      CREDENTIAL_FIELD_END[
        (quote && quote.length > 1 ? 'escaped' : quote) ??
          name.match(/authorization|cookie/i)?.[0].toLowerCase() ??
          'bare'
      ];
    end.lastIndex = start;
    redacted += source.slice(copied, start) + REDACTED;
    copied = end.exec(source)?.index ?? source.length;
  }
  return redacted + source.slice(copied);
}
