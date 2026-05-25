/**
 * Generic utility functions for sanitizing objects to prevent logging of secrets and credentials
 * Uses a custom recursive approach for reliable deep object sanitization.
 */

import safeStringify from 'fast-safe-stringify';

const MAX_DEPTH = 4;
const DUMMY_BASE = 'http://placeholder';

export const REDACTED = '[REDACTED]';

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

function looksLikeCredentialValue(value: string): boolean {
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

  return false;
}

/**
 * Check if a value looks like a secret based on common patterns.
 * Detects API keys, tokens, and other credential patterns.
 */
export function looksLikeSecret(value: string): boolean {
  if (looksLikeCredentialValue(value)) {
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

/**
 * Parse and sanitize JSON strings, also check if the string looks like a secret
 */
function sanitizeJsonString(str: string, depth: number, maxDepth: number): string {
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
  // Form-urlencoded data has no raw whitespace (spaces are `+` or `%20`) and
  // every non-empty separator-delimited chunk is a `key=value` pair with safe
  // key characters. Empty chunks (leading/trailing/consecutive separators)
  // are tolerated. Without this gate, prose containing `=` gets re-serialized
  // and emerges URL-encoded.
  if (!value.includes('=') || /\s/.test(value)) {
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

    const decodedKey = decodeFormComponent(rawKey);
    if (decodedKey === undefined) {
      return match;
    }
    const decodedValue = decodeFormComponent(rawValue);

    // Check both raw and decoded forms of the value so `+` decoding can't be
    // used to escape pattern-based secret detection (e.g.
    // `key=AAAA+BBBB...` where the raw 64-char chunk matches but the
    // space-bearing decoded form doesn't).
    const valueLooksSecret =
      looksLikeSecret(rawValue) || (decodedValue !== undefined && looksLikeSecret(decodedValue));

    // Split nested-key syntax (`user[password]`, `a.b.password`) into parts so
    // we can match the leaf name against SECRET_FIELD_NAMES.
    const keyParts = decodedKey.split(/[.\[\]]+/).filter(Boolean);
    const keyIsSecret = keyParts.length > 0 && keyParts.some(isSecretField);

    if (keyIsSecret || valueLooksSecret) {
      changed = true;
      // `encodeURIComponent(REDACTED)` keeps the output a valid form-encoded
      // body; debug consumers that decode it see `[REDACTED]`.
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
    const sensitiveParams =
      /(api[_-]?key|token|password|secret|signature|sig|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|authorization)/i;

    try {
      for (const [key, value] of Array.from(sanitizedUrl.searchParams.entries())) {
        if (sensitiveParams.test(key) || looksLikeCredentialValue(value)) {
          sanitizedUrl.searchParams.set(key, '[REDACTED]');
        }
      }
    } catch (paramError) {
      // Can't use logger here as it would create a circular dependency.
      console.warn(`Failed to sanitize URL parameters: ${paramError}`);
      return REDACTED;
    }

    // For path-only URLs, return just the path (+ search + hash), not the dummy base
    if (isPathOnly) {
      return sanitizedUrl.pathname + sanitizedUrl.search + sanitizedUrl.hash;
    }

    return sanitizedUrl.toString();
  } catch (error) {
    // Can't use logger here as it would create a circular dependency.
    console.warn(`Failed to sanitize URL: ${error}`);
    return REDACTED;
  }
}
