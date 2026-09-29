type UnknownRecord = Record<string, unknown>;

/** Translate Chat Completions text and image parts, preserving Responses-native parts. */
function normalizeContentPart(part: unknown): unknown {
  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    return part;
  }
  const candidate = part as UnknownRecord;
  const { type } = candidate;

  if (type === 'text' && typeof candidate.text === 'string') {
    return { ...candidate, type: 'input_text' };
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

/** Normalize message content while preserving tool calls, outputs, and other input items. */
function normalizeResponsesInput(input: unknown[]): unknown[] {
  return input.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return item;
    }
    const message = item as UnknownRecord;
    if (
      (message.type !== undefined && message.type !== 'message') ||
      !('role' in message) ||
      !Array.isArray(message.content)
    ) {
      return item;
    }
    return {
      ...message,
      content: message.content.map(normalizeContentPart),
    };
  });
}

/** Parse JSON message arrays; send plain text and other JSON values verbatim. */
export function parseResponsesInput(prompt: string): unknown {
  try {
    const parsed = JSON.parse(prompt);
    return Array.isArray(parsed) ? normalizeResponsesInput(parsed) : prompt;
  } catch {
    return prompt;
  }
}
