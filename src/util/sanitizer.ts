/**
 * Generic utility functions for sanitizing objects to prevent logging of secrets and credentials
 * Uses a custom recursive approach for reliable deep object sanitization.
 */
import deepEqual from 'fast-deep-equal';
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
 * Normalize field names for comparison (lowercase, no hyphens/underscores)
 */
export function normalizeFieldName(fieldName: string): string {
  return fieldName.toLowerCase().replace(/[-_]/g, '');
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

  // Long base64-like strings (likely tokens/keys) - 64+ chars of alphanumeric
  // Using 64 chars to reduce false positives on concatenated IDs, base64 content, or long model names
  if (/^[a-zA-Z0-9+/=_-]{64,}$/.test(value)) {
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
  tokensByRedactedUri = new Map<string, string | null>(),
): Map<string, string | null> {
  if (typeof value === 'string') {
    const redacted = redactAzureBlobSasToken(value);
    if (redacted !== value) {
      const storedValue = tokensByRedactedUri.get(redacted);
      if (storedValue === undefined) {
        tokensByRedactedUri.set(redacted, value);
      } else if (storedValue !== value) {
        // Two stored secrets collapse to the same redacted URI. Leave future
        // submissions redacted rather than guessing which credential to reuse.
        tokensByRedactedUri.set(redacted, null);
      }
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
  tokensByRedactedUri: ReadonlyMap<string, string | null>,
): RestoreResult<T> {
  if (typeof value === 'string') {
    const storedValue = tokensByRedactedUri.get(value);
    return storedValue == null
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

type StoredArrayItemMatch = { matched: true; index: number; value: unknown } | { matched: false };

function findUniqueStoredArrayItemMatch(
  value: unknown,
  storedItems: readonly unknown[],
): StoredArrayItemMatch {
  let matchedValue: unknown;
  let matchedIndex = -1;
  let matched = false;
  for (const [index, storedItem] of storedItems.entries()) {
    if (!deepEqual(value, redactAzureBlobSasTokens(storedItem))) {
      continue;
    }
    if (matched) {
      return { matched: false };
    }
    matched = true;
    matchedIndex = index;
    matchedValue = storedItem;
  }

  return matched ? { matched: true, index: matchedIndex, value: matchedValue } : { matched: false };
}

// Credential restoration must not use mutable flags or arbitrary metadata to choose a stored item.
const STABLE_ARRAY_ITEM_IDENTITY_KEYS = new Set(['id', 'key', 'name', 'slug', 'suite']);

function isStableArrayItemIdentityKey(key: string): boolean {
  return STABLE_ARRAY_ITEM_IDENTITY_KEYS.has(key) || /(?:^|[_-])id$/i.test(key) || /Id$/.test(key);
}

function hasUniqueSharedStableArrayItemIdentity(
  value: unknown,
  storedValue: unknown,
  storedItems: readonly unknown[],
): boolean {
  if (
    !value ||
    !storedValue ||
    typeof value !== 'object' ||
    typeof storedValue !== 'object' ||
    Array.isArray(value) ||
    Array.isArray(storedValue) ||
    isClassInstance(value) ||
    isClassInstance(storedValue)
  ) {
    return false;
  }

  const storedObject = storedValue as Record<string, unknown>;
  return Object.entries(value).some(([key, item]) => {
    if (
      !isStableArrayItemIdentityKey(key) ||
      (typeof item !== 'string' && typeof item !== 'number') ||
      !Object.is(item, storedObject[key]) ||
      (typeof item === 'string' && item !== redactAzureBlobSasToken(item))
    ) {
      return false;
    }

    return (
      storedItems.filter(
        (storedItem) =>
          storedItem !== null &&
          typeof storedItem === 'object' &&
          !Array.isArray(storedItem) &&
          !isClassInstance(storedItem) &&
          Object.is((storedItem as Record<string, unknown>)[key], item),
      ).length === 1
    );
  });
}

function findUniqueStoredArrayItemIdentityMatch(
  value: unknown,
  storedItems: readonly unknown[],
): StoredArrayItemMatch {
  let matchedValue: unknown;
  let matchedIndex = -1;
  let matched = false;
  for (const [index, storedItem] of storedItems.entries()) {
    if (!hasUniqueSharedStableArrayItemIdentity(value, storedItem, storedItems)) {
      continue;
    }
    if (matched) {
      return { matched: false };
    }
    matched = true;
    matchedIndex = index;
    matchedValue = storedItem;
  }

  return matched ? { matched: true, index: matchedIndex, value: matchedValue } : { matched: false };
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
    const hasSameLength = value.length === storedItems.length;
    const structuralMatches = value.map((item) =>
      findUniqueStoredArrayItemMatch(item, storedItems),
    );
    const identityMatches = value.map((item, index) =>
      structuralMatches[index].matched
        ? ({ matched: false } as const)
        : findUniqueStoredArrayItemIdentityMatch(item, storedItems),
    );
    const matchedStoredIndexes = new Set(
      [...structuralMatches, ...identityMatches].flatMap((match) =>
        match.matched ? [match.index] : [],
      ),
    );
    let restored = false;
    const restoredItems = value.map((item, index) => {
      // Prefer unique structural identity for moved items. Preserve same-index
      // SAS tokens only when the visible item is unchanged or uniquely identifies
      // the stored item. Finally, fall back to unambiguous URI identity.
      const structuralMatch = structuralMatches[index];
      const identityMatch = identityMatches[index];
      const storedItem = storedItems[index];
      const canRestorePositionally =
        storedItem !== undefined &&
        hasSameLength &&
        !matchedStoredIndexes.has(index) &&
        deepEqual(item, redactAzureBlobSasTokens(storedItem));
      const preferredMatch = structuralMatch.matched ? structuralMatch : identityMatch;
      const storedItemMatch =
        preferredMatch.matched || !canRestorePositionally
          ? preferredMatch
          : { matched: true as const, index, value: storedItem };
      const structuralResult = storedItemMatch.matched
        ? restoreAzureBlobSasTokensWithResult(item, storedItemMatch.value)
        : { value: item, restored: false };
      const mappedResult = restoreAzureBlobSasTokensFromMap(
        structuralResult.value,
        storedTokensByRedactedUri,
      );
      restored ||= structuralResult.restored || mappedResult.restored;
      return mappedResult.value;
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
    // Not JSON - check if it looks like a secret
    if (looksLikeSecret(str)) {
      return REDACTED;
    }
  }
  return str;
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
      for (const key of Array.from(sanitizedUrl.searchParams.keys())) {
        if (sensitiveParams.test(key)) {
          sanitizedUrl.searchParams.set(key, '[REDACTED]');
        }
      }
    } catch (paramError) {
      // If search params handling fails, continue without sanitizing them
      // using console since logger would create a circular dependency
      console.warn(`Failed to sanitize URL parameters ${url}: ${paramError}`);
    }

    // For path-only URLs, return just the path (+ search + hash), not the dummy base
    if (isPathOnly) {
      return sanitizedUrl.pathname + sanitizedUrl.search + sanitizedUrl.hash;
    }

    return sanitizedUrl.toString();
  } catch (error) {
    console.warn(`Failed to sanitize URL ${url}: ${error}`);
    return url;
  }
}
