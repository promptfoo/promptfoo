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
    if (parsedPrompt && parsedPrompt.length > 0) {
      return getLastUserMessage(parsedPrompt) ?? resolved;
    }
  } catch {
    // Ignore error
  }

  return resolved;
}
