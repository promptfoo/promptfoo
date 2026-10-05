/**
 * Generic utility functions for sanitizing objects to prevent logging of secrets and credentials
 * Uses a custom recursive approach for reliable deep object sanitization.
 */
import safeStringify from 'fast-safe-stringify';

import type { EvalRuntimeOptions, UnifiedConfig } from '../types';

const MAX_DEPTH = 4;
const DUMMY_BASE = 'http://placeholder';
const URL_REFERENCE = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/[^?#]*[?#])/i;

export const REDACTED = '[REDACTED]';

const OPAQUE_CREDENTIAL_PATH_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,}|(?:token|key|secret|credential|auth)[-_][a-z0-9._-]{8,}|eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)$/i;

/**
 * Whether a `scheme://user@host` username or password is present. Implemented
 * with plain string scans rather than a regex to avoid polynomial backtracking
 * on adversarial input (e.g. `://:::::…`).
 */
function hasUrlUserinfo(url: string): boolean {
  const schemeIndex = url.indexOf('://');
  if (schemeIndex === -1) {
    return false;
  }
  const authorityStart = schemeIndex + 3;
  let authorityEnd = url.length;
  for (let i = authorityStart; i < url.length; i++) {
    const char = url[i];
    if (char === '/' || char === '?' || char === '#') {
      authorityEnd = i;
      break;
    }
  }
  const authority = url.slice(authorityStart, authorityEnd);
  const atIndex = authority.indexOf('@');
  return atIndex > 0;
}

// Remove public mailto paths only from the host authority inspection copy.
// The bounded form owner still inspects the original component's keys/values.
function hostUserinfoInspectionValue(value: string): string {
  return value.replace(URL_ENCODED_PAIR_RE, (match, separator, key, rawValue) => {
    if (!/^[A-Za-z0-9._~+%\[\]\-]+$/.test(key)) {
      return match;
    }
    const colon = rawValue.indexOf(':');
    const equals = rawValue.lastIndexOf('=', colon);
    const prefix = rawValue.slice(0, equals + 1);
    if (
      rawValue.slice(equals + 1, colon).toLowerCase() !== 'mailto' ||
      (equals !== -1 &&
        (!/^[A-Za-z0-9._~+%\[\]=\-]+$/.test(prefix) ||
          prefix.startsWith('=') ||
          prefix.includes('==')))
    ) {
      return match;
    }
    return `${separator}${key}=`;
  });
}

// Decoded URL payloads also accept the special-scheme spellings recognized by
// the platform parser, such as a single slash or backslash authority. Keep the
// generic sanitizer's lexical policy unchanged outside this inherited context.
function hasUrlPayloadUserinfo(value: string, guard?: UrlPayloadGuard): boolean {
  if (hasUrlUserinfo(value)) {
    return true;
  }
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      return true;
    }
    if (parsed.protocol === 'mailto:') {
      // The mailbox belongs to this URI's path, not to a host authority.
      // Its query/path credential segments are still inspected separately.
      return false;
    }
  } catch {
    // Host payloads retain the same schemeless authority interpretation as the
    // original host field; ordinary URL payloads do not acquire that policy.
  }
  if (guard === 'host') {
    value = hostUserinfoInspectionValue(value);
    try {
      const parsed = new URL(`https://${value}`);
      // A bare email address is public data, not evidence of a password.
      return Boolean(parsed.password);
    } catch {
      // Retain the host field's authority interpretation even when its port or
      // hostname is invalid. Require a password separator so public email data
      // does not become a credential merely because parsing failed.
      const authorityEnd = value.search(/[\\/?#]/);
      const authority = authorityEnd === -1 ? value : value.slice(0, authorityEnd);
      const atIndex = authority.lastIndexOf('@');
      const colonIndex = authority.indexOf(':');
      return colonIndex !== -1 && atIndex > colonIndex + 1;
    }
  }
  return false;
}

// Scalar strings can retain JSON quoting at any URL/key fast path. Decode only
// those string layers for the inherited guard, without interpreting containers
// or changing the original public bytes. The existing depth budget also bounds
// this iterative interpretation; exhaustion must not restore unchecked data.
function getUrlPayloadScalar(value: string, maxDepth: number): string | null {
  let scalar = value;
  let remaining = maxDepth;
  while (scalar.trimStart().startsWith('"')) {
    if (remaining-- < 0) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(scalar);
      if (typeof parsed !== 'string') {
        break;
      }
      scalar = parsed;
    } catch {
      break;
    }
  }
  return scalar;
}

/**
 * Names that hold a credential word without being a credential: special tokens, cursors and
 * token limits, and settings. Takes a name from `normalizeFieldName`.
 */
function isBenignParameterName(normalized: string): boolean {
  return (
    /^(?:eos|bos|pad|unk|mask|sep|cls|stop|start|end|next|prev|page|nextpage|continuation|resume|cursor|max|min)tokens?$/.test(
      normalized,
    ) || /(?:version|type|enabled)$/.test(normalized)
  );
}

function isSecretParameterName(name: string): boolean {
  const normalized = normalizeFieldName(name);
  if (normalized === 'key') {
    return true;
  }
  if (isBenignParameterName(normalized)) {
    return false;
  }
  if (isSecretField(name) || name.split(/[-_\s=]+/).some(isSecretField)) {
    return true;
  }
  return hasCredentialCompound(name);
}

/** Checks credential compounds, including lowercase suffixes, camelCase and numeric versions. */
function hasCredentialCompound(name: string): boolean {
  const words = name
    .replace(/(value|hash|encrypted)$/i, '_$1')
    .replace(/v?\d+/gi, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[-_\s=]+/);
  let suffix = '';
  let length = 0;
  return words.some((word) => {
    const normalizedWord = word.toLowerCase();
    length += normalizedWord.length;
    // Only the longest credential name can affect a suffix match. Keeping the
    // full growing prefix makes repeated endsWith checks quadratic on long keys.
    suffix = (suffix + normalizedWord).slice(-MAX_SECRET_PARAMETER_LENGTH);
    return SECRET_PARAMETER_NAMES.some(
      (secret) =>
        (length === secret.length && suffix === secret) ||
        (secret.length > 3 && suffix.endsWith(secret)),
    );
  });
}

function isBooleanCredentialControl(name: string, value: string | undefined): boolean {
  // Boolean controls such as includeCredentials are settings, not credential values.
  return (
    /^(?:true|false)$/i.test(value ?? '') &&
    /(?:^|[.\[])(?:include|require|use|with|enable|disable)(?:[a-z]|[_-])[^.\[\]]*\]?$/i.test(name)
  );
}

function isSecretParameter(
  name: string,
  value: string | undefined,
  includeGenericKey = true,
): boolean {
  if (isBooleanCredentialControl(name, value)) {
    return false;
  }
  return name
    .split(/[.\[\]]+/)
    .some(
      (part) =>
        (includeGenericKey || normalizeFieldName(part) !== 'key') && isSecretParameterName(part),
    );
}

/**
 * Whether any `key=value` segment carries a credential — by a secret-looking
 * value or a secret-named key. Splits on every URL pair delimiter (`? & ; #`),
 * so it catches credentials the WHATWG URL parser does not isolate: values under
 * a benign name in a malformed URL, and `;`-separated query pairs (URLSearchParams
 * only splits on `&`). Linear: a single split plus per-segment checks.
 */
