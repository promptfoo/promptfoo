type UnknownRecord = Record<string, unknown>;

/**
 * Content-part types the Responses API accepts. Anything already using one of these is passed
 * through untouched so hand-authored Responses-format prompts keep working.
 */
const RESPONSES_PART_TYPES = new Set([
  'input_text',
  'output_text',
  'input_image',
  'input_audio',
  'input_file',
  'refusal',
  'computer_screenshot',
  'summary_text',
  'encrypted_content',
]);

/**
 * Translate one chat-completions content part to its Responses equivalent.
 *
 * Text parts become `input_text`, except on an assistant turn where the Responses API expects
 * `output_text`. Image parts become `input_image` with a flat string `image_url` (the chat
 * format nests it as `{ url, detail }`).
 */
function normalizeContentPart(part: unknown, role: unknown): unknown {
  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    return part;
  }
  const candidate = part as UnknownRecord;
  const { type } = candidate;

  if (typeof type !== 'string' || RESPONSES_PART_TYPES.has(type)) {
    return part;
  }

  if (type === 'text' && typeof candidate.text === 'string') {
    return { ...candidate, type: role === 'assistant' ? 'output_text' : 'input_text' };
  }

  if (type === 'image_url') {
    const nested =
      typeof candidate.image_url === 'object' ? (candidate.image_url as UnknownRecord) : undefined;
    const url = typeof candidate.image_url === 'string' ? candidate.image_url : nested?.url;
    if (typeof url === 'string') {
      const { image_url: _chatImageUrl, ...rest } = candidate;
      const detail = nested?.detail ?? candidate.detail;
      return {
        ...rest,
        type: 'input_image',
        image_url: url,
        ...(typeof detail === 'string' ? { detail } : {}),
      };
    }
  }

  return part;
}

/**
 * Normalize a Responses API `input` array authored in the chat-completions format.
 *
 * promptfoo prompts are commonly written as chat messages (`{ type: 'text' }`,
 * `{ type: 'image_url', image_url: { url } }`), but the Responses API rejects those part types
 * outright — xAI answers 422 and OpenAI 400 ("Supported values are: 'input_text',
 * 'input_image', ..."), so multimodal prompts fail on every `*:responses:*` provider. Rewriting
 * the chat parts here lets the same prompt file target both surfaces.
 *
 * Only role-bearing message objects are touched. Items that carry their own `type` are
 * non-message input items (function calls, tool outputs, reasoning items) whose shape must be
 * preserved verbatim. A non-array input (a plain string prompt) is returned unchanged.
 */
export function normalizeResponsesInput<T>(input: T): T {
  if (!Array.isArray(input)) {
    return input;
  }

  return input.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return item;
    }
    const message = item as UnknownRecord;
    if (message.type !== undefined || !('role' in message) || !Array.isArray(message.content)) {
      return item;
    }
    return {
      ...message,
      content: message.content.map((part) => normalizeContentPart(part, message.role)),
    };
  }) as T;
}
