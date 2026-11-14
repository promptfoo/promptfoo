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
): string | undefined {
  const resolved = getActualPromptWithFallback(providerResponse, prompt);
  if (!resolved) {
    return undefined;
  }

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
 * Resolve the preceding target turns from a red-team strategy or serialized
 * chat prompt. A plain prompt without saved history uses single-turn grading.
 */
export function resolveClassifierConversation(
  providerResponse: ProviderResponse | undefined,
  prompt: string,
): { role: string; content: string }[] | undefined {
  const saved = providerResponse?.metadata?.messages;
  try {
    // GOAT and Crescendo report a final prompt and save their selected target
    // conversation including its response. The matcher appends the evaluated
    // output (which may be transformed), so only pass the preceding turns.
    if (providerResponse?.metadata?.redteamFinalPrompt && Array.isArray(saved)) {
      const history = saved[saved.length - 1]?.role === 'assistant' ? saved.slice(0, -1) : saved;
      if (history[history.length - 1]?.role === 'user') {
        return getTextTurns(history);
      }
    }

    const resolved = getActualPromptWithFallback(providerResponse, prompt);
    const parsed = parseChatPrompt<ChatMessage[] | null>(resolved, null);
    return Array.isArray(parsed) ? getTextTurns(parsed) : undefined;
  } catch {
    return undefined;
  }
}

function getTextTurns(messages: ChatMessage[]): { role: string; content: string }[] | undefined {
  const turns = messages
    .map((message) => ({
      role: typeof message?.role === 'string' ? message.role : 'user',
      content: getChatMessageText(message?.content),
    }))
    .filter((turn): turn is { role: string; content: string } => turn.content !== undefined);
  return turns.length > 0 ? turns : undefined;
}
