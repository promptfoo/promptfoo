import { isSecretField, REDACTED, sanitizeObject } from '../../util/sanitizer';

const CREDENTIAL_HEADER =
  /(?:authorization|api[-_]?key|token|secret|signature|credential|cookie|password)|(?:^|[-_])(?:auth(?:entication)?|key)(?:$|[-_])/i;
/** Match auth names; when a value is provided, also apply the shared diagnostic policy. */
export function isOpenAiCredentialHeader(name: string, value?: string): boolean {
  return (
    isSecretField(name) ||
    CREDENTIAL_HEADER.test(name) ||
    (value !== undefined &&
      sanitizeObject({ headers: { [name]: value } }).headers[name] === REDACTED)
  );
}

function collectCredentials(
  headers: Record<string, string>,
  additionalCredentials: readonly string[],
): string[] {
  const headerCredentials = Object.entries(headers)
    .filter(([name, value]) => typeof value === 'string' && isOpenAiCredentialHeader(name, value))
    .map(([, value]) => value);
  return [...headerCredentials, ...additionalCredentials]
    .flatMap(credentialForms)
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length);
}

/**
 * Reuse the same credential-aware diagnostic policy across OpenAI voice transports.
 * Resolved keys can be supplied separately without overwriting a custom credential header.
 */
export function createOpenAiCredentialRedactor(
  headers: Record<string, string>,
  additionalCredentials: readonly string[] = [],
): (text: string) => string {
  const credentials = collectCredentials(headers, additionalCredentials);
  return (text) => {
    let redacted = text;
    for (const credential of credentials) {
      redacted = redactCredential(redacted, credential);
    }
    return redacted
      .replace(/\b(Bearer|Basic)\s+(?!\[REDACTED\])[\w.~+/=-]{8,}/gi, `$1 ${REDACTED}`)
      .replace(/\bsk-[\w-]{16,}/g, REDACTED);
  };
}

/** Redact header values, bare tokens, and both parts of decoded Basic credentials. */
function credentialForms(value: string): string[] {
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
