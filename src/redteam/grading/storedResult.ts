import { createHash } from 'crypto';

import type { GradingResult } from '../../types/index';
import type { RedteamGradingContext } from './types';

// Carry selected target evidence within the evaluation without serializing full traces or raw responses.
const selectedEvidence = Symbol('selectedRedteamGradingEvidence');
type GradeWithEvidence = GradingResult & { [selectedEvidence]?: RedteamGradingContext };
type EvidenceKind = 'trace' | 'raw' | 'images' | 'audio' | 'tracking';

export function getGradingEvidenceKinds(
  context?: RedteamGradingContext,
  includeRaw = false,
): EvidenceKind[] {
  if (!context) {
    return [];
  }
  const kinds: EvidenceKind[] = [];
  if (context.traceContext || context.traceData || context.traceSummary) {
    kinds.push('trace');
  }
  if (includeRaw && context.providerResponse?.raw != null) {
    kinds.push('raw');
  }
  if ((context.imageOutputs ?? context.providerResponse?.images)?.length) {
    kinds.push('images');
  }
  if (context.providerResponse?.audio?.data) {
    kinds.push('audio');
  }
  if (typeof context.wasExfiltrated === 'boolean') {
    kinds.push('tracking');
  }
  return kinds;
}

export function missingGradingEvidence(
  grade: GradingResult,
  context: RedteamGradingContext,
): EvidenceKind[] {
  const required = grade.metadata?.redteamGradingEvidenceKinds;
  if (!Array.isArray(required)) {
    return [];
  }
  const available = new Set(getGradingEvidenceKinds(context, true));
  return required.filter(
    (kind): kind is EvidenceKind =>
      typeof kind === 'string' &&
      ['trace', 'raw', 'images', 'audio', 'tracking'].includes(kind) &&
      !available.has(kind as EvidenceKind),
  );
}

/** A later negative observation cannot erase an already confirmed exfiltration event. */
export function mergeExfilEvidence(
  context: RedteamGradingContext,
  tracking: Pick<RedteamGradingContext, 'wasExfiltrated' | 'exfilCount' | 'exfilRecords'>,
): RedteamGradingContext {
  return context.wasExfiltrated === true && tracking.wasExfiltrated !== true
    ? context
    : { ...context, ...tracking };
}

export function withSelectedGradingEvidence(
  grade: GradingResult,
  context?: RedteamGradingContext,
): GradingResult {
  if (context) {
    Object.defineProperty(grade, selectedEvidence, { value: context, configurable: true });
  }
  return grade;
}

export function getSelectedGradingEvidence(
  grade: GradingResult | undefined,
): RedteamGradingContext | undefined {
  return (grade as GradeWithEvidence | undefined)?.[selectedEvidence];
}

/** Keep target evidence from the selected attempt while giving newer evidence precedence. */
export function recoverSelectedGradingContext(
  grade: GradingResult | undefined,
  current: RedteamGradingContext,
): RedteamGradingContext {
  const selected = getSelectedGradingEvidence(grade);
  if (!selected) {
    return current;
  }
  const {
    providerResponse: originalResponse,
    conversationTranscript: _transcript,
    priorMessages: _messages,
    redteamHistory: _attackHistory,
    conversationHistory: _history,
    ...evidence
  } = selected;
  const response = current.providerResponse;
  return {
    ...evidence,
    ...current,
    ...(response && {
      providerResponse: {
        ...response,
        raw: response.raw ?? originalResponse?.raw,
        images: response.images ?? originalResponse?.images,
        audio: response.audio ?? originalResponse?.audio,
      },
    }),
  };
}

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
} & Pick<RedteamGradingContext, 'conversationTranscript' | 'priorMessages'> {
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
  const priorMessages = messages
    .slice(0, lastUserIndex)
    .filter(
      (message) =>
        (message?.role === 'user' || message?.role === 'assistant') &&
        typeof message.content === 'string',
    )
    .map(({ role, content }) => ({ role, content }));
  const conversationTranscript = priorMessages
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n\n');

  return { lastUserPrompt: messages[lastUserIndex].content, conversationTranscript, priorMessages };
}

/** Attach cumulative usage without marking fresh work as a cached response. */
export function withGradingUsage(
  result: GradingResult,
  tokensUsed: GradingResult['tokensUsed'],
): GradingResult {
  if (result.metadata?.cachedResponse === true && (tokensUsed?.numRequests ?? 0) > 0) {
    const { cachedResponse: _cachedResponse, ...metadata } = result.metadata;
    return withSelectedGradingEvidence(
      { ...result, metadata, tokensUsed },
      getSelectedGradingEvidence(result),
    );
  }
  return withSelectedGradingEvidence({ ...result, tokensUsed }, getSelectedGradingEvidence(result));
}
