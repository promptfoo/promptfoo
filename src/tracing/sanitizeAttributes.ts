export interface AttributeSanitizationOptions {
  redactAttributes?: string[];
  sanitizeSensitiveAttributes?: boolean;
  truncateValues?: boolean;
  redactText?: (value: string) => string;
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
  depth = 0,
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

  const sanitizeValue = (value: any, valueDepth = depth): any => {
    if (valueDepth >= 20) {
      return '[TRUNCATED]';
    }
    if (typeof value === 'string') {
      value = options.redactText?.(value) ?? value;
      return truncateValues && value.length > 400 ? `${value.slice(0, 400)}…` : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, valueDepth + 1));
    }
    if (value && typeof value === 'object') {
      return sanitizeTraceAttributes(value as Record<string, any>, options, valueDepth + 1);
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

export interface TraceTextRedactionState {
  secrets: Set<string>;
  length: number;
  incomplete: boolean;
}

const textRedactionByStore = new WeakMap<object, Map<string, TraceTextRedactionState>>();

export function clearTraceTextRedactionState(store: object): void {
  textRedactionByStore.delete(store);
}

export function getTraceTextRedactionState(
  store: object,
  traceId: string | undefined,
  evidence: unknown,
): TraceTextRedactionState {
  const states = textRedactionByStore.get(store) ?? new Map<string, TraceTextRedactionState>();
  textRedactionByStore.set(store, states);
  const existing = traceId ? states.get(traceId) : undefined;
  const state = existing ?? {
    secrets: new Set<string>(),
    length: 0,
    incomplete: /\[(?:REDACTED|TRUNCATED)\]/.test(JSON.stringify(evidence)),
  };
  if (traceId) {
    states.delete(traceId);
    if (states.size >= 1_024) {
      states.delete(states.keys().next().value!);
    }
    states.set(traceId, state);
  }
  return state;
}

export function getTraceTextRedactor(
  pairs: { original: unknown; sanitized: unknown }[],
  replacement = '[REDACTED]',
  state: TraceTextRedactionState = { secrets: new Set(), length: 0, incomplete: false },
) {
  const pending = [...pairs];
  const secrets = state.secrets;
  let incomplete = state.incomplete;
  let visited = 0;
  while (pending.length && !incomplete) {
    const { original, sanitized } = pending.pop()!;
    if (++visited > 10_000 || (sanitized === '[TRUNCATED]' && original !== sanitized)) {
      incomplete = true;
      break;
    }
    const redacted = sanitized === '[REDACTED]' || sanitized === '<redacted>';
    // Serialized values can echo decoded fields that do not match the full string.
    if (
      redacted &&
      typeof original === 'string' &&
      original !== '[REDACTED]' &&
      /^\s*(?:\[|\{|")/.test(original)
    ) {
      incomplete = true;
      break;
    }
    if (!original || typeof original !== 'object') {
      if (original !== undefined && original !== null && redacted && String(original)) {
        const secret = String(original);
        if (!secrets.has(secret)) {
          state.length += secret.length;
          if (state.length > 16_384 || secrets.size >= 1_000) {
            incomplete = true;
            break;
          }
          secrets.add(secret);
        }
      }
      continue;
    }
    for (const [key, value] of Object.entries(original)) {
      pending.push({
        original: value,
        sanitized: redacted ? sanitized : (sanitized as Record<string, unknown>)?.[key],
      });
    }
  }
  state.incomplete = incomplete;
  if (incomplete) {
    secrets.clear();
  }
  const pattern = secrets.size
    ? new RegExp(
        [...new Set([...secrets].flatMap((value) => [value, JSON.stringify(value).slice(1, -1)]))]
          .sort((a, b) => b.length - a.length)
          .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|'),
        'g',
      )
    : undefined;
  return <T extends string | undefined>(value: T): T => {
    if (typeof value !== 'string') {
      return value;
    }
    if (incomplete) {
      return replacement as T;
    }
    return (pattern ? value.replace(pattern, replacement) : value) as T;
  };
}
