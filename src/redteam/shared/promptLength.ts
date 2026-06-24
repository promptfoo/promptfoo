import cliState from '../../cliState';

import type { CallApiContextParams } from '../../types/providers';

export const MAX_CHARS_PER_MESSAGE_MODIFIER_KEY = 'maxCharsPerMessage';
export const MIN_CHARS_PER_MESSAGE_MODIFIER_KEY = 'minCharsPerMessage';

type ChatMessage = {
  content: string;
  path: string;
  role: string;
};

type PromptLengthViolation = {
  kind: 'max' | 'min';
  length: number;
  limit: number;
  path: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getCharsPerMessageLimit(limit: number | undefined): number | undefined {
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) {
    return undefined;
  }

  return limit;
}

function getMaxCharsPerMessage(limit?: number): number | undefined {
  return getCharsPerMessageLimit(limit ?? cliState.config?.redteam?.maxCharsPerMessage);
}

function getMinCharsPerMessage(limit?: number): number | undefined {
  return getCharsPerMessageLimit(limit ?? cliState.config?.redteam?.minCharsPerMessage);
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
  {
    maxCharsPerMessage,
    minCharsPerMessage,
  }: { maxCharsPerMessage?: number; minCharsPerMessage?: number },
): PromptLengthViolation | undefined {
  const maxChars = getMaxCharsPerMessage(maxCharsPerMessage);
  const minChars = getMinCharsPerMessage(minCharsPerMessage);
  if (!maxChars && !minChars) {
    return undefined;
  }

  const getViolation = (
    message: Pick<ChatMessage, 'content' | 'path'>,
  ): PromptLengthViolation | undefined => {
    if (maxChars && message.content.length > maxChars) {
      return { kind: 'max', length: message.content.length, limit: maxChars, path: message.path };
    }
    if (minChars && message.content.length < minChars) {
      return { kind: 'min', length: message.content.length, limit: minChars, path: message.path };
    }
    return undefined;
  };

  const messages = parseChatMessages(prompt);
  if (messages) {
    return messages
      .filter((message) => message.role === 'user')
      .map(getViolation)
      .find((violation) => violation !== undefined);
  }

  return getViolation({ content: prompt, path: 'prompt' });
}

export function getMaxCharsPerMessageModifierValue(limit?: number): string | undefined {
  const maxCharsPerMessage = getMaxCharsPerMessage(limit);
  if (!maxCharsPerMessage) {
    return undefined;
  }

  return `Each generated user message must be ${maxCharsPerMessage} characters or fewer.`;
}

export function getMinCharsPerMessageModifierValue(limit?: number): string | undefined {
  const minCharsPerMessage = getMinCharsPerMessage(limit);
  if (!minCharsPerMessage) {
    return undefined;
  }

  return `Each generated user message must be ${minCharsPerMessage} characters or more.`;
}

export function getGeneratedPromptLengthViolation(
  prompt: string,
  {
    maxCharsPerMessage,
    minCharsPerMessage,
  }: { maxCharsPerMessage?: number; minCharsPerMessage?: number },
): PromptLengthViolation | undefined {
  return getPromptLengthViolation(prompt, { maxCharsPerMessage, minCharsPerMessage });
}

export function getGeneratedPromptOverLimit(
  prompt: string,
  limit?: number,
): { length: number; limit: number } | undefined {
  const violation = getPromptLengthViolation(prompt, { maxCharsPerMessage: limit });
  return violation && violation.kind === 'max'
    ? { length: violation.length, limit: violation.limit }
    : undefined;
}

export function throwIfTargetPromptViolatesCharLimits(
  prompt: string,
  {
    maxCharsPerMessage,
    minCharsPerMessage,
  }: { maxCharsPerMessage?: number; minCharsPerMessage?: number },
): void {
  const violation = getPromptLengthViolation(prompt, { maxCharsPerMessage, minCharsPerMessage });
  if (!violation) {
    return;
  }

  const comparator = violation.kind === 'max' ? 'exceeds' : 'is below';
  const configKey = violation.kind === 'max' ? 'maxCharsPerMessage' : 'minCharsPerMessage';
  throw new Error(
    `Target prompt message at ${violation.path} ${comparator} ${configKey}=${violation.limit}: ${violation.length} characters.`,
  );
}

export function getTargetPromptCharLimits(
  context?: CallApiContextParams,
  providerCharLimits?: { maxCharsPerMessage?: number; minCharsPerMessage?: number },
): {
  maxCharsPerMessage?: number;
  minCharsPerMessage?: number;
} {
  const getLimit = (key: 'maxCharsPerMessage' | 'minCharsPerMessage'): number | undefined => {
    const configuredLimit =
      cliState.config?.redteam?.[key] ??
      (context?.test?.metadata?.strategyConfig as Record<string, unknown> | undefined)?.[key] ??
      providerCharLimits?.[key] ??
      (context?.test?.metadata?.pluginConfig as Record<string, unknown> | undefined)?.[key];
    return typeof configuredLimit === 'number' &&
      Number.isInteger(configuredLimit) &&
      configuredLimit > 0
      ? configuredLimit
      : undefined;
  };
  return {
    maxCharsPerMessage: getLimit('maxCharsPerMessage'),
    minCharsPerMessage: getLimit('minCharsPerMessage'),
  };
}

export function throwIfTargetPromptExceedsMaxChars(prompt: string, limit?: number): void {
  throwIfTargetPromptViolatesCharLimits(prompt, { maxCharsPerMessage: limit });
}
