export const FINISH_REASON_MAP: Record<string, string> = {
  // OpenAI
  stop: 'stop',
  length: 'length',
  content_filter: 'content_filter',
  tool_calls: 'tool_calls',
  function_call: 'tool_calls',
  // Anthropic
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  tool_use: 'tool_calls',
};

/**
 * Normalize a provider-specific finish or stop reason to a standard value.
 * @param raw - The raw finish_reason/stop_reason (snake_case or camelCase).
 * @returns A normalized finish reason string or undefined if missing/invalid.
 */
export function normalizeFinishReason(raw?: string | null): string | undefined {
  if (raw == null) {
    return undefined;
  }
  
  // Handle edge cases
  if (typeof raw !== 'string') {
    return undefined;
  }
  
  const trimmed = raw.trim();
  if (trimmed === '') {
    return undefined;
  }
  
  // Normalize to lowercase for consistent mapping
  const key = trimmed.toLowerCase();
  return FINISH_REASON_MAP[key] ?? key;
}
