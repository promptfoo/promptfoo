import cliState from '../../cliState';
import { MULTI_INPUT_VAR } from '../constants';

export const MAX_CHARS_PER_MESSAGE_MODIFIER_KEY = 'maxCharsPerMessage';
export const MIN_CHARS_PER_MESSAGE_MODIFIER_KEY = 'minCharsPerMessage';

type ChatMessage = {
  content: string;
  path: string;
  role: string;
};

type PromptLengthContext = {
  test?: {
    metadata?: {
      pluginConfig?: unknown;
      strategyConfig?: unknown;
    };
  };
};

type PromptVars = Record<string, unknown>;

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

function getMaxCharsPerMessage(
  limit?: number,
  { useCliStateFallback = true }: { useCliStateFallback?: boolean } = {},
): number | undefined {
  return getCharsPerMessageLimit(
    limit ?? (useCliStateFallback ? cliState.config?.redteam?.maxCharsPerMessage : undefined),
  );
}

function getMinCharsPerMessage(
  limit?: number,
  { useCliStateFallback = true }: { useCliStateFallback?: boolean } = {},
): number | undefined {
  return getCharsPerMessageLimit(
    limit ?? (useCliStateFallback ? cliState.config?.redteam?.minCharsPerMessage : undefined),
  );
}

function parseChatMessages(prompt: string): ChatMessage[] | undefined {
  try {
    const parsed = JSON.parse(prompt);

    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item) =>
          isRecord(item) &&
          typeof item.role === 'string' &&
          (typeof item.content === 'string' ||
            (Array.isArray(item.content) &&
              item.content.every((part) => isRecord(part) && typeof part.type === 'string'))),
      )
    ) {
      return parsed.map((message, index) => ({
        content:
          typeof message.content === 'string'
            ? message.content
            : message.content
                .filter(
                  (part: Record<string, unknown>) =>
                    part.type === 'text' && typeof part.text === 'string',
                )
                .map((part: Record<string, unknown>) => part.text)
                .join(''),
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
  options?: { useCliStateFallback?: boolean },
): PromptLengthViolation | undefined {
  const maxChars = getMaxCharsPerMessage(maxCharsPerMessage, options);
  const minChars = getMinCharsPerMessage(minCharsPerMessage, options);
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
  options?: { useCliStateFallback?: boolean },
): PromptLengthViolation | undefined {
  return getPromptLengthViolation(prompt, { maxCharsPerMessage, minCharsPerMessage }, options);
}

function getStringRecordValues(value: unknown): string[] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Object.values(value).map((entry) =>
    typeof entry === 'object' && entry !== null ? JSON.stringify(entry) : String(entry),
  );
}

function getGeneratedPromptValues(vars: PromptVars | undefined, injectVar: string): string[] {
  if (injectVar !== MULTI_INPUT_VAR) {
    const prompt = vars?.[injectVar];
    if (Array.isArray(prompt) && prompt.every((value) => typeof value === 'string')) {
      return prompt as string[];
    }
    return [
      typeof prompt === 'object' && prompt !== null ? JSON.stringify(prompt) : String(prompt ?? ''),
    ];
  }

  try {
    const parsedPromptValues = getStringRecordValues(
      JSON.parse(String(vars?.[MULTI_INPUT_VAR] ?? '')),
    );
    if (parsedPromptValues) {
      return parsedPromptValues;
    }
  } catch {
    // Fall back to already materialized individual input vars.
  }

  return Object.entries(vars ?? {})
    .filter(([key, value]) => key !== MULTI_INPUT_VAR && typeof value === 'string')
    .map(([, value]) => String(value));
}

function getFirstGeneratedPromptLengthViolation(
  prompts: string[],
  charLimits: { maxCharsPerMessage?: number; minCharsPerMessage?: number },
  options?: { useCliStateFallback?: boolean },
): PromptLengthViolation | undefined {
  return prompts
    .map((prompt) => getGeneratedPromptLengthViolation(prompt, charLimits, options))
    .find((candidate) => candidate !== undefined);
}

export function getGeneratedTestCaseLengthViolation(
  vars: PromptVars | undefined,
  injectVar: string,
  charLimits: { maxCharsPerMessage?: number; minCharsPerMessage?: number },
  options?: { useCliStateFallback?: boolean },
): PromptLengthViolation | undefined {
  return getFirstGeneratedPromptLengthViolation(
    getGeneratedPromptValues(vars, injectVar),
    charLimits,
    options,
  );
}

export function getGeneratedPromptObjectLengthViolation(
  prompt: { __prompt: string } | Record<string, string>,
  charLimits: { maxCharsPerMessage?: number; minCharsPerMessage?: number },
  {
    isMultiInput = false,
    useCliStateFallback = true,
  }: {
    isMultiInput?: boolean;
    useCliStateFallback?: boolean;
  } = {},
): PromptLengthViolation | undefined {
  let generatedPrompts = '__prompt' in prompt ? [prompt.__prompt] : Object.values(prompt);
  if (isMultiInput && '__prompt' in prompt) {
    try {
      const parsedPromptValues = getStringRecordValues(JSON.parse(prompt.__prompt) as unknown);
      if (parsedPromptValues) {
        generatedPrompts = parsedPromptValues;
      }
    } catch {
      // Preserve the serialized prompt fallback for malformed custom plugin output.
    }
  }
  return getFirstGeneratedPromptLengthViolation(generatedPrompts, charLimits, {
    useCliStateFallback,
  });
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
  options?: { useCliStateFallback?: boolean },
): void {
  const violation = getPromptLengthViolation(
    prompt,
    { maxCharsPerMessage, minCharsPerMessage },
    options,
  );
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
  context?: PromptLengthContext,
  providerCharLimits?: { maxCharsPerMessage?: number; minCharsPerMessage?: number },
): {
  maxCharsPerMessage?: number;
  minCharsPerMessage?: number;
} {
  const getLimit = (key: 'maxCharsPerMessage' | 'minCharsPerMessage'): number | undefined => {
    const configuredLimit =
      providerCharLimits?.[key] ??
      cliState.config?.redteam?.[key] ??
      (context?.test?.metadata?.strategyConfig as Record<string, unknown> | undefined)?.[key] ??
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

export function isTargetPromptCharLimitError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message.includes('maxCharsPerMessage=') || error.message.includes('minCharsPerMessage='))
  );
}

export function throwIfTargetPromptExceedsMaxChars(prompt: string, limit?: number): void {
  throwIfTargetPromptViolatesCharLimits(prompt, { maxCharsPerMessage: limit });
}
