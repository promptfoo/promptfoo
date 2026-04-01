import cliState from '../../cliState';

export const MAX_CHARS_PER_MESSAGE_MODIFIER_KEY = 'maxCharsPerMessage';

type ChatMessage = {
  content: string;
  role: string;
};

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
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as ChatMessage).role === 'string' &&
          typeof (item as ChatMessage).content === 'string',
      )
    ) {
      return parsed;
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
    const oversizedMessage = messages
      .map((message, index) => ({ index, message }))
      .find(
        ({ message }) => message.role === 'user' && message.content.length > maxCharsPerMessage,
      );

    return oversizedMessage
      ? {
          length: oversizedMessage.message.content.length,
          limit: maxCharsPerMessage,
          path: `[${oversizedMessage.index}].content`,
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
): { length: number; limit: number } | undefined {
  const violation = getPromptLengthViolation(prompt);
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
