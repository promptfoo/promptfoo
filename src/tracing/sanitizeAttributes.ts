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

function isSensitiveAttributeKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  if (SAFE_TOKEN_ATTRIBUTE_KEYS.has(lowerKey)) {
    return false;
  }

  const normalizedKey = lowerKey.replace(/[^a-z0-9]/g, '');

  return SENSITIVE_ATTRIBUTE_KEYS.some((sensitiveKey, index) => {
    return (
      lowerKey.includes(sensitiveKey) ||
      normalizedKey.includes(NORMALIZED_SENSITIVE_ATTRIBUTE_KEYS[index])
    );
  });
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
    if (sanitizeSensitiveAttributes && isSensitiveAttributeKey(key)) {
      sanitized[key] = '<redacted>';
      continue;
    }
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}