function hasSecretFormSegment(
  text: string,
  preservePureTemplates = false,
  compoundContext?: CompoundKeyContext,
): boolean {
  for (const segment of text.split(/[?&;#]/)) {
    const equalsIndex = segment.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const rawValue = segment.slice(equalsIndex + 1);
    if (!rawValue || (preservePureTemplates && isPureTemplateValue(rawValue))) {
      continue;
    }
    const decodedValue = decodeFormComponent(rawValue);
    if (compoundContext?.guardUrlPayload) {
      const scalar = getUrlPayloadScalar(decodedValue ?? rawValue, compoundContext.maxDepth);
      if (
        scalar === null ||
        (!hasOnlyTemplateUserinfo(scalar) &&
          hasUrlPayloadUserinfo(scalar, compoundContext.guardUrlPayload))
      ) {
        return true;
      }
    }
    if (
      looksLikeSecret(rawValue) ||
      (decodedValue !== undefined && looksLikeSecret(decodedValue))
    ) {
      return true;
    }
    const rawKey = segment.slice(0, equalsIndex);
    const key = decodeFormComponent(rawKey) ?? rawKey;
    if (isSecretParameterWithContext(key, decodedValue, compoundContext)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether an unparseable URL string plausibly carries a credential. Used to keep
 * sanitizeUrl fail-closed for credential-bearing junk while preserving ordinary
 * non-URL strings (bare domains, relative paths, prose), which also flow through
 * sanitizeObject for any field literally named `url` and would otherwise be
 * destroyed in persisted eval results.
 *
 * Detection is structural — URL userinfo, a whole value that
 * looks like a secret, or a `key=value` form segment that carries one. We do NOT
 * fail closed on a bare credential keyword appearing anywhere in the string:
 * substring-matching `token`/`secret`/`sig`/etc. redacts benign values such as
 * `my-tokenizer-model`, `secrets/config.yaml`, or `design-system` (contains `sig`),
 * which is data loss with no corresponding leak. Genuine credential shapes all
 * carry one of the structural markers above (the secret-named-key case is covered
 * by `hasSecretFormSegment`, which normalizes keys like `api_key` before matching).
 */
function unparseableUrlMightLeakSecret(
  url: string,
  preservePureTemplates = false,
  compoundContext?: CompoundKeyContext,
): boolean {
  const scalar = compoundContext?.guardUrlPayload
    ? getUrlPayloadScalar(url, compoundContext.maxDepth)
    : url;
  return (
    scalar === null ||
    (compoundContext?.guardUrlPayload
      ? hasUrlPayloadUserinfo(scalar, compoundContext.guardUrlPayload)
      : hasUrlUserinfo(scalar)) ||
    looksLikeSecret(scalar.trim()) ||
    hasSecretFormSegment(scalar, preservePureTemplates, compoundContext)
  );
}

/**
 * Set of field names that should be redacted (case-insensitive, with hyphens/underscores normalized)
 * Note: Keys are stored in their normalized form (lowercase, no hyphens/underscores)
 */
export const SECRET_FIELD_NAMES = new Set([
  // Password variants
  'password',
  'passwd',
  'pwd',

  // Secret variants
  'secret',
  'secrets',
  'secretkey',
  'credentials',

  // API keys and tokens
  'apikey',
  'apisecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearertoken',
  'authtoken',
  'clientsecret',
  'webhooksecret',
  'anthropicapikey',
  'awsbearertokenbedrock',

  // AWS SigV4 credentials. Both spellings are needed: normalizeFieldName strips
  // underscores, so the env var AWS_SECRET_ACCESS_KEY collapses to
  // 'awssecretaccesskey' while the documented provider config field
  // `secretAccessKey` collapses to 'secretaccesskey'. These are first-class,
  // documented Bedrock config fields (see site/docs/providers/aws-bedrock.md),
  // so an inline credential otherwise reaches logs and shared configs in clear text.
  'secretaccesskey',
  'awssecretaccesskey',
  'sessiontoken',
  'awssessiontoken',
  'accesskeyid',
  'awsaccesskeyid',
  'authorization',
  'auth',
  'bearer',
  'apikeyenvar', // environment variable name for API key

  // Header-specific patterns (normalized: hyphens removed)
  'xapikey', // x-api-key
  'xauthtoken', // x-auth-token
  'xaccesstoken', // x-access-token
  'xauth', // x-auth
  'xsecret', // x-secret
  'xcsrftoken', // x-csrf-token
  // Portkey gateway credential headers. The provider derives these from `portkey*` config
  // keys, so the vendor prefix keeps them out of the generic 'apikey' match.
  'portkeyapikey', // portkeyApiKey config field
  'portkeyvirtualkey', // portkeyVirtualKey config field
  'xportkeyapikey', // x-portkey-api-key
  'xportkeyvirtualkey', // x-portkey-virtual-key
  'xportkeyawsaccesskeyid', // x-portkey-aws-access-key-id
  'xportkeyawssecretaccesskey', // x-portkey-aws-secret-access-key
  'xportkeyawssessiontoken', // x-portkey-aws-session-token
  'xsessiondata', // x-session-data
  'csrftoken', // csrf-token
  'sessionid', // session-id
  'session', // session
  'cookie',
  'setcookie', // set-cookie

  // Certificate and encryption
  'certificatepassword',
  'keystorepassword',
  'pfxpassword',
  'privatekey',
  'certkey',
  'encryptionkey',
  'signingkey',
  'signature',
  'sig',
  'passphrase',
  'certificatecontent',
  'keystorecontent',
  'pfx',
  'pfxcontent',
  'keycontent',
  'certcontent',
]);

// Ambiguous names need a complete segment match: oauth/useSession/sameSiteCookie are settings.
const SECRET_PARAMETER_NAMES = [...SECRET_FIELD_NAMES].filter(
  (name) => !['auth', 'session', 'cookie', 'setcookie'].includes(name),
);
const MAX_SECRET_PARAMETER_LENGTH = Math.max(...SECRET_PARAMETER_NAMES.map((name) => name.length));

// MCP object fields use terminal credential names: tokenUsage/passwordPolicy describe
// ordinary data even though the broader URL-parameter policy recognizes their prefixes.
function isCompoundSecretObjectField(name: string, value: unknown): boolean {
  if (value === null || typeof value === 'boolean') {
    return false;
  }
  const normalized = normalizeFieldName(name);
  const textValue =
    typeof value === 'string' || typeof value === 'boolean' ? String(value) : undefined;
  if (isBooleanCredentialControl(name, textValue)) {
    return false;
  }
  // Preserve the existing value-bearing aliases and numeric versions, including
  // databasePasswordValue, tokenHash and dbPwdV2Encrypted. These passes are bounded.
  let materialName = normalized;
  for (let pass = 0; pass < 2; pass++) {
    let end = materialName.length;
    while (
      end > 0 &&
      materialName.charCodeAt(end - 1) >= 48 &&
      materialName.charCodeAt(end - 1) <= 57
    ) {
      end--;
    }
    if (end < materialName.length && materialName[end - 1] === 'v') {
      end--;
    }
    materialName = materialName.slice(0, end);
    if (pass === 0) {
      materialName = materialName.replace(/(?:value|hash|encrypted)$/, '');
    }
  }
  // Reuse the established terminal vocabulary (including credential, DSN and
  // accessKey) without inheriting its broader descriptive `related` category.
  if (getCredentialFieldKind(materialName) === 'credential') {
    return true;
  }
  const terminal = SECRET_PARAMETER_NAMES.find((secret) => materialName.endsWith(secret));
  if (!terminal) {
    return false;
  }
  // The URL policy intentionally omits short suffixes, but dbPwd/userSig are
  // credential-bearing object names. Bare `key` is not in SECRET_PARAMETER_NAMES.
  return terminal.length <= 3 || isSecretParameter(name, textValue, false);
}

// Provider usage and tokenization fields hold counts or token pieces. Match only
// these finite metadata roles, not arbitrary prefixes such as access/auth/session.
// Descendants still receive ordinary credential checks, and inherited private
// collection roles take precedence over this MCP-only field classification.
function isMcpTokenMetadataName(normalized: string): boolean {
  return (
    /^(?:input|output|completion|prompt|reasoning(?:output)?|thinking|thought|response|logit|reserved|budget|(?:additional)?special|num(?:input(?:image|text)?|output)?|total(?:input|output|cached|reasoning|thought|tooluse)?)tokens$/.test(
      normalized,
    ) ||
    /^(?:(?:audio|image|video|text)(?:input|output|completion|prompt)?|(?:cached|uncached)(?:audio|image|video|text|nontext)?(?:input|prompt|response)?|toolprompt)tokens$/.test(
      normalized,
    ) ||
    /^(?:cache(?:read|write|creation)(?:input)?|promptcache(?:hit|miss)|billablecached|(?:accepted|rejected)prediction|(?:max|min)(?:completion|new|output|thinking|responseoutput)?)tokens$/.test(
      normalized,
    )
  );
}

// Credential collections retain their structure but hide string and numeric
// descendants; direct scalar counts stay intact. Metadata roles remain ordinary
// and recurse through credential/URL checks. This policy is only enabled for MCP.
function getCompoundSecretObjectFieldKind(
  name: string,
  value: unknown,
): 'credential' | 'related' | undefined {
  if (value === null || typeof value === 'boolean') {
    return undefined;
  }
  const normalized = normalizeFieldName(name);
  if (
    normalized === 'basicauth' ||
    normalized === 'sessioncookie' ||
    normalized === 'subscriptionkey' ||
    (normalized === 'authheaders' && typeof value !== 'object')
  ) {
    return 'credential';
  }
  if (
    isMcpTokenMetadataName(normalized) ||
    /(?:tokenusages?|tokenbudgets?|tokenids|signaturealgorithms?|passwordpolic(?:y|ies))$/.test(
      normalized,
    ) ||
    /(?:url|uri|host|endpoint|proxy)$/.test(normalized) ||
    isBooleanCredentialControl(name, typeof value === 'string' ? value : undefined)
  ) {
    return undefined;
  }
  if (
    /^(?:cookies|cookiejars?|basicauths|sessioncookies|subscriptionkeys)$/.test(normalized) ||
    (normalized === 'authheaders' && Array.isArray(value))
  ) {
    return 'related';
  }
  // Retain terminal precedence: userCredentials is itself a credential field,
  // while clientSecrets is a collection of individual credentials.
  if (getCredentialFieldKind(name) === 'credential' && isCompoundSecretObjectField(name, value)) {
    return 'credential';
  }
  const singular = singularizeFieldName(name);
  // Only actual credential collections inherit the private-value role. A
  // credential word in tokenCounts/tokenSettings describes ordinary metadata.
  if (normalizeFieldName(singular) !== normalized && isCompoundSecretObjectField(singular, value)) {
    return 'related';
  }
  if (isCompoundSecretObjectField(name, value)) {
    return 'credential';
  }
  // Retain established qualified collections without treating every suffix as
  // a credential qualifier. Inspect one bounded word-delimited By/For prefix.
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  const qualifier = /[-_\s=](?:by|for)[-_\s=]/i.exec(words);
  if (qualifier && qualifier.index + qualifier[0].length < words.length) {
    const prefix = words.slice(0, qualifier.index);
    if (isCompoundSecretObjectField(singularizeFieldName(prefix), value)) {
      return 'related';
    }
  }
  return undefined;
}

// Carry the MCP-only policy and remaining object depth through existing encoded
// JSON paths. Public URL/form sanitizers keep their established defaults.
type UrlPayloadGuard = boolean | 'logging' | 'host';
type CompoundKeyContext = {
  maxDepth: number;
  guardUrlPayload?: UrlPayloadGuard;
  pendingFormDecode?: number;
};

function isLoggingUrlPayload(guard?: UrlPayloadGuard): boolean {
  return guard === 'logging' || guard === 'host';
}

function isSecretParameterWithContext(
  name: string,
  value: string | undefined,
  compoundContext?: CompoundKeyContext,
): boolean {
  if (
    compoundContext?.pendingFormDecode &&
    value !== undefined &&
    isPureTemplateValue(
      decodePendingComponent(value, compoundContext.pendingFormDecode - 1) ?? value,
    )
  ) {
    return false;
  }
  // Predicates must see the same pending value interpretation as the owner.
  // Invalid escapes cannot form a true/false control, so retain their bytes.
  const inspectedValue =
    compoundContext?.pendingFormDecode && value !== undefined
      ? (decodePendingComponent(value, compoundContext.pendingFormDecode) ?? value)
      : value;
  return (
    isSecretParameter(name, inspectedValue) ||
    (compoundContext !== undefined &&
      name
        .split(/[.\[\]]+/)
        .some((part) => getCompoundSecretObjectFieldKind(part, inspectedValue) !== undefined))
  );
}

/**
 * Normalize field names for comparison (lowercase, drop hyphens, underscores,
 * whitespace, and stray `=`). Whitespace covers `Api Key` and `api+key` (which
 * URL-decodes to `api key`); the `=` strip covers `api%3Dkey` (decodes to
 * `api=key`). All collapse to `apikey` and match SECRET_FIELD_NAMES.
 */
export function normalizeFieldName(fieldName: string): string {
  return fieldName.toLowerCase().replace(/[-_\s=]/g, '');
}

/**
 * Check if a field name should be redacted
 */
export function isSecretField(fieldName: string): boolean {
  return SECRET_FIELD_NAMES.has(normalizeFieldName(fieldName));
}

/**
 * Matched as a whole `_`-delimited word only. `KEY` is short enough to sit inside ordinary
 * words — `PORTKEY_API_BASE_URL` is a documented endpoint, `MONKEY` is a word — so the
 * credential compounds that end in it are listed explicitly below instead.
 */
const ENV_SECRET_WHOLE_WORDS = new Set(['KEY']);

/**
 * Matched as a whole word *or* a suffix, so fused vendor spellings are caught:
 * `PGPASSWORD`, `GCP_PRIVATEKEY`, `DBPWD`, `DATABASEDSN`. Each is either long enough that a
 * suffix match is unambiguous, or (like `PWD`/`DSN`) has no ordinary-word collisions.
 *
 * Singular on purpose: `MAX_TOKENS` ends with `TOKENS`, which does not end with `TOKEN`.
 */
const ENV_SECRET_SUFFIX_WORDS = [
  'PASSWORD',
  'PASSWD',
  'PASSPHRASE',
  'CREDENTIALS',
  'CREDENTIAL',
  'SECRET',
  'TOKEN',
  'PWD',
  'DSN',
  // Every credential name in SECRET_FIELD_NAMES that ends in `key`, so a prefixed spelling
  // (`APP_ENCRYPTIONKEY`, `VENDOR_CERTKEY`) is still caught even though the exact-name match
  // cannot see past the prefix. Derived rather than hand-listed so the two stay in sync; all
  // are at least six characters, so none of them matches `PORTKEY` or `MONKEY`.
  ...[...SECRET_FIELD_NAMES].filter((name) => name.endsWith('key') && name.length > 3),
  // Not in SECRET_FIELD_NAMES on its own — that set carries `accesskeyid` — but the bare
  // compound shows up in env vars.
  'accesskey',
].map((word) => word.toUpperCase());

/** `clientSecrets` as `client_Secret`: every word without its plural ending. */
function singularizeFieldName(fieldName: string): string {
  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[-_\s=]+/)
    .map((word) => (word.length > 3 && /[^s]s$/i.test(word) ? word.slice(0, -1) : word))
    .join('_');
}

/**
 * How a field name relates to credentials, for data whose keys are not under our control,
 * such as the arguments of a tool call. `isSecretField` only knows exact names.
 *
 * - `'credential'`: the name ends in a credential word, as `databasePassword`,
 *   `db_password` and `userApiKey` do.
 * - `'related'`: the name is the plural of such a name (`accessTokens`) or qualifies a
 *   credential word (`apiKeyForTenant`), by the rules for URL parameter names. Such a name
 *   can also hold a count or a setting (`inputTokens`, `tokenCount`).
 * - `undefined`: neither. That includes cursors and special tokens (`pageToken`,
 *   `maxTokens`) and a bare `key`, which is an ordinary argument name.
 *
 * This is not applied to configs, where a key such as `secret_name` is a setting.
 */
export function getCredentialFieldKind(fieldName: string): 'credential' | 'related' | undefined {
  const endsInCredentialWord = (normalized: string) =>
    ENV_SECRET_SUFFIX_WORDS.some((secret) => normalized.toUpperCase().endsWith(secret));

  const normalized = normalizeFieldName(fieldName);
  if (isBenignParameterName(normalized)) {
    return undefined;
  }
  if (endsInCredentialWord(normalized)) {
    return 'credential';
  }
  const singular = singularizeFieldName(fieldName);
  const normalizedSingular = normalizeFieldName(singular);
  if (isBenignParameterName(normalizedSingular)) {
    return undefined;
  }
  return hasCredentialCompound(fieldName) ||
    hasCredentialCompound(singular) ||
    endsInCredentialWord(normalizedSingular)
    ? 'related'
    : undefined;
}

/**
 * Secret only as the final `_`-delimited word. `MLFLOW_BASIC_AUTH` and `NPM_CONFIG__AUTH`
 * hold a credential; `WATSONX_AI_AUTH_TYPE` names a method and `OAUTH_SCOPE` is not an
 * `AUTH` word at all.
 */
const ENV_SECRET_TERMINAL_WORDS = new Set(['AUTH']);

/**
 * An environment-variable-shaped name. Leading underscores are legal and used in practice
 * (`_GITHUB_TOKEN`), so they must not be a way around the check. Case is normalized before
 * this is applied.
 */
const ENV_VAR_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

/**
 * Check whether an environment-variable name looks credential-bearing.
 *
 * `SECRET_FIELD_NAMES` matches exact names, which can never cover the project-specific
 * names real environments use — `GITHUB_TOKEN`, `STRIPE_SECRET_KEY`, `PGPASSWORD` all
 * slip through it. An `env` map is passed straight to a subprocess, so it is the one
 * place a config is *expected* to hold credentials; treat a credential-worded key there
 * as secret.
 *
 * Case is normalized first: nothing requires an env var to be uppercase, and a lowercase
 * `github_token` reaches the subprocess exactly like `GITHUB_TOKEN` does.
 */
export function isSecretEnvVarName(name: string): boolean {
  if (isSecretField(name)) {
    return true;
  }
  const normalized = name.toUpperCase();
  if (!ENV_VAR_NAME_RE.test(normalized)) {
    return false;
  }
  const words = normalized.split('_');
  if (ENV_SECRET_TERMINAL_WORDS.has(words[words.length - 1])) {
    return true;
  }
  return words.some(
    (word) =>
      ENV_SECRET_WHOLE_WORDS.has(word) ||
      ENV_SECRET_SUFFIX_WORDS.some((secret) => word.endsWith(secret)),
  );
}

/**
 * Sanitizes runtime options to ensure only JSON-serializable data is persisted or exported.
 * Removes non-serializable fields like AbortSignal, functions, and symbols.
 */
export function sanitizeRuntimeOptions(
  options?: EvalRuntimeOptions,
): EvalRuntimeOptions | undefined {
  if (!options) {
    return undefined;
  }

  // Create a copy to avoid mutating the original options object.
  const sanitized = { ...options };

  delete sanitized.abortSignal;

  const sanitizedEntries = sanitized as Record<string, unknown>;
  for (const [key, value] of Object.entries(sanitizedEntries)) {
    if (typeof value === 'function' || typeof value === 'symbol') {
      delete sanitizedEntries[key];
    }
  }

  return sanitized;
}

// Known credential formats are also safe to recognize in structural map keys.
// Opaque-length heuristics remain value-only so ordinary tenant IDs retain names.
function matchesCredentialFormat(value: string): boolean {
  // OpenAI API keys (sk-...)
  if (/^sk-[a-zA-Z0-9-_]{20,}/.test(value)) {
    return true;
  }

  // OpenAI project keys (sk-proj-...)
  if (/^sk-proj-[a-zA-Z0-9-_]{20,}/.test(value)) {
    return true;
  }

  // Anthropic keys (sk-ant-...)
  if (/^sk-ant-[a-zA-Z0-9-_]{20,}/.test(value)) {
    return true;
  }

  // Generic API key patterns (key-...)
  if (/^key-[a-zA-Z0-9]{20,}/.test(value)) {
    return true;
  }

  // Bearer tokens
  if (/^Bearer\s+.{20,}/i.test(value)) {
    return true;
  }

  // Basic auth
  if (/^Basic\s+.{20,}/i.test(value)) {
    return true;
  }

  // AWS-style access keys (AKIA...)
  if (/^AKIA[A-Z0-9]{16}/.test(value)) {
    return true;
  }

  // Google API keys (AIza...)
  if (/^AIza[a-zA-Z0-9_-]{35}/.test(value)) {
    return true;
  }

  return false;
}

/**
 * Check if a value looks like a secret based on common patterns.
 * Detects API keys, tokens, and other credential patterns.
 */
export function looksLikeSecret(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (matchesCredentialFormat(value)) {
    return true;
  }

  // Long base64-like strings (likely tokens/keys) - 64+ chars of alphanumeric
  // Using 64 chars to reduce false positives on concatenated IDs, base64 content, or long model names
  // Scan for disallowed characters without growing the regex stack for large values.
  if (value.length >= 64 && !/[^a-zA-Z0-9+/=_-]/.test(value)) {
    return true;
  }

  return false;
}

// Headers with standard non-credential meanings; other custom headers may authenticate a gateway.
const NON_CREDENTIAL_HEADERS = new Set([
  'accept',
  'content-type',
  'openai-beta',
  'openai-organization',
  'openai-project',
  'user-agent',
  'x-openai-originator',
]);

export function isNonCredentialHeader(name: string): boolean {
  return NON_CREDENTIAL_HEADERS.has(name.toLowerCase());
}

const SAFE_TRACING_CREDENTIAL_TEMPLATE =
  /^(?:(?:bearer|basic|token|api[-_]?key)\s+)?\{\{\s*env(?:\.[A-Za-z_][A-Za-z0-9_]*|\[['"][A-Za-z_][A-Za-z0-9_]*['"]\])+\s*(?:\|\s*(?:trim|urlencode)\s*)*\}\}$/i;

interface TracingCredentialReference {
  template: string;
  renderedValue: string;
}

interface TracingCredentialReferences {
  auth: Map<string, TracingCredentialReference>;
  headers: Map<string, TracingCredentialReference>;
  env: Map<string, TracingCredentialReference>;
}

const tracingCredentialReferences = new WeakMap<object, TracingCredentialReferences>();
const SAFE_TRACING_PROVIDER_HEADERS = new Set([
  'accept',
  'content-type',
  'x-org-id',
  'x-organization-id',
  'x-scope-orgid',
  'x-tenant-id',
]);

function isSafeTracingCredentialTemplate(value: unknown): value is string {
  return typeof value === 'string' && SAFE_TRACING_CREDENTIAL_TEMPLATE.test(value.trim());
}

function isTracingCredentialHeader(name: string, value: string): boolean {
  const normalizedName = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return (
    isSecretField(name) ||
    /(?:^|[-_\s])(?:api[-_\s]?key|access[-_\s]?key|auth(?:orization)?|token|password|passwd|secret|credentials?|cookie)(?:$|[-_\s])/i.test(
      normalizedName,
    ) ||
    normalizedName.replace(/[-_]/g, '') === 'xhoneycombteam' ||
    /^(?:bearer|basic|token|api[-_]?key)\s+\S+/i.test(value.trim()) ||
    looksLikeSecret(value.trim())
  );
}

function isNonSensitiveTracingHeader(name: string, value: string): boolean {
  return (
    SAFE_TRACING_PROVIDER_HEADERS.has(name.toLowerCase()) && !isTracingCredentialHeader(name, value)
  );
}

function getTracingTemplateEnvironmentVariable(template: string): string | undefined {
  if (!isSafeTracingCredentialTemplate(template)) {
    return undefined;
  }
  const match = template.match(
    /\benv(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\])/,
  );
  return match?.[1] ?? match?.[2];
}

/**
 * Retains safe credential references alongside their rendered provider without exposing
 * internal bookkeeping through config serialization or provider-visible properties.
 */
export function preserveTracingCredentialReferences(
  sourceConfig: Partial<UnifiedConfig>,
  renderedConfig: Partial<UnifiedConfig>,
): void {
  const sourceProvider = sourceConfig.tracing?.provider;
  const renderedProvider = renderedConfig.tracing?.provider;
  if (!sourceProvider || !renderedProvider) {
    return;
  }

  const references: TracingCredentialReferences = {
    auth: new Map(),
    headers: new Map(),
    env: new Map(),
  };

  for (const [key, template] of Object.entries(sourceProvider.auth ?? {})) {
    if (key !== 'token' && key !== 'password') {
      continue;
    }
    const renderedValue = Object.entries(renderedProvider.auth ?? {}).find(
      ([renderedKey]) => renderedKey === key,
    )?.[1];
    if (isSafeTracingCredentialTemplate(template) && typeof renderedValue === 'string') {
      references.auth.set(key, { template, renderedValue });
    }
  }

  for (const [name, template] of Object.entries(sourceProvider.headers ?? {})) {
    const renderedValue = renderedProvider.headers?.[name];
    if (isSafeTracingCredentialTemplate(template) && typeof renderedValue === 'string') {
      references.headers.set(name, { template, renderedValue });
    }
  }

  const credentialTemplates = [
    ...references.auth.values(),
    ...Array.from(references.headers.entries())
      .filter(([name, reference]) => !isNonSensitiveTracingHeader(name, reference.renderedValue))
      .map(([, reference]) => reference),
  ];
  const sourceEnv = sourceConfig.env as Record<string, unknown> | undefined;
  const renderedEnv = renderedConfig.env as Record<string, unknown> | undefined;
  const visitedEnvironmentVariables = new Set<string>();
  for (const { template } of credentialTemplates) {
    let name = getTracingTemplateEnvironmentVariable(template);
    while (name && !visitedEnvironmentVariables.has(name)) {
      visitedEnvironmentVariables.add(name);
      const sourceValue = sourceEnv?.[name];
      const renderedValue = renderedEnv?.[name];
      if (!isSafeTracingCredentialTemplate(sourceValue) || typeof renderedValue !== 'string') {
        break;
      }
      references.env.set(name, { template: sourceValue, renderedValue });
      name = getTracingTemplateEnvironmentVariable(sourceValue);
    }
  }

  if (references.auth.size > 0 || references.headers.size > 0) {
    tracingCredentialReferences.set(renderedProvider, references);
  }
}

function getReferencedTracingCredentialEnvironmentVariables(
  auth: Record<string, unknown> | undefined,
  headers: Record<string, string> | undefined,
  env: Record<string, unknown> | undefined,
  references: TracingCredentialReferences | undefined,
): Set<string> {
  const variables = new Set<string>();
  for (const [name, value] of Object.entries(auth ?? {})) {
    if ((name === 'token' || name === 'password') && typeof value === 'string') {
      const variable = getTracingTemplateEnvironmentVariable(value);
      if (variable) {
        variables.add(variable);
      }
    }
  }
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!isNonSensitiveTracingHeader(name, value)) {
      const variable = getTracingTemplateEnvironmentVariable(value);
      if (variable) {
        variables.add(variable);
      }
    }
  }

  for (const name of variables) {
    const value = env?.[name];
    const reference = references?.env.get(name);
    const template = isSafeTracingCredentialTemplate(value)
      ? value
      : reference && reference.renderedValue === value
        ? reference.template
        : undefined;
    const variable = template ? getTracingTemplateEnvironmentVariable(template) : undefined;
    if (variable) {
      variables.add(variable);
    }
  }

  return variables;
}

/**
 * Keeps runtime trace-provider credentials out of persisted and exported eval configs.
 * Safe environment references remain intact so resumed evaluations can resolve them again.
 */
export function sanitizeTracingConfigForPersistence(
  config: Partial<UnifiedConfig>,
): Partial<UnifiedConfig> {
  const provider = config.tracing?.provider;
  if (!provider) {
    return config;
  }

  let sanitizedEndpoint = provider.endpoint;
  try {
    const endpoint = new URL(provider.endpoint);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      endpoint.username = '';
      endpoint.password = '';
      endpoint.search = '';
      endpoint.hash = '';
      sanitizedEndpoint = endpoint.toString();
    }
    const safeEndpoint = sanitizeUrlForLogging(endpoint.toString());
    if (safeEndpoint !== endpoint.toString()) {
      sanitizedEndpoint = safeEndpoint;
    }
  } catch {
    sanitizedEndpoint = sanitizeUrl(provider.endpoint);
  }

  const references = tracingCredentialReferences.get(provider);
  const sanitizedAuth = provider.auth
    ? Object.fromEntries(
        Object.entries(provider.auth).flatMap(([key, value]) => {
          if ((key !== 'token' && key !== 'password') || isSafeTracingCredentialTemplate(value)) {
            return [[key, value]];
          }
          const reference = references?.auth.get(key);
          return reference && reference.renderedValue === value ? [[key, reference.template]] : [];
        }),
      )
    : undefined;
  const sanitizedHeaders = provider.headers
    ? Object.fromEntries(
        Object.entries(provider.headers).flatMap(([name, value]) => {
          if (typeof value !== 'string') {
            return [];
          }
          const reference = references?.headers.get(name);
          if (reference?.renderedValue === value) {
            return [[name, reference.template]];
          }
          if (isSafeTracingCredentialTemplate(value) || isNonSensitiveTracingHeader(name, value)) {
            return [[name, value]];
          }
          return [];
        }),
      )
    : undefined;
  const referencedCredentialEnvironmentVariables =
    getReferencedTracingCredentialEnvironmentVariables(
      sanitizedAuth,
      sanitizedHeaders,
      config.env as Record<string, unknown> | undefined,
      references,
    );
  const sanitizedEnv = config.env
    ? Object.fromEntries(
        Object.entries(config.env).flatMap(([name, value]) => {
          if (!referencedCredentialEnvironmentVariables.has(name)) {
            return [[name, value]];
          }
          if (isSafeTracingCredentialTemplate(value)) {
            return [[name, value]];
          }
          const reference = references?.env.get(name);
          return reference?.renderedValue === value ? [[name, reference.template]] : [];
        }),
      )
    : undefined;

  const sanitizedProvider = {
    ...provider,
    endpoint: sanitizedEndpoint,
    ...(provider.auth && { auth: sanitizedAuth }),
    ...(provider.headers && { headers: sanitizedHeaders }),
  } as typeof provider;

  return {
    ...config,
    ...(config.env && { env: sanitizedEnv }),
    tracing: {
      ...config.tracing!,
      provider: sanitizedProvider,
    },
  };
}

/** Sanitize exported/shared configuration while preserving safe tracing env references. */
export function sanitizeConfigForOutput(
  config: Partial<UnifiedConfig>,
  options: {
    shouldStripPromptText?: boolean;
    shouldStripTestVars?: boolean;
    shouldStripMetadata?: boolean;
    shouldStripResponseOutput?: boolean;
  } = {},
): Partial<UnifiedConfig> {
  const safe = sanitizeTracingConfigForPersistence(config);
  const { basePath, ...outputConfig } = safe;
  const sanitized = sanitizeObject(outputConfig, {
    context: 'output config',
    sanitizeUrls: true,
    throwOnError: true,
    maxDepth: Number.POSITIVE_INFINITY,
  }) as Partial<UnifiedConfig>;
  if (basePath !== undefined) {
    sanitized.basePath = basePath;
  }
  if (options.shouldStripPromptText) {
    delete sanitized.prompts;
  }
  const {
    shouldStripTestVars: stripVars,
    shouldStripMetadata: stripMetadata,
    shouldStripResponseOutput: stripOutput,
  } = options;
  const collectTests = (value: Partial<UnifiedConfig>) => [
    ...(Array.isArray(value.tests) ? value.tests : []),
    value.defaultTest,
    ...(value.scenarios ?? []).flatMap((scenario) =>
      typeof scenario === 'object'
        ? [...(scenario.config ?? []), ...(Array.isArray(scenario.tests) ? scenario.tests : [])]
        : [],
    ),
  ];
  const sourceTests = collectTests(safe);
  for (const [index, test] of collectTests(sanitized).entries()) {
    if (!test || typeof test !== 'object') {
      continue;
    }
    const sourceTest = sourceTests[index];
    const sourceMetadata =
      sourceTest && typeof sourceTest === 'object' && 'metadata' in sourceTest
        ? sourceTest.metadata?.__promptfoo
        : undefined;
    const providerBasePath = sourceMetadata?.providerBasePath;
    // Like the config's basePath, local provider origins are operational paths, not
    // opaque tokens. Keep them for replay; sharing removes them from its own copy.
    if (
      'metadata' in test &&
      sourceMetadata?.remote !== true &&
      typeof providerBasePath === 'string' &&
      /^(?:\/|[a-zA-Z]:[\\/]|\\\\)/.test(providerBasePath)
    ) {
      test.metadata = {
        ...test.metadata,
        __promptfoo: { ...test.metadata?.__promptfoo, providerBasePath },
      };
    }
    if (stripVars && 'vars' in test) {
      delete test.vars;
    }
    if (stripMetadata && 'metadata' in test) {
      // Remote-row safety and local replay origins are operational metadata.
      if (test.metadata?.__promptfoo?.remote === true) {
        test.metadata = { __promptfoo: { remote: true } };
      } else if (typeof test.metadata?.__promptfoo?.providerBasePath === 'string') {
        test.metadata = {
          __promptfoo: { providerBasePath: test.metadata.__promptfoo.providerBasePath },
        };
      } else {
        delete test.metadata;
      }
    }
    if (stripOutput && 'providerOutput' in test) {
      delete test.providerOutput;
    }
  }
  const provider = safe.tracing?.provider;
  const sanitizedProvider = sanitized.tracing?.provider;
  if (provider && sanitizedProvider) {
    const referencedEnv = getReferencedTracingCredentialEnvironmentVariables(
      provider.auth,
      provider.headers,
      safe.env,
      undefined,
    );
    for (const [name, value] of Object.entries(safe.env ?? {})) {
      if (sanitized.env && referencedEnv.has(name) && isSafeTracingCredentialTemplate(value)) {
        Object.assign(sanitized.env, { [name]: value });
      }
    }
    for (const field of ['auth', 'headers'] as const) {
      const values = provider[field];
      if (!values) {
        continue;
      }
      const sanitizedValues = sanitizeObject(values) as Record<string, string>;
      for (const [key, value] of Object.entries(values)) {
        if (isSafeTracingCredentialTemplate(value)) {
          sanitizedValues[key] = value;
        }
      }
      sanitizedProvider[field] = sanitizedValues;
    }
  }
  return sanitized;
}

/**
 * Detect class instances (objects with custom prototypes and methods)
 */
function isClassInstance(obj: any): boolean {
  const proto = Object.getPrototypeOf(obj);
  // Bail out early if proto is null or Object.prototype
  if (!proto || proto === Object.prototype) {
    return false;
  }
  const hasMethods = Object.getOwnPropertyNames(proto).some(
    (prop) => prop !== 'constructor' && typeof proto[prop] === 'function',
  );
  return hasMethods;
}

function redactAzureBlobSasToken(value: string): string {
  if (!/^az:\/\//i.test(value)) {
    return value;
  }

  const queryStart = value.indexOf('?');
  if (queryStart === -1) {
    return value;
  }

  const fragmentStart = value.indexOf('#', queryStart);
  const queryEnd = fragmentStart === -1 ? value.length : fragmentStart;
  let redacted = false;
  const sanitizedQuery = value
    .slice(queryStart + 1, queryEnd)
    .split('&')
    .map((parameter) => {
      const equalsIndex = parameter.indexOf('=');
      const encodedName = equalsIndex === -1 ? parameter : parameter.slice(0, equalsIndex);
      let name: string;
      try {
        name = decodeURIComponent(encodedName.replace(/\+/g, ' '));
      } catch {
        return parameter;
      }

      if (name.toLowerCase() !== 'sig') {
        return parameter;
      }

      redacted = true;
      return `${encodedName}=${encodeURIComponent(REDACTED)}`;
    })
    .join('&');

  return redacted
    ? `${value.slice(0, queryStart + 1)}${sanitizedQuery}${value.slice(queryEnd)}`
    : value;
}

/**
 * Redact SAS credentials embedded in Azure Blob config references without
 * applying broader output sanitization to configuration consumed by clients.
 */
export function redactAzureBlobSasTokens<T>(value: T): T {
  if (typeof value === 'string') {
    return redactAzureBlobSasToken(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactAzureBlobSasTokens(item)) as T;
  }

  if (!value || typeof value !== 'object' || isClassInstance(value)) {
    return value;
  }

  const redactedEntries = Object.entries(value).map(([key, item]) => [
    key,
    redactAzureBlobSasTokens(item),
  ]);
  return Object.fromEntries(redactedEntries) as T;
}

type RestoreResult<T> = {
  value: T;
  restored: boolean;
};

function collectStoredAzureBlobSasTokens(
  value: unknown,
  tokensByRedactedUri = new Map<string, string>(),
): Map<string, string> {
  if (typeof value === 'string') {
    const redacted = redactAzureBlobSasToken(value);
    if (redacted !== value && !tokensByRedactedUri.has(redacted)) {
      tokensByRedactedUri.set(redacted, value);
    }
    return tokensByRedactedUri;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStoredAzureBlobSasTokens(item, tokensByRedactedUri);
    }
    return tokensByRedactedUri;
  }

  if (!value || typeof value !== 'object' || isClassInstance(value)) {
    return tokensByRedactedUri;
  }

  for (const item of Object.values(value)) {
    collectStoredAzureBlobSasTokens(item, tokensByRedactedUri);
  }
  return tokensByRedactedUri;
}

function restoreAzureBlobSasTokensFromMap<T>(
  value: T,
  tokensByRedactedUri: ReadonlyMap<string, string>,
): RestoreResult<T> {
  if (typeof value === 'string') {
    const storedValue = tokensByRedactedUri.get(value);
    return storedValue === undefined
      ? { value, restored: false }
      : { value: storedValue as T, restored: true };
  }

  if (Array.isArray(value)) {
    let restored = false;
    const restoredItems = value.map((item) => {
      const result = restoreAzureBlobSasTokensFromMap(item, tokensByRedactedUri);
      restored ||= result.restored;
      return result.value;
    });
    return restored ? { value: restoredItems as T, restored } : { value, restored };
  }

  if (!value || typeof value !== 'object' || isClassInstance(value)) {
    return { value, restored: false };
  }

  let restored = false;
  const restoredEntries = Object.entries(value).map(([key, item]) => {
    const result = restoreAzureBlobSasTokensFromMap(item, tokensByRedactedUri);
    restored ||= result.restored;
    return [key, result.value];
  });
  return restored
    ? { value: Object.fromEntries(restoredEntries) as T, restored }
    : { value, restored };
}

function restoreAzureBlobSasTokensWithResult<T>(value: T, storedValue: unknown): RestoreResult<T> {
  if (typeof value === 'string') {
    if (typeof storedValue === 'string' && value === redactAzureBlobSasToken(storedValue)) {
      return { value: storedValue as T, restored: storedValue !== value };
    }
    return { value, restored: false };
  }

  if (Array.isArray(value)) {
    const storedItems = Array.isArray(storedValue) ? storedValue : [];
    const storedTokensByRedactedUri = collectStoredAzureBlobSasTokens(storedItems);
    let restored = false;
    const restoredItems = value.map((item, index) => {
      const positional = restoreAzureBlobSasTokensWithResult(item, storedItems[index]);

      // Positional restore fails when array entries are reordered, inserted, or
      // edited outside the URI field. Also match by redacted URI identity so
      // unchanged nested SAS references keep their stored signature.
      const fallback = restoreAzureBlobSasTokensFromMap(
        positional.value,
        storedTokensByRedactedUri,
      );
      restored ||= positional.restored || fallback.restored;
      return fallback.value;
    });
    return restored ? { value: restoredItems as T, restored } : { value, restored };
  }

  if (!value || typeof value !== 'object' || isClassInstance(value)) {
    return { value, restored: false };
  }

  const storedObject =
    storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue)
      ? (storedValue as Record<string, unknown>)
      : {};
  let restored = false;
  const restoredEntries = Object.entries(value).map(([key, item]) => {
    const result = restoreAzureBlobSasTokensWithResult(item, storedObject[key]);
    restored ||= result.restored;
    return [key, result.value];
  });
  return restored
    ? { value: Object.fromEntries(restoredEntries) as T, restored }
    : { value, restored };
}

/**
 * Preserve stored SAS credentials when a sanitized config is written back unchanged.
 * If the caller edits the resource or supplies a replacement token, retain its value.
 */
export function restoreAzureBlobSasTokens<T>(value: T, storedValue: unknown): T {
  return restoreAzureBlobSasTokensWithResult(value, storedValue).value;
}

/**
 * Parse and sanitize JSON strings, also check if the string looks like a secret
 */
function sanitizeJsonString(
  str: string,
  depth: number,
  maxDepth: number,
  sanitizeUrls = false,
  redactCompoundKeys = false,
  guardUrlPayload: UrlPayloadGuard = false,
  pendingFormDecode = 0,
): string {
  const redactedAzureBlobUri = redactAzureBlobSasToken(str);
  if (redactedAzureBlobUri !== str) {
    return redactedAzureBlobUri;
  }

  let parsedJson = false;
  let scalar = str;
  try {
    const parsed = JSON.parse(str);
    parsedJson = true;
    if (typeof parsed === 'string') {
      scalar = parsed;
    }
    if (parsed && typeof parsed === 'object') {
      const sanitized = recursiveSanitize(
        parsed,
        depth,
        maxDepth,
        sanitizeUrls,
        false,
        redactCompoundKeys,
        false,
        guardUrlPayload,
      );
      return JSON.stringify(sanitized);
    }
  } catch (error) {
    if (redactCompoundKeys && parsedJson) {
      // A traversal/serialization failure is not a parse failure. Let MCP's
      // fail-closed boundary handle it instead of restoring the original JSON.
      throw error;
    }
    if (guardUrlPayload) {
      const context = { maxDepth: maxDepth - depth, guardUrlPayload, pendingFormDecode };
      if (
        looksLikeSecret(str) ||
        (isLoggingUrlPayload(guardUrlPayload) && unparseableUrlMightLeakSecret(str, false, context))
      ) {
        return REDACTED;
      }
      return isLoggingUrlPayload(guardUrlPayload)
        ? sanitizeUrlForLoggingWithContext(str, context)
        : sanitizeUrlWithContext(str, context);
    }
    if (looksLikeUrlEncodedFormData(str)) {
      const sanitizedUrlEncoded = sanitizeUrlEncodedStringWithContext(
        str,
        redactCompoundKeys ? { maxDepth: maxDepth - depth } : undefined,
      );
      if (sanitizedUrlEncoded !== str) {
        return sanitizedUrlEncoded;
      }
    }

    // Not JSON - check if it looks like a secret
    if (looksLikeSecret(str)) {
      return REDACTED;
    }
  }
  // Keep public bytes unchanged while applying logging-path checks to the same
  // bounded scalar interpretation as the structural credential guard below.
  const loggingScalar = isLoggingUrlPayload(guardUrlPayload)
    ? getUrlPayloadScalar(scalar, maxDepth - depth)
    : null;
  if (
    guardUrlPayload &&
    (unparseableUrlMightLeakSecret(scalar, !isLoggingUrlPayload(guardUrlPayload), {
      maxDepth: maxDepth - depth,
      guardUrlPayload,
      pendingFormDecode,
    }) ||
      (loggingScalar !== null && hasOpaqueLoggingPath(loggingScalar, true)))
  ) {
    return REDACTED;
  }
  if (
    guardUrlPayload &&
    parsedJson &&
    scalar !== str &&
    /[?#]/.test(scalar.replace(NUNJUCKS_PLACEHOLDER, ''))
  ) {
    if (maxDepth <= depth) {
      return REDACTED;
    }
    let remaining = maxDepth - depth - 1;
    let quotedScalar = scalar;
    let stringLayers = 1;
    // Inspect only additional JSON string layers, never a container twice.
    while (quotedScalar.trimStart().startsWith('"')) {
      if (remaining-- <= 0) {
        return REDACTED;
      }
      try {
        const parsed: unknown = JSON.parse(quotedScalar);
        if (typeof parsed !== 'string') {
          break;
        }
        quotedScalar = parsed;
        stringLayers++;
      } catch {
        break;
      }
    }
    const context = { maxDepth: remaining, guardUrlPayload, pendingFormDecode };
    let sanitized = sanitizeTemplatedUrl(quotedScalar, context, context);
    if (sanitized === quotedScalar) {
      return str;
    }
    for (let layer = 0; layer < stringLayers; layer++) {
      sanitized = JSON.stringify(sanitized);
    }
    return sanitized;
  }
  return str;
}

// `key=value` where the key is a typical form-data identifier (allow brackets
// for PHP/qs-style nested keys) and the value runs to the next separator. The
// first `=` is the separator within a pair; subsequent `=` (e.g. base64
// padding) belong to the value. Both `&` and `;` are accepted as pair
// separators since PHP/CGI/several Java stacks treat `;` as a `&` equivalent.
const URL_ENCODED_SEGMENT_RE = /^[A-Za-z0-9._~+%\[\]-]+=[^&;]*$/;

function looksLikeUrlEncodedFormData(value: string): boolean {
  // Every non-empty separator-delimited chunk must be a `key=value` pair with
  // safe key characters. Values may contain raw spaces because some clients
  // emit non-canonical form bodies instead of encoding them as `+` or `%20`,
  // but multiline/tab-delimited diagnostic text must not be collapsed into a
  // single form field. Empty chunks (leading/trailing/consecutive separators)
  // are tolerated. The strict key shape keeps prose and shell commands
  // containing `=` from being treated as form data.
  if (!value.includes('=') || /[\r\n\t]/.test(value)) {
    return false;
  }
  const segments = value.split(/[&;]/).filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return false;
  }
  return segments.every((segment) => URL_ENCODED_SEGMENT_RE.test(segment));
}

// Matches one `key=value` pair. `[^=&;]+` for the key ensures we split on the
// FIRST `=` (so values can contain `=`, e.g. base64 padding); `[^&;]*` lets the
// value run to the next pair separator (`&` or `;`).
const URL_ENCODED_PAIR_RE = /(^|[&;])([^=&;]+)=([^&;]*)/g;

// URLSearchParams tolerates malformed escapes. Escape only its pair delimiter
// so one already-selected component retains that exact decoder behavior.
function decodeQueryComponent(component: string): string {
  return new URLSearchParams(`value=${component.replace(/&/g, '%26')}`).get('value')!;
}

function decodePendingComponent(
  value: string | undefined,
  count: number,
  decode: (component: string) => string | undefined = decodeFormComponent,
): string | undefined {
  for (let index = 0; index < count && value !== undefined; index++) {
    const next = decode(value);
    if (next === value) {
      break;
    }
    value = next;
  }
  return value;
}

function decodeFormComponent(component: string): string | undefined {
  try {
    return decodeURIComponent(component.replace(/\+/g, ' '));
  } catch {
    return undefined;
  }
}

/**
 * When a form value URL-decodes to a JSON object/array, recursively sanitize
 * it and return the serialized result — but only if sanitization actually
 * changed something. Returns `null` when there is no JSON to sanitize or when
 * the value is JSON but contains no secrets (so callers can preserve the
 * original byte-for-byte). URL-named MCP data can request canonical output even
 * when unchanged, matching the generic JSON-string traversal it replaces.
 */
function redactNestedJsonValue(
  decoded: string | undefined,
  compoundContext?: CompoundKeyContext,
  unchangedResult: 'null' | 'canonical' | 'original' = 'null',
  // Whole URL fields own quoted scalars; form/query candidates retain their
  // dedicated scalar owner so decoding and quote layers are handled once.
  allowQuotedScalar = false,
): string | null {
  if (decoded === undefined) {
    return null;
  }
  const trimmed = decoded.trim();
  if (
    !trimmed ||
    (trimmed[0] !== '{' &&
      trimmed[0] !== '[' &&
      !(allowQuotedScalar && compoundContext?.guardUrlPayload && trimmed[0] === '"'))
  ) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const quotedScalar =
    typeof parsed === 'string' && compoundContext?.guardUrlPayload
      ? getUrlPayloadScalar(decoded, compoundContext.maxDepth)
      : null;
  if (
    quotedScalar !== null &&
    !/^[{\[]/.test(quotedScalar.trimStart()) &&
    /[?#]/.test(quotedScalar.replace(NUNJUCKS_PLACEHOLDER, '')) &&
    compoundContext?.guardUrlPayload
  ) {
    const sanitized = sanitizeJsonString(
      decoded,
      0,
      compoundContext.maxDepth,
      true,
      true,
      compoundContext.guardUrlPayload,
      compoundContext.pendingFormDecode,
    );
    return sanitized !== decoded || unchangedResult !== 'null' ? sanitized : null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  let sanitizedSerialized: string | undefined;
  try {
    const sanitized = sanitizeObjectWithContext(
      parsed,
      {
        sanitizeUrls: true,
        maxDepth: compoundContext?.maxDepth ?? Number.POSITIVE_INFINITY,
        redactCompoundKeys: compoundContext !== undefined,
        throwOnError: compoundContext !== undefined,
      },
      compoundContext?.guardUrlPayload,
    );
    sanitizedSerialized = JSON.stringify(sanitized);
    // Canonical mode only serializes the bounded result, never the unbounded
    // original. A comparison failure must not discard already sanitized data.
    if (unchangedResult === 'canonical' || sanitizedSerialized !== JSON.stringify(parsed)) {
      return sanitizedSerialized;
    }
    return unchangedResult === 'original' ? decoded : null;
  } catch (error) {
    if (compoundContext) {
      return sanitizedSerialized ?? JSON.stringify(REDACTED);
    }
    throw error;
  }
}

// One owner for decoded form/query values: handle JSON containers once, then
// inspect scalar values through the existing dispatcher with less depth. A
// handled, unchanged container returns its decoded bytes to avoid a second pass.
function redactUrlPayloadValue(
  decoded: string | undefined,
  compoundContext?: CompoundKeyContext,
  isParsedQueryValue = false,
  rawValue?: string,
): string | null {
  const originalDecoded = decoded;
  const pendingDecodes = compoundContext?.pendingFormDecode ?? 0;
  const interpretations = [decoded];
  for (let index = 0; index < pendingDecodes && decoded !== undefined; index++) {
    decoded = isParsedQueryValue ? decodeQueryComponent(decoded) : decodeFormComponent(decoded);
    interpretations.push(decoded);
  }
  if (pendingDecodes) {
    compoundContext = { ...compoundContext!, pendingFormDecode: 0 };
  }
  if (compoundContext?.guardUrlPayload && rawValue !== undefined) {
    interpretations.unshift(rawValue);
  }
  // Choose the most decoded valid container before traversing it once. An
  // invalid later spelling must not discard a valid earlier JSON container.
  for (let index = interpretations.length - 1; index >= 0; index--) {
    const candidate = interpretations[index];
    const nestedJson = redactNestedJsonValue(
      candidate,
      compoundContext,
      compoundContext?.guardUrlPayload ? 'original' : 'null',
    );
    if (nestedJson !== null) {
      return nestedJson === candidate ? (originalDecoded ?? rawValue ?? nestedJson) : nestedJson;
    }
  }
  if (compoundContext?.guardUrlPayload) {
    for (let index = 0; index < interpretations.length - 1; index++) {
      const rawScalar = interpretations[index];
      const decodedScalar = interpretations[index + 1];
      if (rawScalar === undefined || decodedScalar === undefined || rawScalar === decodedScalar) {
        continue;
      }
      const rawBoundary = rawScalar.search(/[?#]/);
      const decodedBoundary = decodedScalar.search(/[?#]/);
      if (
        rawBoundary >= 0 &&
        decodedBoundary >= 0 &&
        decodeFormComponent(rawScalar.slice(0, rawBoundary)) ===
          decodedScalar.slice(0, decodedBoundary)
      ) {
        const rawChild = decodedScalar.slice(0, decodedBoundary) + rawScalar.slice(rawBoundary);
        const effectiveScalar = decoded ?? originalDecoded ?? decodedScalar;
        if (
          isLoggingUrlPayload(compoundContext.guardUrlPayload) &&
          !URL_REFERENCE.test(effectiveScalar) &&
          !(isParsedQueryValue && hasOnlyTemplateUserinfo(effectiveScalar)) &&
          unparseableUrlMightLeakSecret(effectiveScalar, false, compoundContext)
        ) {
          return REDACTED;
        }
        if (compoundContext.maxDepth <= 0) {
          return REDACTED;
        }
        const context = {
          ...compoundContext,
          maxDepth: compoundContext.maxDepth - 1,
          pendingFormDecode: interpretations.length - index - 1,
        };
        const preserveUserinfo = isParsedQueryValue && hasOnlyTemplateUserinfo(rawChild);
        const sanitized = preserveUserinfo
          ? sanitizeTemplatedUrl(rawChild, context, context, true)
          : sanitizeUrlValueWithContext(rawChild, context);
        const guarded =
          preserveUserinfo &&
          isLoggingUrlPayload(context.guardUrlPayload) &&
          hasOpaqueLoggingPath(sanitized, true)
            ? REDACTED
            : sanitized;
        return guarded === rawChild ? null : guarded;
      }
    }
    if (decoded === undefined) {
      // Keep the nearest raw spelling's structural guard after a failed decode.
      // Its unapplied layers belong to leaf checks, never to delimiter splitting.
      let index = interpretations.length - 1;
      while (index >= 0 && interpretations[index] === undefined) {
        index--;
      }
      const rawScalar = interpretations[index];
      const context = {
        ...compoundContext,
        pendingFormDecode: pendingDecodes + (rawValue === undefined ? 0 : 1) - index,
      };
      if (rawScalar === undefined || !unparseableUrlMightLeakSecret(rawScalar, true, context)) {
        return null;
      }
      if (compoundContext.maxDepth <= 0) {
        return REDACTED;
      }
      let scalar = rawScalar;
      let quotedLayers = 0;
      while (scalar.trimStart().startsWith('"')) {
        if (quotedLayers >= compoundContext.maxDepth) {
          return REDACTED;
        }
        try {
          const parsed: unknown = JSON.parse(scalar);
          if (typeof parsed !== 'string') {
            break;
          }
          scalar = parsed;
          quotedLayers++;
        } catch {
          break;
        }
      }
      if (quotedLayers >= compoundContext.maxDepth) {
        return REDACTED;
      }
      let sanitized = sanitizeUrlValueWithContext(scalar, {
        ...context,
        maxDepth: compoundContext.maxDepth - quotedLayers - 1,
      });
      if (sanitized === scalar) {
        return null;
      }
      for (let layer = 0; layer < quotedLayers; layer++) {
        sanitized = JSON.stringify(sanitized);
      }
      return sanitized;
    }
    if (isParsedQueryValue) {
      const scalar = getUrlPayloadScalar(decoded, compoundContext.maxDepth);
      if (scalar === null || compoundContext.maxDepth <= 0) {
        return REDACTED;
      }
      if (hasOnlyTemplateUserinfo(scalar)) {
        // Newly inspected query scalars retain unresolved authority references.
        // Continue checking literal query/hash credentials and logging paths.
        const context = { ...compoundContext, maxDepth: compoundContext.maxDepth - 1 };
        const sanitized = sanitizeTemplatedUrl(scalar, context, context, true);
        const guarded =
          isLoggingUrlPayload(context.guardUrlPayload) && hasOpaqueLoggingPath(sanitized, true)
            ? REDACTED
            : sanitized;
        return guarded === scalar ? null : guarded;
      }
    }
    const guarded =
      compoundContext.maxDepth <= 0
        ? REDACTED
        : recursiveSanitize(
            decoded,
            1,
            compoundContext.maxDepth,
            true,
            false,
            true,
            false,
            compoundContext.guardUrlPayload,
          );
    return guarded === decoded ? null : guarded;
  }
  return null;
}

// Matches one `{{ ... }}` Nunjucks placeholder. `[^{}]*` excludes braces so it
// cannot backtrack against the closing `}}` (linear, no ReDoS).
const NUNJUCKS_PLACEHOLDER = /\{\{[^{}]*\}\}/g;

// A value that is entirely Nunjucks placeholders (e.g. `{{password}}`) with no
// literal content is a config template, not a runtime secret. A value that merely
// CONTAINS a placeholder alongside literal text (e.g. `abc{{x}}def`) is not, so a
// secret-named key must still redact it.
function isPureTemplateValue(value: string): boolean {
  return value.includes('{{') && value.replace(NUNJUCKS_PLACEHOLDER, '').trim() === '';
}

function hasOnlyTemplateUserinfo(value: string): boolean {
  if (!value.includes('{{') || !value.includes('}}')) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      Boolean(parsed.username || parsed.password) &&
      [parsed.username, parsed.password].every(
        (part) => !part || isPureTemplateValue(decodeURIComponent(part)),
      )
    );
  } catch {
    return false;
  }
}

export function sanitizeUrlEncodedString(value: string): string {
  return sanitizeUrlEncodedStringWithContext(value);
}

function sanitizeUrlEncodedStringWithContext(
  value: string,
  compoundContext?: CompoundKeyContext,
): string {
  if (!value.includes('=')) {
    return value;
  }

  let changed = false;
  const result = value.replace(URL_ENCODED_PAIR_RE, (match, separator, rawKey, rawValue) => {
    if (rawValue.length === 0) {
      // Preserve empty values verbatim so `password=` doesn't masquerade as a
      // redacted secret.
      return match;
    }

    // Preserve pure Nunjucks placeholders (e.g. a provider body template
    // `password={{password}}`): these are config templates, not runtime secrets,
    // and this string flows through sanitizeObject into persisted provider
    // configs. Mirrors the template guard in sanitizeUrl. Checked before the
    // secret-key redaction so a templated secret field is kept, but a value that
    // only embeds a placeholder among literal text is not exempted.
    if (isPureTemplateValue(rawValue)) {
      return match;
    }

    // An undecodable key (stray `%` not forming %HH) only disables the key-NAME
    // match — the value-pattern checks below must still run, otherwise a malformed
    // key smuggles its secret value past redaction (e.g. `api%ZZkey=AKIA...`).
    const key = decodeFormComponent(rawKey);
    const decodedKey =
      compoundContext?.pendingFormDecode && key !== undefined
        ? decodePendingComponent(key, compoundContext.pendingFormDecode)
        : key;
    const decodedValue = decodeFormComponent(rawValue);
    const keyIsSecret =
      decodedKey !== undefined &&
      isSecretParameterWithContext(decodedKey, decodedValue, compoundContext);

    // A secret-named key redacts its ENTIRE value before any template skip or
    // nested-JSON recursion, so a partial-template value (`password=abc{{x}}def`)
    // or a JSON value (`password={"value":"plain"}`) can't leak a fragment.
    if (keyIsSecret) {
      changed = true;
      // `encodeURIComponent(REDACTED)` keeps the output a valid form-encoded
      // body; debug consumers that decode it see `[REDACTED]`.
      return `${separator}${rawKey}=${encodeURIComponent(REDACTED)}`;
    }

    // Recurse into JSON-shaped values so credentials buried in a
    // form-encoded JSON payload (e.g. `data=%7B%22password%22%3A...%7D`) get
    // redacted at the leaf rather than leaked as opaque bytes.
    const guardedValue = redactUrlPayloadValue(decodedValue, compoundContext, false, rawValue);
    if (guardedValue !== null) {
      if (guardedValue === decodedValue || guardedValue === rawValue) {
        return match;
      }
      changed = true;
      return `${separator}${rawKey}=${encodeURIComponent(guardedValue)}`;
    }

    // Check both raw and decoded forms of the value so `+` decoding can't be
    // used to escape pattern-based secret detection (e.g.
    // `key=AAAA+BBBB...` where the raw 64-char chunk matches but the
    // space-bearing decoded form doesn't).
    const valueLooksSecret =
      looksLikeSecret(rawValue) || (decodedValue !== undefined && looksLikeSecret(decodedValue));

    if (valueLooksSecret) {
      changed = true;
      return `${separator}${rawKey}=${encodeURIComponent(REDACTED)}`;
    }
    return match;
  });

  return changed ? result : value;
}

// Property names retain opaque public identifiers. Only the existing URL
// userinfo/parameter guards apply to keys in an already-decoded URL payload.
function hasUrlPayloadKeyCredential(key: string, compoundContext?: CompoundKeyContext): boolean {
  const scalar = getUrlPayloadScalar(key, compoundContext?.maxDepth ?? MAX_DEPTH);
  let guard = compoundContext?.guardUrlPayload;
  let containerName = false;
  if (scalar !== null && /^[\[{]/.test(scalar.trimStart())) {
    try {
      const parsed = JSON.parse(scalar);
      if (parsed !== null && typeof parsed === 'object') {
        // A valid container used as a property name is not a schemeless host.
        // Keep the existing explicit URL/form checks without traversing it.
        containerName = true;
        if (guard === 'host') {
          guard = 'logging';
        }
      }
    } catch {
      // Bracketed usernames and malformed names retain host authority checks.
    }
  }
  return (
    scalar === null ||
    hasUrlPayloadUserinfo(scalar, guard) ||
    hasSecretFormSegment(scalar, false, compoundContext) ||
    // Explicit encoded form/query payloads keep the same bounded value owner as
    // scalar URLs; arbitrary containers used as names remain opaque identifiers.
    (!containerName && sanitizeUrlEncodedStringWithContext(scalar, compoundContext) !== scalar)
  );
}

/**
 * Sanitize plain object fields
 */
function sanitizePlainObject(
  obj: any,
  depth: number,
  maxDepth: number,
  sanitizeUrls: boolean,
  isEnvMap: boolean,
  redactCompoundKeys: boolean,
  redactCredentialValues: boolean,
  guardUrlPayload: UrlPayloadGuard,
): any {
  const sanitized: any = {};
  let keySuffix = 0;
  const isSecretKey = isEnvMap ? isSecretEnvVarName : isSecretField;
  const compoundContext = redactCompoundKeys
    ? { maxDepth: maxDepth - depth - 1, guardUrlPayload }
    : undefined;
  for (const [rawKey, value] of Object.entries(obj)) {
    const isUrlKey = URL_REFERENCE.test(rawKey);
    const redactedKey =
      redactCredentialValues && matchesCredentialFormat(rawKey)
        ? REDACTED
        : sanitizeUrls && isUrlKey
          ? sanitizeUrlWithContext(rawKey, compoundContext)
          : guardUrlPayload && hasUrlPayloadKeyCredential(rawKey, compoundContext)
            ? REDACTED
            : rawKey;
    let key = redactedKey;
    while (
      Object.prototype.hasOwnProperty.call(sanitized, key) ||
      (key !== rawKey && Object.prototype.hasOwnProperty.call(obj, key))
    ) {
      key = `${redactedKey}#${++keySuffix}`;
    }
    const compoundKind =
      redactCompoundKeys && !isUrlKey ? getCompoundSecretObjectFieldKind(key, value) : undefined;
    if (isSecretKey(key) || compoundKind === 'credential') {
      sanitized[key] = REDACTED;
    } else if (
      (key.toLowerCase() === 'headers' ||
        (redactCompoundKeys &&
          normalizeFieldName(key) === 'authheaders' &&
          !Array.isArray(value))) &&
      value &&
      typeof value === 'object'
    ) {
      const headers: [string, unknown][] = [];
      const reservedNames = new Set(Object.keys(value));
      const usedNames = new Set<string>();
      for (const [name, item] of Object.entries(value)) {
        const redactedName =
          redactCredentialValues && matchesCredentialFormat(name)
            ? REDACTED
            : redactCompoundKeys && sanitizeUrls && URL_REFERENCE.test(name)
              ? sanitizeUrlWithContext(name, { maxDepth: maxDepth - depth - 2, guardUrlPayload })
              : guardUrlPayload && hasUrlPayloadKeyCredential(name, compoundContext)
                ? REDACTED
                : name;
        let headerName = redactedName;
        while (
          usedNames.has(headerName) ||
          (headerName !== name && reservedNames.has(headerName))
        ) {
          headerName = `${redactedName}#${++keySuffix}`;
        }
        usedNames.add(headerName);
        headers.push([
          headerName,
          !redactCredentialValues &&
          (isSafeTracingCredentialTemplate(item) ||
            (typeof item === 'string' &&
              !isTracingCredentialHeader(name, item) &&
              (isNonCredentialHeader(name) ||
                SAFE_TRACING_PROVIDER_HEADERS.has(name.toLowerCase()))))
            ? redactCompoundKeys && !isSafeTracingCredentialTemplate(item)
              ? recursiveSanitize(
                  item,
                  depth + 2,
                  maxDepth,
                  sanitizeUrls,
                  false,
                  true,
                  false,
                  guardUrlPayload,
                )
              : item
            : REDACTED,
        ]);
      }
      sanitized[key] = Object.fromEntries(headers);
    } else if (compoundKind === 'related' || redactCredentialValues) {
      sanitized[key] = recursiveSanitize(
        value,
        depth + 1,
        maxDepth,
        sanitizeUrls,
        key === 'env',
        redactCompoundKeys,
        // A direct numeric related field can be a count. Once inside a
        // credential collection, numeric entries can themselves be credentials.
        redactCredentialValues || typeof value !== 'number',
        guardUrlPayload,
      );
    } else if (
      typeof value === 'string' &&
      (key === 'apiHost' || (isEnvMap && key.toUpperCase().endsWith('_HOST')))
    ) {
      const scheme = /^[a-z][a-z\d+.-]*:\/\//i;
      const hasScheme = scheme.test(value);
      const normalizedHost = hasScheme ? value : `https://${value}`;
      // Whole JSON has a single bounded owner before host normalization. A
      // form-shaped value can also be a host with userinfo or a query/fragment;
      // retain that established URL interpretation instead of returning early.
      if (compoundContext) {
        const sanitizedJson = redactNestedJsonValue(
          value,
          { ...compoundContext, guardUrlPayload: 'host' },
          'original',
          true,
        );
        if (sanitizedJson !== null) {
          sanitized[key] = sanitizeUrlForLoggingWithContext(sanitizedJson, compoundContext, true);
          continue;
        }
        if (looksLikeUrlEncodedFormData(value)) {
          if (unparseableUrlMightLeakSecret(value, true, compoundContext)) {
            sanitized[key] = REDACTED;
            continue;
          }
          let hasHostComponents = hasUrlUserinfo(normalizedHost);
          try {
            const parsed = new URL(
              hasScheme ? value : `https://${hostUserinfoInspectionValue(value)}`,
            );
            hasHostComponents = Boolean(
              parsed.username || parsed.password || parsed.search || parsed.hash,
            );
          } catch {
            // The existing fallback guards still inspect malformed forms below.
          }
          if (!hasHostComponents) {
            sanitized[key] = sanitizeUrlForLoggingWithContext(
              value,
              compoundContext,
              false,
              true,
              'host',
            );
            continue;
          }
        }
      }
      if (compoundContext?.guardUrlPayload) {
        // Inspect scalar quoting/userinfo without recursively sanitizing URL
        // children here. The host/logging stage below owns their one traversal.
        const scalar = getUrlPayloadScalar(value, compoundContext.maxDepth);
        if (
          scalar === null ||
          hasUrlPayloadUserinfo(scalar, compoundContext?.guardUrlPayload) ||
          looksLikeSecret(scalar) ||
          unparseableUrlMightLeakSecret(
            scalar,
            !isLoggingUrlPayload(guardUrlPayload),
            compoundContext,
          ) ||
          (isLoggingUrlPayload(guardUrlPayload) && hasOpaqueLoggingPath(scalar, true))
        ) {
          sanitized[key] = REDACTED;
          continue;
        }
      }
      const endpoint = sanitizeUrlForLoggingWithContext(
        normalizedHost,
        compoundContext,
        false,
        false,
        'host',
      );
      const host = hasScheme ? endpoint : endpoint.replace(/^https:\/\//, '');
      const hasPath = value.replace(scheme, '').split(/[?#]/, 1)[0].includes('/');
      sanitized[key] = hasPath ? host : host.replace(/\/(?=[?#]|$)/, '');
    } else if (
      typeof value === 'string' &&
      (key === 'url' ||
        key === 'apiBaseUrl' ||
        key === 'server_url' ||
        (isEnvMap && key.toUpperCase().endsWith('_URL')))
    ) {
      sanitized[key] =
        key === 'url' ||
        (isEnvMap && key.toUpperCase().endsWith('_URL') && !/^OPENAI_(?:API_)?BASE_URL$/i.test(key))
          ? sanitizeUrlValueWithContext(value, compoundContext)
          : sanitizeUrlForLoggingWithContext(value, compoundContext);
    } else if (typeof value === 'string' && looksLikeSecret(value)) {
      // Redact opaque credential values before trying URL-specific handling.
      sanitized[key] = REDACTED;
    } else if (
      compoundContext &&
      typeof value === 'string' &&
      (key.toLowerCase() === 'url' ||
        (sanitizeUrls && /(?:url|uri|host|endpoint|proxy)$/i.test(key)))
    ) {
      // Own JSON/form traversal once for MCP URL fields. A generic recursive pass
      // followed by URL sanitization would revisit every nested payload. Direct
      // JSON strings keep the generic string path's canonical serialization.
      const sanitizedJson = redactNestedJsonValue(
        value,
        { ...compoundContext, guardUrlPayload: compoundContext.guardUrlPayload || true },
        'canonical',
        true,
      );
      sanitized[key] = sanitizeUrlValueWithContext(
        sanitizedJson ?? value,
        compoundContext,
        sanitizedJson !== null,
      );
    } else {
      // An `env` map is handed verbatim to a subprocess, so its keys are environment
      // variable names and get the broader credential-word match one level down.
      const sanitizedValue = recursiveSanitize(
        value,
        depth + 1,
        maxDepth,
        sanitizeUrls,
        key === 'env',
        redactCompoundKeys,
        false,
        guardUrlPayload,
      );
      sanitized[key] =
        typeof sanitizedValue === 'string' &&
        (key.toLowerCase() === 'url' ||
          (sanitizeUrls && /(?:url|uri|host|endpoint|proxy)$/i.test(key)))
          ? sanitizeUrlValueWithContext(sanitizedValue, compoundContext)
          : sanitizedValue;
    }
  }
  return sanitized;
}

/**
 * Recursively sanitize an object, redacting secret fields at any depth
 */
function recursiveSanitize(
  obj: any,
  depth = 0,
  maxDepth = MAX_DEPTH,
  sanitizeUrls = false,
  isEnvMap = false,
  redactCompoundKeys = false,
  redactCredentialValues = false,
  guardUrlPayload: UrlPayloadGuard = false,
): any {
  if (redactCredentialValues && (typeof obj === 'string' || typeof obj === 'number')) {
    return REDACTED;
  }
  if (typeof obj === 'function') {
    return `[Function] ${obj.name}`;
  }

  // Handle strings - check if they're JSON and sanitize if so
  if (typeof obj === 'string') {
    return sanitizeUrls && URL_REFERENCE.test(obj)
      ? sanitizeUrlValueWithContext(
          obj,
          redactCompoundKeys ? { maxDepth: maxDepth - depth, guardUrlPayload } : undefined,
        )
      : sanitizeJsonString(obj, depth, maxDepth, sanitizeUrls, redactCompoundKeys, guardUrlPayload);
  }

  // Handle primitives and null/undefined
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  // Enforce depth limit for objects and arrays
  if (depth > maxDepth) {
    return '[...]';
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      recursiveSanitize(
        item,
        depth + 1,
        maxDepth,
        sanitizeUrls,
        false,
        redactCompoundKeys,
        redactCredentialValues,
        guardUrlPayload,
      ),
    );
  }

  // Handle class instances
  if (isClassInstance(obj)) {
    const constructorName = obj.constructor?.name || 'Object';
    return `[${constructorName} Instance]`;
  }

  // Handle plain objects
  return sanitizePlainObject(
    obj,
    depth,
    maxDepth,
    sanitizeUrls,
    isEnvMap,
    redactCompoundKeys,
    redactCredentialValues,
    guardUrlPayload,
  );
}

/**
 * Generic function to sanitize any object by removing or redacting sensitive information
 * @param obj - The object to sanitize
 * @param options - Optional configuration
 * @returns A sanitized copy of the object with secrets redacted
 */
export function sanitizeObject(
  obj: any,
  options: {
    context?: string;
    throwOnError?: boolean;
    maxDepth?: number;
    // Config output and provider configs can carry credentials in any URL string or map key.
    sanitizeUrls?: boolean;
    // MCP tool data can use application-specific names such as databasePassword. Opt into
    // the URL parameter credential-name rules without changing ordinary object defaults.
    redactCompoundKeys?: boolean;
  } = {},
): any {
  return sanitizeObjectWithContext(obj, options);
}

function sanitizeObjectWithContext(
  obj: any,
  options: NonNullable<Parameters<typeof sanitizeObject>[1]>,
  guardUrlPayload: UrlPayloadGuard = false,
): any {
  const {
    context = 'object',
    throwOnError = false,
    maxDepth = MAX_DEPTH,
    sanitizeUrls = false,
    redactCompoundKeys = false,
  } = options;

  try {
    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle strings - check if they're JSON and sanitize if so
    if (typeof obj === 'string') {
      return recursiveSanitize(
        obj,
        0,
        maxDepth,
        sanitizeUrls,
        false,
        redactCompoundKeys,
        false,
        guardUrlPayload,
      );
    }

    // Handle other primitives
    if (typeof obj !== 'object') {
      return obj;
    }

    // Use safeStringify only to handle circular references
    // Custom replacer to handle Error objects which don't serialize properly
    // (Error objects have no enumerable properties, so JSON.stringify returns "{}")
    const safeObj = JSON.parse(
      safeStringify(
        obj,
        (_key, val) => {
          if (val instanceof Error) {
            return {
              name: val.name,
              message: val.message,
            };
          }
          return val;
        },
        undefined,
        {
          depthLimit: Number.MAX_SAFE_INTEGER,
          edgesLimit: Number.MAX_SAFE_INTEGER,
        },
      ),
    );

    // Apply recursive sanitization with depth limiting
    return recursiveSanitize(
      safeObj,
      0,
      maxDepth,
      sanitizeUrls,
      false,
      redactCompoundKeys,
      false,
      guardUrlPayload,
    );
  } catch (error) {
    if (throwOnError) {
      throw error;
    }

    // Can't use logger here as it would create circular dependency
    console.error(`Error sanitizing ${context}:`, error);

    return obj;
  }
}

// Legacy exports for backward compatibility
export const sanitizeBody = sanitizeObject;
export const sanitizeHeaders = sanitizeObject;
export const sanitizeQueryParams = sanitizeObject;

function getSecretLookingRawQueryKeys(search: string): Set<string> {
  const secretKeys = new Set<string>();

  for (const segment of search.slice(1).split('&')) {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const rawValue = segment.slice(separatorIndex + 1);
    if (!looksLikeSecret(rawValue)) {
      continue;
    }

    const rawKey = segment.slice(0, separatorIndex);
    const decodedKey = decodeFormComponent(rawKey);
    if (decodedKey !== undefined) {
      secretKeys.add(decodedKey);
    }
  }

  return secretKeys;
}

function sanitizeTemplatedUrl(
  url: string,
  compoundContext?: CompoundKeyContext,
  payloadContext?: CompoundKeyContext,
  preserveTemplateUserinfo = false,
): string {
  // A template may coexist with an already-rendered env credential. Avoid URL
  // parsing here because it encodes the remaining Nunjucks syntax, but still
  // scrub literal query and fragment credentials before the value is logged or
  // persisted.
  if (
    !preserveTemplateUserinfo &&
    (compoundContext?.guardUrlPayload
      ? hasUrlPayloadUserinfo(url, compoundContext.guardUrlPayload)
      : hasUrlUserinfo(url))
  ) {
    return REDACTED;
  }

  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex + 1);
  const queryIndex = beforeHash.indexOf('?');
  const beforeQuery = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1);
  if (
    compoundContext?.guardUrlPayload &&
    hasSecretFormSegment(
      beforeQuery,
      !isLoggingUrlPayload(compoundContext.guardUrlPayload),
      compoundContext,
    )
  ) {
    return REDACTED;
  }
  const sanitizedQuery = query ? sanitizeUrlEncodedStringWithContext(query, payloadContext) : query;
  const sanitizedHash = hash ? sanitizeUrlEncodedStringWithContext(hash, payloadContext) : hash;

  return `${beforeQuery}${queryIndex === -1 ? '' : `?${sanitizedQuery}`}${hashIndex === -1 ? '' : `#${sanitizedHash}`}`;
}

export function sanitizeUrl(url: string): string {
  return sanitizeUrlWithContext(url);
}

// Decoded scalar values retain the enclosing logging policy. Property names
// use the structural URL guard directly so opaque public identifiers survive.
function sanitizeUrlValueWithContext(
  url: string,
  compoundContext?: CompoundKeyContext,
  jsonAlreadySanitized = false,
): string {
  return isLoggingUrlPayload(compoundContext?.guardUrlPayload)
    ? sanitizeUrlForLoggingWithContext(url, compoundContext, jsonAlreadySanitized)
    : sanitizeUrlWithContext(url, compoundContext, jsonAlreadySanitized);
}

function sanitizeUrlWithContext(
  url: string,
  compoundContext?: CompoundKeyContext,
  jsonAlreadySanitized = false,
  decodedPayloadGuard?: UrlPayloadGuard,
): string {
  try {
    // Ensure url is a string and handle edge cases
    if (typeof url !== 'string' || !url.trim()) {
      return url;
    }

    if (compoundContext && jsonAlreadySanitized) {
      return url;
    }

    // The enclosing logging role governs decoded children without changing the
    // established policy for the outer URL's own userinfo or pure placeholders.
    const payloadContext = compoundContext
      ? {
          ...compoundContext,
          guardUrlPayload: decodedPayloadGuard ?? (compoundContext.guardUrlPayload || true),
        }
      : undefined;

    // Exact URL fields reach this helper without the suffix-field JSON pass.
    // Own whole JSON before template handling, then retain the remaining URL
    // guards without recursively decoding that same payload a second time.
    if (compoundContext && !jsonAlreadySanitized) {
      const nestedJson = redactNestedJsonValue(url, payloadContext, 'original', true);
      if (nestedJson !== null) {
        return nestedJson;
      }
    }

    // URL-named MCP fields can still contain a form payload. Reuse the same
    // bounded decoded-JSON policy rather than losing it in the URL fast path.
    if (compoundContext && looksLikeUrlEncodedFormData(url)) {
      // Form values can contain an embedded URL. Keep the existing URL fallback
      // guard for its userinfo/query/fragment before taking the form-only path.
      return unparseableUrlMightLeakSecret(url, true, compoundContext)
        ? REDACTED
        : sanitizeUrlEncodedStringWithContext(url, payloadContext);
    }

    // Preserve unresolved template syntax while redacting any literal credentials
    // that were already rendered into another part of the same URL.
    if (url.includes('{{') && url.includes('}}')) {
      return sanitizeTemplatedUrl(url, compoundContext, payloadContext);
    }

    const nestedJson = jsonAlreadySanitized ? null : redactNestedJsonValue(url, compoundContext);
    if (nestedJson !== null) {
      return nestedJson;
    }

    // Handle path-only URLs (e.g., /api/openai/completion from raw HTTP request mode).
    // new URL() requires a fully qualified URL, so prepend a dummy base for parsing.
    const isPathOnly = url.startsWith('/') && !url.startsWith('//');
    const parsedUrl = isPathOnly ? new URL(url, DUMMY_BASE) : new URL(url);

    // Opaque URI paths (for example JDBC connection strings) can carry the
    // same form/userinfo credentials as an unparseable URL. Check before query
    // changes, since a changed query must not hide an unchanged private path.
    if (
      compoundContext?.guardUrlPayload &&
      (hasUrlPayloadUserinfo(url, compoundContext.guardUrlPayload) ||
        hasUrlPayloadUserinfo(parsedUrl.pathname) ||
        // URL.host decodes escapes. Inspect raw separators and retain its value-decode
        // context so encoded public labels, templates, and boolean controls survive.
        (parsedUrl.host &&
          hasSecretFormSegment(
            url
              .trim()
              .replace(/[\t\r\n]/g, '')
              .replace(/^[a-z][a-z\d+.-]*:[\\/]*/i, '')
              .split(/[\\/?#]/, 1)[0],
            true,
            { ...compoundContext, pendingFormDecode: (compoundContext.pendingFormDecode ?? 0) + 1 },
          )) ||
        hasSecretFormSegment(parsedUrl.pathname, false, compoundContext))
    ) {
      return REDACTED;
    }

    // Create a copy for sanitization to avoid modifying the original URL
    // Use href instead of toString() for better cross-platform compatibility
    const sanitizedUrl = new URL(parsedUrl.href);

    if (sanitizedUrl.username || sanitizedUrl.password) {
      sanitizedUrl.username = '***';
      sanitizedUrl.password = '***';
    }

    // Sanitize query parameters that might contain sensitive data
    const rawSecretParamKeys = getSecretLookingRawQueryKeys(parsedUrl.search);

    const rawQueryValues = payloadContext?.guardUrlPayload
      ? url
          .replace(/[\t\r\n]/g, '')
          .split('#', 1)[0]
          .split('?')
          .slice(1)
          .join('?')
          .split('&')
          .filter(Boolean)
          .map((part) => {
            const equals = part.indexOf('=');
            return equals < 0 ? '' : part.slice(equals + 1);
          })
      : [];
    try {
      for (const [index, [key, value]] of Array.from(
        sanitizedUrl.searchParams.entries(),
      ).entries()) {
        const rawValue = rawQueryValues[index];
        const inspectedKey = payloadContext?.pendingFormDecode
          ? (decodePendingComponent(key, payloadContext.pendingFormDecode, decodeQueryComponent) ??
            key)
          : key;
        if (
          isSecretParameterWithContext(inspectedKey, value, compoundContext) ||
          rawSecretParamKeys.has(key) ||
          looksLikeSecret(value) ||
          // URLSearchParams only splits on `&`, so a `;`-delimited credential
          // (`data=ok;api_key=sk-...`, legacy but still accepted by some stacks)
          // hides inside one value. Redact the whole value when it conceals one.
          (value.includes(';') && hasSecretFormSegment(value, false, compoundContext))
        ) {
          sanitizedUrl.searchParams.set(key, '[REDACTED]');
        } else {
          const nestedJson = redactUrlPayloadValue(value, payloadContext, true, rawValue);
          if (nestedJson !== null && nestedJson !== value && nestedJson !== rawValue) {
            sanitizedUrl.searchParams.set(key, nestedJson);
          }
        }
      }
    } catch (paramError) {
      // Can't use logger here as it would create a circular dependency.
      if (!compoundContext) {
        console.warn(`Failed to sanitize URL parameters: ${paramError}`);
      }
      return REDACTED;
    }

    // Redact credentials carried in the fragment too (e.g. the OAuth implicit-flow
    // shape `#access_token=...`). The hash is a `key=value(&...)` string after the
    // leading `#`, so reuse the same form-pair scrubbing as the query.
    if (sanitizedUrl.hash.length > 1) {
      const sanitizedHash = sanitizeUrlEncodedStringWithContext(
        payloadContext?.guardUrlPayload && url.includes('#')
          ? url.slice(url.indexOf('#') + 1).replace(/[\t\r\n]/g, '')
          : sanitizedUrl.hash.slice(1),
        payloadContext,
      );
      sanitizedUrl.hash = sanitizedHash ? `#${sanitizedHash}` : '';
    }

    // Preserve spelling, encoding, and trailing slashes when no credential changed.
    if (sanitizedUrl.href === parsedUrl.href) {
      return url;
    }

    // For path-only URLs, return just the path (+ search + hash), not the dummy base
    if (isPathOnly) {
      return sanitizedUrl.pathname + sanitizedUrl.search + sanitizedUrl.hash;
    }

    return sanitizedUrl.toString();
  } catch {
    // Fail closed only when the unparseable value plausibly carries a credential.
    // sanitizeObject runs this on any field literally named `url`, so blanket
    // redaction would destroy non-secret bare domains, relative paths, and prose
    // in persisted eval results and user-facing config error messages.
    if (unparseableUrlMightLeakSecret(url, false, compoundContext)) {
      return REDACTED;
    }
    // Decoded relative URL values still need their query/fragment payloads inspected.
    return compoundContext?.guardUrlPayload
      ? sanitizeTemplatedUrl(url, compoundContext, compoundContext)
      : url;
  }
}

/**
 * Sanitize a URL specifically for diagnostic output. Opaque path segments can be
 * legitimate resource IDs in persisted provider results, so only logging paths
 * use this stricter redaction.
 */
export function sanitizeUrlForLogging(url: string): string {
  return sanitizeUrlForLoggingWithContext(url);
}

function sanitizeUrlForLoggingWithContext(
  url: string,
  compoundContext?: CompoundKeyContext,
  jsonAlreadySanitized = false,
  preserveFormTemplates = false,
  decodedPayloadGuard: UrlPayloadGuard = 'logging',
): string {
  const payloadGuard = compoundContext?.guardUrlPayload === 'host' ? 'host' : decodedPayloadGuard;
  if (compoundContext) {
    const nestedJson = jsonAlreadySanitized
      ? url
      : redactNestedJsonValue(
          url,
          { ...compoundContext, guardUrlPayload: payloadGuard },
          'original',
          true,
        );
    if (nestedJson !== null) {
      return hasOpaqueLoggingPath(url, true) ? REDACTED : nestedJson;
    }
  }
  const sanitized = sanitizeUrlWithContext(
    url,
    compoundContext,
    jsonAlreadySanitized,
    payloadGuard,
  );
  try {
    const isPathOnly = sanitized.startsWith('/') && !sanitized.startsWith('//');
    const parsed = isPathOnly ? new URL(sanitized, DUMMY_BASE) : new URL(sanitized);
    const sanitizedPathname = parsed.pathname
      .split('/')
      .map((segment, index, segments) =>
        isLoggingCredentialPathSegment(segment, segments[index - 1] ?? '')
          ? '%5BREDACTED%5D'
          : segment,
      )
      .join('/');
    if (sanitizedPathname === parsed.pathname) {
      return sanitized;
    }
    parsed.pathname = sanitizedPathname;
    return isPathOnly ? parsed.pathname + parsed.search + parsed.hash : parsed.toString();
  } catch {
    return unparseableUrlMightLeakSecret(url, preserveFormTemplates, compoundContext) ||
      hasOpaqueLoggingPath(url, Boolean(compoundContext))
      ? REDACTED
      : sanitized;
  }
}

function isLoggingCredentialPathSegment(segment: string, previousSegment: string): boolean {
  const previous = decodeFormComponent(previousSegment) ?? '';
  try {
    const decoded = decodeURIComponent(segment);
    // Credential routes can also contain ordinary words such as /auth/proxy.
    const opaqueValue =
      isSecretField(previous) &&
      /^[a-z0-9._~+-]{12,}$/i.test(decoded) &&
      /[a-z]/i.test(decoded) &&
      /[0-9]/.test(decoded);
    return opaqueValue || OPAQUE_CREDENTIAL_PATH_SEGMENT.test(decoded) || looksLikeSecret(decoded);
  } catch {
    return isSecretField(previous);
  }
}

function hasOpaqueLoggingPath(url: string, completePathChecks = false): boolean {
  return url
    .split(/[/?#]/)
    .some((segment, index, segments) =>
      completePathChecks
        ? isLoggingCredentialPathSegment(segment, segments[index - 1] ?? '')
        : OPAQUE_CREDENTIAL_PATH_SEGMENT.test(decodeFormComponent(segment) ?? segment),
    );
}
