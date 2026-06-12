/**
 * Generic utility functions for sanitizing objects to prevent logging of secrets and credentials
 * Uses a custom recursive approach for reliable deep object sanitization.
 */
import safeStringify from 'fast-safe-stringify';

const MAX_DEPTH = 4;
const DUMMY_BASE = 'http://placeholder';

export const REDACTED = '[REDACTED]';

// Query-parameter names that imply a credential value. Shared by sanitizeUrl's
// per-param redaction and the fail-closed decision for unparseable URLs.
const SENSITIVE_URL_PARAM_NAMES =
  /(api[_-]?key|token|password|secret|signature|sig|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|authorization)/i;

/**
 * Whether a `scheme://user:pass@host` userinfo password is present. Implemented
 * with plain string scans rather than a regex to avoid polynomial backtracking
 * on adversarial input (e.g. `://:::::…`).
 */
function hasUrlUserinfoPassword(url: string): boolean {
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
  return atIndex !== -1 && authority.slice(0, atIndex).includes(':');
}

/**
 * Whether any `key=value` segment carries a credential — by a secret-looking
 * value or a secret-named key. Splits on every URL pair delimiter (`? & ; #`),
 * so it catches credentials the WHATWG URL parser does not isolate: values under
 * a benign name in a malformed URL, and `;`-separated query pairs (URLSearchParams
 * only splits on `&`). Linear: a single split plus per-segment substring checks.
 */
