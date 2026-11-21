import {
  isCredentialHeader,
  isSecretEnvVarName,
  isSecretField,
  looksLikeSecret,
  sanitizeUrlForLogging,
} from '../../util/sanitizer';
import { decodeUrlComponent } from '../urlEncoding';

const CREDENTIAL_NAME =
  /(?:authorization|api[-_]?key|token|secret|signature|credential|cookie|password|(?:^|[-_])key$)/i;

export function isCredentialName(name: string): boolean {
  return isSecretField(name) || CREDENTIAL_NAME.test(name);
}

export function isHostedCredentialLabel(name: string): boolean {
  const leaf = name.slice(name.lastIndexOf('.') + 1);
  return isCredentialHeader(leaf, '') || isSecretEnvVarName(leaf);
}

// A namespace or file extension can surround a base64url token. Keep hyphens and
// underscores inside each component so a token cannot hide behind its own separators.
export function hasOpaqueIdentifierComponent(value: string): boolean {
  return value.split(/[.:/]/).some(
    (part) =>
      looksLikeSecret(part) &&
      // Some dated model slugs exceed the opaque-token threshold using descriptive words.
      !/^(?:[a-z]{1,16}-){2,}\d{4}-\d{2}-\d{2}(?:-\d{1,8})?$/.test(part),
  );
}

/** Decode URL userinfo as Node's HTTP client does, keeping a malformed escape as written. */
function decodeUserinfo(url: URL): string | undefined {
  return url.username || url.password
    ? `${decodeUrlComponent(url.username)}:${decodeUrlComponent(url.password)}`
    : undefined;
}

export function basicCredential(userinfo: string): string {
  return `Basic ${Buffer.from(userinfo).toString('base64')}`;
}

/**
 * Promptfoo's fetch helper would Base64-encode URL userinfo while it is still percent-encoded, so
 * request URLs omit it and the provider sends a decoded Basic credential instead.
 */
export function splitUserinfo(apiUrl: string): { url: string; userinfo?: string } {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    return { url: apiUrl };
  }
  const userinfo = decodeUserinfo(url);
  if (!userinfo) {
    return { url: apiUrl };
  }
  url.username = '';
  url.password = '';
  return { url: url.toString(), userinfo };
}

/**
 * Credential values carried by a URL: userinfo, including the decoded pair and the Basic
 * credential derived from it, and credential-named query parameters. Raw and decoded spellings
 * are both returned for redaction.
 */
export function getUrlCredentials(
  value: string,
  includeFragment = true,
  onMalformed?: () => void,
): string[] {
  // A single argv entry may carry a URL in --option=value or NAME=value form.
  const trimmed = value.trim().replace(/^(?:--?)?[a-z_][\w.-]*=/i, '');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    return [];
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    onMalformed?.();
    // A malformed credential-bearing URL can be echoed only as one opaque error value.
    return sanitizeUrlForLogging(value) === value ? [] : [value];
  }
  const found = [url.username, url.password].flatMap((part) => [part, decodeUrlComponent(part)]);
  const userinfo = decodeUserinfo(url);
  if (userinfo) {
    found.push(userinfo, basicCredential(userinfo));
  }
  const sanitizedSegments = sanitizeUrlForLogging(url.pathname).split('/');
  for (const [index, segment] of url.pathname.split('/').entries()) {
    if (sanitizedSegments[index] === '%5BREDACTED%5D') {
      found.push(segment, decodeUrlComponent(segment));
    }
  }
  const parameterParts = includeFragment ? [url.search, url.hash] : [url.search];
  for (const segment of parameterParts.flatMap((part) => part.slice(1).split(/[&;]/))) {
    const separator = segment.indexOf('=');
    const [param] = new URLSearchParams(segment);
    if (
      separator !== -1 &&
      param &&
      (isCredentialName(param[0]) ||
        looksLikeSecret(param[1]) ||
        looksLikeSecret(segment.slice(separator + 1)))
    ) {
      // A raw `+` decodes to a space; keep both spellings a server might echo.
      found.push(segment.slice(separator + 1), param[1]);
    }
  }
  return found.filter((credential) => credential.trim().length > 0);
}

// A stdio transport or command tool may pass a credential as a labelled argv value.
// Inspect explicit arguments only. Shell programs and positional values are opaque.
export function getHostedCredentialArgument(
  current: unknown,
  previous: unknown,
  isProtectedKey: (key: string) => boolean,
): { name: string; value: string } | undefined {
  if (typeof current !== 'string') {
    return undefined;
  }
  const header =
    previous === '-H' || previous === '--header' || previous === '--proxy-header'
      ? current
      : /^(?:-H|--(?:proxy-)?header=)(.+)$/s.exec(current)?.[1];
  if (header !== undefined) {
    const separator = header.indexOf(':');
    if (separator > 0) {
      const name = header.slice(0, separator).trim();
      if (isProtectedKey(name)) {
        return { name, value: header.slice(separator + 1).trim() };
      }
    }
  }
  const assignment = /^(?:--)?([A-Za-z_][\w.-]*)=/u.exec(current);
  if (assignment && isProtectedKey(assignment[1])) {
    return { name: assignment[1], value: current.slice(assignment[0].length) };
  }
  const flag = typeof previous === 'string' && /^--([A-Za-z][\w.-]*)$/u.exec(previous);
  return flag && isProtectedKey(flag[1]) ? { name: flag[1], value: current } : undefined;
}

// Buffer's base64 and UTF-8 decoders tolerate malformed input. Verify both
// round trips before assuming the credential components are known.
export function decodeBasicCredentials(token: string): string[] | undefined {
  const bytes = Buffer.from(token, 'base64');
  const canonical = bytes.toString('base64');
  const decoded = bytes.toString('utf8');
  const separator = decoded.indexOf(':');
  if (
    (token !== canonical && token !== canonical.replace(/=+$/, '')) ||
    separator < 0 ||
    !bytes.equals(Buffer.from(decoded))
  ) {
    return undefined;
  }
  return [decoded, decoded.slice(0, separator), decoded.slice(separator + 1)];
}

// Raw authorization and cookie fields can embed the credential inside a public envelope.
export function* getHostedHeaderCredentialParts(
  label: string,
  text: string,
  onUnsupported: () => void,
): Iterable<string> {
  const field = label
    .slice(label.lastIndexOf('.') + 1)
    .toLowerCase()
    .replace(/[-_]/g, '');
  if (
    field !== 'authorization' &&
    field !== 'proxyauthorization' &&
    field !== 'cookie' &&
    field !== 'setcookie'
  ) {
    return;
  }
  if (/[\r\n]/.test(text)) {
    onUnsupported();
    return;
  }
  if (field === 'authorization' || field === 'proxyauthorization') {
    // HTTP auth-scheme followed by token68, including DPoP access tokens.
    const token = /^[!#$%&'*+.^_`|~\w-]+[ \t]+([a-z\d._~+/-]+=*)$/i.exec(text.trim());
    if (token) {
      yield token[1];
    } else if (/\s/.test(text.trim())) {
      onUnsupported(); // Parameterized schemes cannot safely be compared as a single token.
    }
    return;
  }
  // A Cookie header lists cookie-pairs. In Set-Cookie the semicolon introduces
  // public attributes. Some HTTP clients combine several Set-Cookie fields.
  const pairs =
    field === 'cookie'
      ? text.split(';')
      : text.split(/,(?=[ \t]*[!#$%&'*+.^_`|~\w-]+[ \t]*=)/).map((part) => part.split(';', 1)[0]);
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const value = pair.slice(eq + 1).trim();
      yield value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    }
  }
}
