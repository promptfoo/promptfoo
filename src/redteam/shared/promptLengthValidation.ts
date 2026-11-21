export const MAX_CHARS_PER_MESSAGE_MODIFIER_KEY = 'maxCharsPerMessage';

function isValidMaxCharsPerMessage(limit: unknown): limit is number {
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0;
}

export function getMaxCharsPerMessageFromConfig(config?: {
  maxCharsPerMessage?: unknown;
  modifiers?: unknown;
}): number | undefined {
  if (isValidMaxCharsPerMessage(config?.maxCharsPerMessage)) {
    return config.maxCharsPerMessage;
  }

  const maxCharsModifier = (config?.modifiers as Record<string, string> | undefined)?.[
    MAX_CHARS_PER_MESSAGE_MODIFIER_KEY
  ];
  if (typeof maxCharsModifier !== 'string') {
    return undefined;
  }

  const match = /must be (\d+) characters or fewer\./.exec(maxCharsModifier);
  if (!match) {
    return undefined;
  }

  const maxCharsPerMessage = Number(match[1]);
  return isValidMaxCharsPerMessage(maxCharsPerMessage) ? maxCharsPerMessage : undefined;
}

export function getLiteralMessageOverLimit(message: string, limit?: number) {
  return limit && message.length > limit ? { length: message.length, limit } : undefined;
}
