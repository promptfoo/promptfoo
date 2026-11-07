export interface AttributeSanitizationOptions {
  redactAttributes?: string[];
  sanitizeSensitiveAttributes?: boolean;
  truncateValues?: boolean;
}

// Match normalized names; the cookie pattern also covers set-cookie.
const SENSITIVE_ATTRIBUTE_PATTERN = /authorization|cookie|token|apikey|secret|password|passphrase/;

// Token usage counters that stay readable when their value is a number. Only exact names are
// listed: a key elsewhere in a span, such as `access_tokens` or `llm.token_count.pin_token`,
// may hold a numeric credential and stays redacted.
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
  // OpenInference (`llm.token_count.*`), used by Arize Phoenix instrumentors.
  'llm.token_count.prompt',
  'llm.token_count.completion',
  'llm.token_count.total',
  'llm.token_count.prompt_details.cache_read',
  'llm.token_count.prompt_details.cache_write',
  'llm.token_count.prompt_details.cache_input',
  'llm.token_count.prompt_details.audio',
  'llm.token_count.completion_details.reasoning',
  'llm.token_count.completion_details.audio',
]);

// A count is a finite number. Any other value under a counter name could be a credential.
function isTokenCountAttribute(lowerKey: string, value: unknown): boolean {
  return (
    SAFE_TOKEN_ATTRIBUTE_KEYS.has(lowerKey) && typeof value === 'number' && Number.isFinite(value)
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
    if (sanitizeSensitiveAttributes) {
      const lowerKey = key.toLowerCase();
      if (
        !isTokenCountAttribute(lowerKey, value) &&
        SENSITIVE_ATTRIBUTE_PATTERN.test(lowerKey.replace(/[^a-z0-9]/g, ''))
      ) {
        sanitized[key] = '<redacted>';
        continue;
      }
    }
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}