function hasSecretFormSegment(text: string): boolean {
  for (const segment of text.split(/[?&;#]/)) {
    const equalsIndex = segment.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const rawValue = segment.slice(equalsIndex + 1);
    if (!rawValue) {
      continue;
    }
    const decodedValue = decodeFormComponent(rawValue);
    if (
      looksLikeSecret(rawValue) ||
      (decodedValue !== undefined && looksLikeSecret(decodedValue))
    ) {
      return true;
    }
    const decodedKey = decodeFormComponent(segment.slice(0, equalsIndex));
    const keyParts = decodedKey === undefined ? [] : decodedKey.split(/[.\[\]]+/).filter(Boolean);
    if (keyParts.some(isSecretField)) {
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
 */
function unparseableUrlMightLeakSecret(url: string): boolean {
  return (
    SENSITIVE_URL_PARAM_NAMES.test(url) ||
    hasUrlUserinfoPassword(url) ||
    looksLikeSecret(url.trim()) ||
    hasSecretFormSegment(url)
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
 * Sanitizes runtime options to ensure only JSON-serializable data is persisted or exported.
 * Removes non-serializable fields like AbortSignal, functions, and symbols.
 */
export function sanitizeRuntimeOptions(
  options?: Partial<import('../types').EvaluateOptions>,
): Partial<import('../types').EvaluateOptions> | undefined {
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

/**
 * Check if a value looks like a secret based on common patterns.
 * Detects API keys, tokens, and other credential patterns.
 */
export function looksLikeSecret(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }

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

  // Long base64-like strings (likely tokens/keys) - 64+ chars of alphanumeric
  // Using 64 chars to reduce false positives on concatenated IDs, base64 content, or long model names
  if (/^[a-zA-Z0-9+/=_-]{64,}$/.test(value)) {
    return true;
  }

  return false;
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
function sanitizeJsonString(str: string, depth: number, maxDepth: number): string {
  const redactedAzureBlobUri = redactAzureBlobSasToken(str);
  if (redactedAzureBlobUri !== str) {
    return redactedAzureBlobUri;
  }

  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      const sanitized = recursiveSanitize(parsed, depth, maxDepth);
      return JSON.stringify(sanitized);
    }
  } catch {
    if (looksLikeUrlEncodedFormData(str)) {
      const sanitizedUrlEncoded = sanitizeUrlEncodedString(str);
      if (sanitizedUrlEncoded !== str) {
        return sanitizedUrlEncoded;
      }
    }

    // Not JSON - check if it looks like a secret
    if (looksLikeSecret(str)) {
      return REDACTED;
    }
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
 * original byte-for-byte).
 */
function redactNestedJsonValue(decoded: string | undefined): string | null {
  if (decoded === undefined) {
    return null;
  }
  const trimmed = decoded.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const sanitized = sanitizeObject(parsed);
  const originalSerialized = JSON.stringify(parsed);
  const sanitizedSerialized = JSON.stringify(sanitized);
  return sanitizedSerialized === originalSerialized ? null : sanitizedSerialized;
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

export function sanitizeUrlEncodedString(value: string): string {
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
    const decodedKey = decodeFormComponent(rawKey);
    // Split nested-key syntax (`user[password]`, `a.b.password`) into parts so we
    // can match the leaf name against SECRET_FIELD_NAMES.
    const keyParts = decodedKey === undefined ? [] : decodedKey.split(/[.\[\]]+/).filter(Boolean);
    const keyIsSecret = keyParts.some(isSecretField);

    // A secret-named key redacts its ENTIRE value before any template skip or
    // nested-JSON recursion, so a partial-template value (`password=abc{{x}}def`)
    // or a JSON value (`password={"value":"plain"}`) can't leak a fragment.
    if (keyIsSecret) {
      changed = true;
      // `encodeURIComponent(REDACTED)` keeps the output a valid form-encoded
      // body; debug consumers that decode it see `[REDACTED]`.
      return `${separator}${rawKey}=${encodeURIComponent(REDACTED)}`;
    }

    const decodedValue = decodeFormComponent(rawValue);

    // Recurse into JSON-shaped values so credentials buried in a
    // form-encoded JSON payload (e.g. `data=%7B%22password%22%3A...%7D`) get
    // redacted at the leaf rather than leaked as opaque bytes.
    const nestedJson = redactNestedJsonValue(decodedValue);
    if (nestedJson !== null) {
      changed = true;
      return `${separator}${rawKey}=${encodeURIComponent(nestedJson)}`;
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

/**
 * Sanitize plain object fields
 */
function sanitizePlainObject(obj: any, depth: number, maxDepth: number): any {
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'url' && typeof value === 'string') {
      sanitized[key] = sanitizeUrl(value);
    } else if (isSecretField(key)) {
      sanitized[key] = REDACTED;
    } else if (typeof value === 'string' && looksLikeSecret(value)) {
      // Redact values that look like secrets (API keys, tokens, etc.)
      sanitized[key] = REDACTED;
    } else {
      sanitized[key] = recursiveSanitize(value, depth + 1, maxDepth);
    }
  }
  return sanitized;
}

/**
 * Recursively sanitize an object, redacting secret fields at any depth
 */
function recursiveSanitize(obj: any, depth = 0, maxDepth = MAX_DEPTH): any {
  if (typeof obj === 'function') {
    return `[Function] ${obj.name}`;
  }

  // Handle strings - check if they're JSON and sanitize if so
  if (typeof obj === 'string') {
    return sanitizeJsonString(obj, depth, maxDepth);
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
    return obj.map((item) => recursiveSanitize(item, depth + 1, maxDepth));
  }

  // Handle class instances
  if (isClassInstance(obj)) {
    const constructorName = obj.constructor?.name || 'Object';
    return `[${constructorName} Instance]`;
  }

  // Handle plain objects
  return sanitizePlainObject(obj, depth, maxDepth);
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
  } = {},
): any {
  const { context = 'object', throwOnError = false, maxDepth = MAX_DEPTH } = options;

  try {
    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle strings - check if they're JSON and sanitize if so
    if (typeof obj === 'string') {
      return sanitizeJsonString(obj, 0, maxDepth);
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
    return recursiveSanitize(safeObj, 0, maxDepth);
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

export function sanitizeUrl(url: string): string {
  try {
    // Ensure url is a string and handle edge cases
    if (typeof url !== 'string' || !url.trim()) {
      return url;
    }

    // Check if URL contains template variables (e.g., {{ variable }})
    // These are configuration templates, not runtime secrets, so skip sanitization entirely.
    //
    // Important trade-off: URLs with both templates AND real sensitive params
    // (e.g., "https://example.com/{{ path }}?api_key=secret") will NOT be sanitized.
    // This is acceptable because:
    // 1. Template URLs come from config files (version-controlled, not runtime)
    // 2. Secrets should be in environment variables, not hardcoded in config
    // 3. Attempting to parse/sanitize would URL-encode template syntax ({{ → %7B%7B),
    //    breaking Nunjucks rendering
    // 4. When templates render to real URLs at runtime, those URLs get sanitized normally
    //
    // Use simple string check instead of regex to avoid ReDoS vulnerability
    if (url.includes('{{') && url.includes('}}')) {
      return url;
    }

    // Handle path-only URLs (e.g., /api/openai/completion from raw HTTP request mode).
    // new URL() requires a fully qualified URL, so prepend a dummy base for parsing.
    const isPathOnly = url.startsWith('/') && !url.startsWith('//');
    const parsedUrl = isPathOnly ? new URL(url, DUMMY_BASE) : new URL(url);

    // Create a copy for sanitization to avoid modifying the original URL
    // Use href instead of toString() for better cross-platform compatibility
    const sanitizedUrl = new URL(parsedUrl.href);

    if (sanitizedUrl.username || sanitizedUrl.password) {
      sanitizedUrl.username = '***';
      sanitizedUrl.password = '***';
    }

    // Sanitize query parameters that might contain sensitive data
    const rawSecretParamKeys = getSecretLookingRawQueryKeys(parsedUrl.search);

    try {
      for (const [key, value] of Array.from(sanitizedUrl.searchParams.entries())) {
        if (
          SENSITIVE_URL_PARAM_NAMES.test(key) ||
          rawSecretParamKeys.has(key) ||
          looksLikeSecret(value) ||
          // URLSearchParams only splits on `&`, so a `;`-delimited credential
          // (`data=ok;api_key=sk-...`, legacy but still accepted by some stacks)
          // hides inside one value. Redact the whole value when it conceals one.
          (value.includes(';') && hasSecretFormSegment(value))
        ) {
          sanitizedUrl.searchParams.set(key, '[REDACTED]');
        }
      }
    } catch (paramError) {
      // Can't use logger here as it would create a circular dependency.
      console.warn(`Failed to sanitize URL parameters: ${paramError}`);
      return REDACTED;
    }

    // Redact credentials carried in the fragment too (e.g. the OAuth implicit-flow
    // shape `#access_token=...`). The hash is a `key=value(&...)` string after the
    // leading `#`, so reuse the same form-pair scrubbing as the query.
    if (sanitizedUrl.hash.length > 1) {
      const sanitizedHash = sanitizeUrlEncodedString(sanitizedUrl.hash.slice(1));
      sanitizedUrl.hash = sanitizedHash ? `#${sanitizedHash}` : '';
    }

    // For path-only URLs, return just the path (+ search + hash), not the dummy base
    if (isPathOnly) {
      return sanitizedUrl.pathname + sanitizedUrl.search + sanitizedUrl.hash;
    }

    return sanitizedUrl.toString();
  } catch (error) {
    // Can't use logger here as it would create a circular dependency.
    console.warn(`Failed to sanitize URL: ${error}`);
    // Fail closed only when the unparseable value plausibly carries a credential.
    // sanitizeObject runs this on any field literally named `url`, so blanket
    // redaction would destroy non-secret bare domains, relative paths, and prose
    // in persisted eval results and user-facing config error messages.
    return unparseableUrlMightLeakSecret(url) ? REDACTED : url;
  }
}
