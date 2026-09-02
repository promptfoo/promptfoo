import { parseChatPrompt } from '../providers/shared';
import { getActualPromptWithFallback } from '../util/providerResponse';

import type { ProviderResponse } from '../types/index';

type ChatMessage = {
  role?: string;
  content?: unknown;
};

function getChatMessageText(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => getChatMessageText(part))
      .filter((part): part is string => typeof part === 'string');
    return textParts.length > 0 ? textParts.join('\n') : undefined;
  }

  if (content && typeof content === 'object') {
    const contentObject = content as Record<string, unknown>;
    return getChatMessageText(contentObject.text ?? contentObject.content);
  }

  return undefined;
}

function getLastUserMessage(parsedPrompt: ChatMessage[]): string | undefined {
  for (let i = parsedPrompt.length - 1; i >= 0; i--) {
    const message = parsedPrompt[i];
    if (message?.role === 'user') {
      const userPrompt = getChatMessageText(message.content);
      if (userPrompt !== undefined) {
        return userPrompt;
      }
    }
  }

  for (let i = parsedPrompt.length - 1; i >= 0; i--) {
    const message = parsedPrompt[i];
    const prompt = getChatMessageText(message?.content);
    if (prompt !== undefined) {
      return prompt;
    }
  }

  return undefined;
}

/**
 * Resolves the user-side text that a safety classifier (`moderation`, `llama-guard`)
 * should judge alongside the assistant response.
 *
 * Priority: 1) response.prompt (provider-reported), 2) redteamFinalPrompt (legacy),
 * 3) the original prompt. Serialized chat prompts (JSON or YAML) are unwrapped to
 * their last user message, including multimodal content parts.
 */
export function resolveClassifierPrompt(
  providerResponse: ProviderResponse | undefined,
  prompt: string,
): string {
  const resolved = getActualPromptWithFallback(providerResponse, prompt);

  try {
    const parsedPrompt = parseChatPrompt<ChatMessage[] | null>(resolved, null);
    // Require a real array: parseChatPrompt passes through any parsed JSON, so an
    // attacker-controlled object such as {"length":1000000000} would otherwise satisfy
    // a bare `.length > 0` check and drive the loops below a billion times.
    if (Array.isArray(parsedPrompt) && parsedPrompt.length > 0) {
      return getLastUserMessage(parsedPrompt) ?? resolved;
    }
  } catch {
    // Ignore error
  }

  return resolved;
}

/**
 * Like {@link resolveClassifierPrompt}, but preserves every turn when the evaluated
 * prompt is a serialized multi-turn chat. Used by conversation-aware classifiers
 * (LlamaGuard) that judge the final turn in the context of what preceded it; returns
 * undefined when the prompt is not a chat array, so callers fall back to single-turn.
 */
export function resolveClassifierConversation(
  providerResponse: ProviderResponse | undefined,
  prompt: string,
): { role: string; content: string }[] | undefined {
  const resolved = getActualPromptWithFallback(providerResponse, prompt);

  try {
    const parsedPrompt = parseChatPrompt<ChatMessage[] | null>(resolved, null);
    if (!Array.isArray(parsedPrompt) || parsedPrompt.length === 0) {
      return undefined;
    }

    const turns = parsedPrompt
      .map((message) => ({
        role: typeof message?.role === 'string' ? message.role : 'user',
        content: getChatMessageText(message?.content),
      }))
      .filter((turn): turn is { role: string; content: string } => turn.content !== undefined);

    return turns.length > 0 ? turns : undefined;
  } catch {
    return undefined;
  }
}
