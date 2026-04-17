/**
 * Generic utility functions for sanitizing objects to prevent logging of secrets and credentials
 * Uses a custom recursive approach for reliable deep object sanitization.
 */

import safeStringify from 'fast-safe-stringify';

const MAX_DEPTH = 4;

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

/**
 * Parse and sanitize JSON strings, also check if the string looks like a secret
 */
function sanitizeJsonString(str: string, depth: number): string {
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      const sanitized = recursiveSanitize(parsed, depth);
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
function sanitizePlainObject(obj: any, depth: number): any {
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
      sanitized[key] = recursiveSanitize(value, depth + 1);
    }
  }
  return sanitized;
}

/**
 * Recursively sanitize an object, redacting secret fields at any depth
 */
function recursiveSanitize(obj: any, depth = 0): any {
  if (typeof obj === 'function') {
    return `[Function] ${obj.name}`;
  }

  // Handle strings - check if they're JSON and sanitize if so
  if (typeof obj === 'string') {
    return sanitizeJsonString(obj, depth);
  }

  // Handle primitives and null/undefined
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  // Enforce depth limit for objects and arrays
  if (depth > MAX_DEPTH) {
    return '[...]';
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => recursiveSanitize(item, depth + 1));
  }

  // Handle class instances
  if (isClassInstance(obj)) {
    const constructorName = obj.constructor?.name || 'Object';
    return `[${constructorName} Instance]`;
  }

  // Handle plain objects
  return sanitizePlainObject(obj, depth);
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
  } = {},
): any {
  const { context = 'object', throwOnError = false } = options;

  try {
    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle strings - check if they're JSON and sanitize if so
    if (typeof obj === 'string') {
      return sanitizeJsonString(obj, 0);
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
    return recursiveSanitize(safeObj);
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

    const parsedUrl = new URL(url);

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

    return sanitizedUrl.toString();
  } catch (error) {
    console.warn(`Failed to sanitize URL ${url}: ${error}`);
    return url;
  }
}
