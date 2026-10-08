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

function getGradingMessages(
  messages: unknown,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return Array.isArray(messages)
    ? messages
        .filter(
          (message) =>
            (message?.role === 'user' || message?.role === 'assistant') &&
            typeof message.content === 'string',
        )
        .map(({ role, content }) => ({ role, content }))
    : [];
}

/** Bind a verdict to its target turn without persisting another copy of the conversation. */
export function getGradingInputHash(
  prompt: string,
  output: string,
  messages?: unknown,
  pluginId?: string,
  currentTurnStart?: number,
): string {
  const conversation = getGradingMessages(messages);
  return createHash('sha256')
    .update(
      JSON.stringify([
        pluginId,
        prompt,
        output,
        conversation,
        ...(currentTurnStart === undefined ? [] : [currentTurnStart]),
      ]),
    )
    .digest('hex');
}

export function getTargetConversation(
  messages: unknown,
  currentTurnStart?: unknown,
): {
  lastUserPrompt?: string;
  conversationTranscript?: string;
  currentTurnStart?: number;
} {
  if (!Array.isArray(messages)) {
    return {};
  }
  // The boundary counts the same role/content records that enter the grade hash.
  // Old results keep inferring their current turn from the last user message.
  const conversation = getGradingMessages(messages);
  const boundary =
    typeof currentTurnStart === 'number' &&
    Number.isInteger(currentTurnStart) &&
    currentTurnStart >= 0 &&
    currentTurnStart <= conversation.length
      ? currentTurnStart
      : undefined;
  let lastUserIndex = -1;
  for (let index = conversation.length - 1; index >= (boundary ?? 0); index--) {
    if (conversation[index].role === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  const lastUserPrompt =
    lastUserIndex >= 0 && conversation[lastUserIndex].content.trim()
      ? conversation[lastUserIndex].content
      : undefined;
  if (!lastUserPrompt && boundary === undefined) {
    return {};
  }

  // Keep the current turn separate from prior context. Only use the target
  // conversation, never the attacker history or abandoned search branches.
  const priorMessages = conversation.slice(0, boundary ?? lastUserIndex);

  // Keep role labels inside message content distinct from actual message roles.
  const conversationTranscript = priorMessages.length ? JSON.stringify(priorMessages, null, 2) : '';
  return {
    ...(lastUserPrompt === undefined ? {} : { lastUserPrompt }),
    conversationTranscript,
    ...(boundary === undefined ? {} : { currentTurnStart: boundary }),
  };
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
