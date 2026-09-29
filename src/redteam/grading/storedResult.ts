import { createHash } from 'crypto';

import type { GradingResult } from '../../types/index';

/** Opaque runtime values cannot safely identify a reusable assertion configuration. */
export function getGradingAssertionHash(assertion: unknown): string | undefined {
  if (!assertion) {
    return undefined;
  }
  try {
    const serialized = JSON.stringify(assertion, function (key, value) {
      // Inspect the original value: toJSON may already have hidden runtime state.
      const original = this[key];
      if (typeof original === 'function' || typeof original === 'symbol') {
        throw new Error('Assertion contains a runtime value');
      }
      if (original && typeof original === 'object') {
        const prototype = Object.getPrototypeOf(original);
        if (
          (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) ||
          typeof original.toJSON === 'function'
        ) {
          throw new Error('Assertion contains a runtime object');
        }
      }
      return value;
    });
    return createHash('sha256').update(serialized).digest('hex');
  } catch {
    return undefined;
  }
}

/** Bind a verdict to its target turn without persisting another copy of the conversation. */
export function getGradingInputHash(
  prompt: string,
  output: string,
  messages?: unknown,
  pluginId?: string,
): string {
  const conversation = Array.isArray(messages)
    ? messages
        .filter(
          (message) =>
            (message?.role === 'user' || message?.role === 'assistant') &&
            typeof message.content === 'string',
        )
        .map(({ role, content }) => ({ role, content }))
    : [];
  return createHash('sha256')
    .update(JSON.stringify([pluginId, prompt, output, conversation]))
    .digest('hex');
}

export function getTargetConversation(messages: unknown): {
  lastUserPrompt?: string;
  conversationTranscript?: string;
} {
  if (!Array.isArray(messages)) {
    return {};
  }
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === 'user' && typeof messages[index].content === 'string') {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0 || !messages[lastUserIndex].content.trim()) {
    return {};
  }

  // Keep the current turn separate from prior context. Only use the target
  // conversation, never the attacker history or abandoned search branches.
  const conversationTranscript = messages
    .slice(0, lastUserIndex)
    .filter(
      (message) =>
        (message?.role === 'user' || message?.role === 'assistant') &&
        typeof message.content === 'string',
    )
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n\n');

  return { lastUserPrompt: messages[lastUserIndex].content, conversationTranscript };
}

/** Attach cumulative usage without marking fresh work as a cached response. */
export function withGradingUsage(
  result: GradingResult,
  tokensUsed: GradingResult['tokensUsed'],
): GradingResult {
  if (result.metadata?.cachedResponse === true && (tokensUsed?.numRequests ?? 0) > 0) {
    const { cachedResponse: _cachedResponse, ...metadata } = result.metadata;
    return { ...result, metadata, tokensUsed };
  }
  return { ...result, tokensUsed };
}
