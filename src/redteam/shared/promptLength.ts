import cliState from '../../cliState';

export const MAX_CHARS_PER_MESSAGE_MODIFIER_KEY = 'maxCharsPerMessage';

type ChatMessage = {
  content: string;
  path: string;
  role: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getMaxCharsPerMessage(limit?: number): number | undefined {
  const maxCharsPerMessage = limit ?? cliState.config?.redteam?.maxCharsPerMessage;

  if (
    typeof maxCharsPerMessage !== 'number' ||
    !Number.isInteger(maxCharsPerMessage) ||
    maxCharsPerMessage <= 0
  ) {
    return undefined;
  }

  return maxCharsPerMessage;
}

function parseChatMessages(prompt: string): ChatMessage[] | undefined {
  try {
    const parsed = JSON.parse(prompt);

    if (
      Array.isArray(parsed) &&
      parsed.every(
        // TODO(ian): Support multimodal chat content arrays and count only text parts instead of
        // falling back to the full serialized JSON payload, which can include base64 media blobs.
        (item) =>
          isRecord(item) && typeof item.role === 'string' && typeof item.content === 'string',
      )
    ) {
      return parsed.map((message, index) => ({
        content: message.content,
        path: `[${index}].content`,
        role: message.role,
      }));
    }

    if (
      isRecord(parsed) &&
      parsed._promptfoo_audio_hybrid === true &&
      (parsed.history === undefined || Array.isArray(parsed.history)) &&
      isRecord(parsed.currentTurn) &&
      typeof parsed.currentTurn.role === 'string' &&
      typeof parsed.currentTurn.transcript === 'string' &&
      (parsed.history === undefined ||
        parsed.history.every(
          (item) =>
            isRecord(item) && typeof item.role === 'string' && typeof item.content === 'string',
        ))
    ) {
      return [
        ...((parsed.history as Array<{ content: string; role: string }> | undefined) ?? []).map(
          (message, index) => ({
            content: message.content,
            path: `history[${index}].content`,
            role: message.role,
          }),
        ),
        {
          content: parsed.currentTurn.transcript,
          path: 'currentTurn.transcript',
          role: parsed.currentTurn.role,
        },
      ];
    }
  } catch {
    // Plain-string prompts are checked as-is.
  }

  return undefined;
}

function getPromptLengthViolation(
  prompt: string,
  limit?: number,
): { length: number; limit: number; path: string } | undefined {
  const maxCharsPerMessage = getMaxCharsPerMessage(limit);
  if (!maxCharsPerMessage) {
    return undefined;
  }

  const messages = parseChatMessages(prompt);
  if (messages) {
    const oversizedMessage = messages.find(
      (message) => message.role === 'user' && message.content.length > maxCharsPerMessage,
    );

    return oversizedMessage
      ? {
          length: oversizedMessage.content.length,
          limit: maxCharsPerMessage,
          path: oversizedMessage.path,
        }
      : undefined;
  }

  if (prompt.length <= maxCharsPerMessage) {
    return undefined;
  }

  return {
    length: prompt.length,
    limit: maxCharsPerMessage,
    path: 'prompt',
  };
}

export function getMaxCharsPerMessageModifierValue(limit?: number): string | undefined {
  const maxCharsPerMessage = getMaxCharsPerMessage(limit);
  if (!maxCharsPerMessage) {
    return undefined;
  }

  return `Each generated user message must be ${maxCharsPerMessage} characters or fewer.`;
}

export function getGeneratedPromptOverLimit(
  prompt: string,
  limit?: number,
): { length: number; limit: number } | undefined {
  const violation = getPromptLengthViolation(prompt, limit);
  if (!violation) {
    return undefined;
  }

  return {
    length: violation.length,
    limit: violation.limit,
  };
}

export function throwIfTargetPromptExceedsMaxChars(prompt: string, limit?: number): void {
  const violation = getPromptLengthViolation(prompt, limit);
  if (!violation) {
    return;
  }

  throw new Error(
    `Target prompt message at ${violation.path} exceeds maxCharsPerMessage=${violation.limit}: ${violation.length} characters.`,
  );
}
