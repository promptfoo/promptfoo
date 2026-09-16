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
]);

const TOKEN_MARKER = 'token';

/**
 * Matches keys that count tokens rather than carry one, so counters from any
 * instrumentation stay readable: `prompt.tokens` and `response.tokens` from the tracing
 * docs, `ai.usage.promptTokens` (Vercel AI SDK) and `llm.token_count.prompt`
 * (OpenInference).
 */
const TOKEN_COUNT_KEY_PATTERN = /tokens$|(?:^|[^a-z0-9])token_?counts?(?:[^a-z0-9]|$)/;

/**
 * Lowercasing on its own destroys the camel-case boundary, so `promptTokenCount`
 * would read as `prompttokencount` and match neither branch of the pattern. Insert the
 * boundary first.
 *
 * Two passes, because an acronym needs the opposite rule: the first splits a lower or
 * digit followed by an upper (`promptToken`), the second splits an upper run followed by
 * a capitalised word (`LLMToken`, `OpenAIToken`).
 */
function toBoundaryKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function isTokenCountAttribute(key: string, lowerKey: string, value: unknown): boolean {
  // A count is a number. Anything else under the same key could be a credential,
  // including under a well-known usage key.
  if (typeof value !== 'number') {
    return false;
  }
  return (
    SAFE_TOKEN_ATTRIBUTE_KEYS.has(lowerKey) || TOKEN_COUNT_KEY_PATTERN.test(toBoundaryKey(key))
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

  // Only the `token` marker can be waived, and only for a count. A key such as
  // `authorization.tokens` or `api_key.token_count` also names credential material, so it
  // stays redacted whatever its value.
  if (matchedMarkers.some((marker) => marker !== TOKEN_MARKER)) {
    return true;
  }

  return !isTokenCountAttribute(key, lowerKey, value);
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
