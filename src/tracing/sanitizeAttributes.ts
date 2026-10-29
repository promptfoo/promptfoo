export interface AttributeSanitizationOptions {
  redactAttributes?: string[];
  sanitizeSensitiveAttributes?: boolean;
  truncateValues?: boolean;
}

// Match normalized names; the cookie pattern also covers set-cookie.
const SENSITIVE_ATTRIBUTE_PATTERN = /authorization|cookie|token|apikey|secret|password|passphrase/;
const MAX_ATTRIBUTE_LENGTH = 400;
const CUSTOM_REDACTION = '[REDACTED]';
const SENSITIVE_REDACTION = '<redacted>';

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

/** Replaced values can only rule out matches incompatible with the retained prefix. */
export function isUncertainTraceAttributeMatch(stored: unknown, expected: unknown): boolean {
  if (stored === CUSTOM_REDACTION || stored === SENSITIVE_REDACTION) {
    return true;
  }
  return (
    typeof stored === 'string' &&
    stored.length === MAX_ATTRIBUTE_LENGTH + 1 &&
    stored.endsWith('…') &&
    typeof expected === 'string' &&
    expected.length > MAX_ATTRIBUTE_LENGTH &&
    expected.startsWith(stored.slice(0, -1))
  );
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
      return truncateValues && value.length > MAX_ATTRIBUTE_LENGTH
        ? `${value.slice(0, MAX_ATTRIBUTE_LENGTH)}…`
        : value;
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
      sanitized[key] = CUSTOM_REDACTION;
      continue;
    }
    if (sanitizeSensitiveAttributes) {
      const lowerKey = key.toLowerCase();
      if (
        !SAFE_TOKEN_ATTRIBUTE_KEYS.has(lowerKey) &&
        SENSITIVE_ATTRIBUTE_PATTERN.test(lowerKey.replace(/[^a-z0-9]/g, ''))
      ) {
        sanitized[key] = SENSITIVE_REDACTION;
        continue;
      }
    }
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}
