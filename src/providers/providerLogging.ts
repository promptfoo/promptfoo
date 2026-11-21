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

type Redact = (start: number, end: number, replacement?: string) => void;

function matchCredential(text: string, credential: string, anywhere: boolean, redact: Redact) {
  if (!credential || credential.length > text.length) {
    return;
  }
  if (anywhere && !/%[\da-f]{2}/i.test(credential)) {
    let start = text.indexOf(credential);
    while (start !== -1) {
      const end = start + credential.length;
      redact(start, end);
      start = text.indexOf(credential, end);
    }
    return;
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
  for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
    const start = match.index;
    const end = start + match[0].length;
    const before = text.charAt(start - 1);
    const after = text.charAt(end);
    // A key=value separator can precede a token, and a sentence-ending period can follow it.
    const startsToken = before === '=' || !TOKEN_CHARACTER.test(before);
    const endsToken =
      !TOKEN_CHARACTER.test(after) ||
      (after === '.' && !TOKEN_CHARACTER.test(text.charAt(end + 1)));
    if (anywhere || (startsToken && endsToken)) {
      redact(start, end);
    }
  }
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
  /(?<![\w.\\-])(\\{0,8}["']?)([A-Za-z_][\w.-]{0,63})\1\s*[:=]\s*(\\{0,8}["'])?/g;
/** Punctuation can belong to Digest parameters, signed headers or combined cookie values. */
function credentialHeaderEnd(source: string, start: number, name: string): number {
  let simpleAuth = /authorization/i.test(name);
  let quote: string | undefined;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = undefined;
      }
    } else if (char === '\\') {
      // An escaped envelope has no reliable boundary in the original diagnostic.
      return source.length;
    } else if (char === '"' || char === "'") {
      quote = char;
      simpleAuth = false;
    } else if (char === '=' || char === ',') {
      simpleAuth = false;
    } else if (char === ';' && simpleAuth) {
      return i;
    } else if (char === '\r' || char === '\n') {
      const next = i + (char === '\r' && source[i + 1] === '\n' ? 2 : 1);
      if (source[next] !== ' ' && source[next] !== '\t') {
        return i;
      }
      i = next - 1;
    }
  }
  return source.length;
}

function matchDiagnosticFields(source: string, redact: Redact) {
  for (const match of source.matchAll(DIAGNOSTIC_URL)) {
    const url = sanitizeUrlForLogging(match[0]);
    if (url !== match[0]) {
      redact(match.index, match.index + match[0].length, url);
    }
  }
  let copied = 0;
  for (const match of source.matchAll(CREDENTIAL_FIELD)) {
    const [field, , name, quote] = match;
    const start = match.index + field.length;
    if (match.index < copied || !isCredentialName(name)) {
      continue;
    }
    // Objects, arrays and repeatedly escaped quotes have no reliable simple delimiter.
    // Withhold the rest of the diagnostic instead of exposing a nested value.
    const structured =
      source[start] === '{' || (source[start] === '[' && !source.startsWith(REDACTED, start));
    if (structured || (quote && quote.length > 1)) {
      redact(start, source.length);
      return;
    }
    if (!quote && /authorization|cookie/i.test(name)) {
      copied = credentialHeaderEnd(source, start, name);
    } else {
      const end = quote === '"' ? /(?<!\\)"/g : quote ? /(?<!\\)'/g : /(?<!\\)[\s,;&})\]"']/g;
      end.lastIndex = source.startsWith(REDACTED, start) ? start + REDACTED.length : start;
      copied = end.exec(source)?.index ?? source.length;
    }
    redact(start, copied);
  }
}

// Inspect the same text for every rule. Replacing a key first can conceal a
// field name, a URL scheme or another credential that overlaps the key.
function maskCredentials(
  text: string,
  credentials: Iterable<string>,
  diagnostics?: { embedded?: ReadonlySet<string> },
): string {
  const slash = diagnostics && text.includes('\\/') ? /(?<!\\)\\+\//g : undefined;
  const source = slash ? text.replace(slash, '/') : text;
  const matches: { start: number; end: number; replacement: string }[] = [];
  const redact: Redact = (start, end, replacement = REDACTED) => {
    matches.push({ start, end, replacement });
  };
  for (const credential of new Set(credentials)) {
    matchCredential(
      source,
      slash ? credential.replace(slash, '/') : credential,
      credential.length >= 8 || diagnostics?.embedded?.has(credential) === true,
      redact,
    );
  }
  for (const match of source.matchAll(/\b(?:Bearer|Basic)\s+((?:[\w.~+/=-]|\[REDACTED\])+)/gi)) {
    const end = match.index + match[0].length;
    redact(end - match[1].length, end);
  }
  for (const match of source.matchAll(/\bsk-(?:[\w-]|\[REDACTED\])+/g)) {
    if (match[0].length >= 19 || match[0].includes(REDACTED)) {
      redact(match.index, match.index + match[0].length);
    }
  }
  if (diagnostics) {
    matchDiagnosticFields(source, redact);
  }

  matches.sort((a, b) => a.start - b.start);
  let result = '';
  let copied = 0;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    // If a sanitized URL overlaps another secret, withhold the whole URL.
    while (i + 1 < matches.length && matches[i + 1].start < match.end) {
      i++;
      match.end = Math.max(match.end, matches[i].end);
      match.replacement = REDACTED;
    }
    result += source.slice(copied, match.start) + match.replacement;
    copied = match.end;
  }
  return result + source.slice(copied);
}

export function redactCredentials(text: string, credentials: Iterable<string>): string {
  return maskCredentials(text, credentials);
}

export function redactDiagnosticText(
  text: string,
  credentials: Iterable<string>,
  embedded?: ReadonlySet<string>,
): string {
  return maskCredentials(text, credentials, { embedded });
}
