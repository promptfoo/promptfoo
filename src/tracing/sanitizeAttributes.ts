export interface AttributeSanitizationOptions {
  redactAttributes?: string[];
  sanitizeSensitiveAttributes?: boolean;
  truncateValues?: boolean;
}

const SENSITIVE_ATTRIBUTE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'api_key',
  'apikey',
  'secret',
  'password',
  'passphrase',
];

const NORMALIZED_SENSITIVE_ATTRIBUTE_KEYS = SENSITIVE_ATTRIBUTE_KEYS.map((key) =>
  key.replace(/[^a-z0-9]/g, ''),
);

const SAFE_TOKEN_ATTRIBUTE_KEYS = new Set([
  'gen_ai.request.max_tokens',
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.output_tokens',
  'gen_ai.usage.reasoning.output_tokens',
  'gen_ai.usage.cache_read.input_tokens',
  'gen_ai.usage.cache_creation.input_tokens',
  'promptfoo.usage.total_tokens',
  'promptfoo.usage.cached_response_tokens',
  'promptfoo.usage.accepted_prediction_tokens',
  'promptfoo.usage.rejected_prediction_tokens',
  // Preserve token counts from externally instrumented LLM applications.
  'llm.usage.prompt_tokens',
  'llm.usage.completion_tokens',
  'llm.usage.total_tokens',
  // Keep historical span attributes readable after upgrading.
  'gen_ai.usage.total_tokens',
  'gen_ai.usage.cached_tokens',
  'gen_ai.usage.reasoning_tokens',
  'gen_ai.usage.accepted_prediction_tokens',
  'gen_ai.usage.rejected_prediction_tokens',
  'gen_ai.usage.cache_read_input_tokens',
  'gen_ai.usage.cache_creation_input_tokens',
  // Counters used in the application examples in the tracing docs.
  'prompt.tokens',
  'response.tokens',
  'completion.tokens',
  // Vercel AI SDK (`ai.usage.*`), v4 and v5 names, matched case-insensitively.
  'ai.usage.prompttokens',
  'ai.usage.completiontokens',
  'ai.usage.inputtokens',
  'ai.usage.outputtokens',
  'ai.usage.totaltokens',
  'ai.usage.reasoningtokens',
  'ai.usage.cachedinputtokens',
]);

/**
 * Usage namespaces whose attributes are counters by definition. The exemption is bounded
 * to these prefixes so a key such as `access_tokens` or `sessionTokens` elsewhere in a
 * span is still treated as credential material.
 *
 * - `gen_ai.usage.*_tokens`, `llm.usage.*_tokens`, `promptfoo.usage.*_tokens`
 * - `llm.token_count.*` (OpenInference)
 */
const SAFE_TOKEN_COUNTER_NAMESPACE_PATTERNS = [
  /^(?:gen_ai|llm|promptfoo)\.usage\.[a-z0-9_.]*_tokens$/,
  /^llm\.token_count\.[a-z0-9_.]+$/,
];

/**
 * Words that mark a token as credential material even inside a usage namespace, for
 * example `gen_ai.usage.access_tokens` or `llm.token_count.refresh_token`.
 */
const CREDENTIAL_TOKEN_QUALIFIERS = [
  'access',
  'session',
  'refresh',
  'auth',
  'bearer',
  'id_token',
  'csrf',
  'otp',
];

const TOKEN_MARKER = 'token';

function isTokenCountAttribute(lowerKey: string, value: unknown): boolean {
  // A count is a finite number. Any other value under the same key could be a credential,
  // including under a recognised usage key.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  if (SAFE_TOKEN_ATTRIBUTE_KEYS.has(lowerKey)) {
    return true;
  }
  return (
    SAFE_TOKEN_COUNTER_NAMESPACE_PATTERNS.some((pattern) => pattern.test(lowerKey)) &&
    !CREDENTIAL_TOKEN_QUALIFIERS.some((qualifier) => lowerKey.includes(qualifier))
  );
}

function isSensitiveAttributeKey(key: string, value: unknown): boolean {
  const lowerKey = key.toLowerCase();
  const normalizedKey = lowerKey.replace(/[^a-z0-9]/g, '');

  const matchedMarkers = SENSITIVE_ATTRIBUTE_KEYS.filter(
    (sensitiveKey, index) =>
      lowerKey.includes(sensitiveKey) ||
      normalizedKey.includes(NORMALIZED_SENSITIVE_ATTRIBUTE_KEYS[index]),
  );

  if (matchedMarkers.length === 0) {
    return false;
  }

  // Only the `token` marker can be waived, and only for a numeric value under a recognised
  // usage-counter key. A key such as `api_key.token_count` also names credential material,
  // so it stays redacted whatever its value.
  if (matchedMarkers.some((marker) => marker !== TOKEN_MARKER)) {
    return true;
  }

  return !isTokenCountAttribute(lowerKey, value);
}

export function sanitizeTraceAttributes(
  attributes: Record<string, any> | null | undefined,
  options: AttributeSanitizationOptions = {},
): Record<string, any> {
  if (!attributes) {
    return {};
  }

  const {
    redactAttributes = [],
    sanitizeSensitiveAttributes = true,
    truncateValues = true,
  } = options;
  const customPatterns = [
    ...new Set(
      redactAttributes
        .map((pattern) => (typeof pattern === 'string' ? pattern.trim().toLowerCase() : ''))
        .filter((pattern) => pattern.length > 0),
    ),
  ];

  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      return truncateValues && value.length > 400 ? `${value.slice(0, 400)}…` : value;
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object') {
      return sanitizeTraceAttributes(value as Record<string, any>, options);
    }
    return value;
  };

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (customPatterns.some((pattern) => key.toLowerCase().includes(pattern))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    if (sanitizeSensitiveAttributes && isSensitiveAttributeKey(key, value)) {
      sanitized[key] = '<redacted>';
      continue;
    }
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}
