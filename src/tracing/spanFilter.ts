import { PROMPTFOO_TRACER_NAME, SPAN_ROLE_ATTRIBUTE } from './spanRoles';
import {
  COMMAND_ATTRIBUTE_KEYS,
  getFirstStringAttribute,
  getToolNameFromAttributes,
  SEARCH_ATTRIBUTE_KEYS,
} from './toolAttributes';

interface SpanRelevanceInput {
  attributes?: Record<string, unknown>;
  statusCode?: number;
}

export const HOSTED_CHAT_MODEL_ABSENT = 'promptfoo.openai.chat_model_absent';
export const HOSTED_ABSENT_TOOL_ATTRIBUTES = 'promptfoo.openai.absent_tool_attributes';

/** Older imports also used a bare chat name when OTLP had dropped its model attribute. */
export function hasUncertainHostedChatName(span: SpanRelevanceInput & { name: string }): boolean {
  return span.name === 'chat' && span.attributes?.[HOSTED_CHAT_MODEL_ABSENT] !== true;
}

interface SpanOwnership {
  spanId: string;
  parentSpanId?: string | null;
  attributes?: Record<string, unknown> | null;
}

/** Older receivers persisted ownership from the wire. Discard claims that the export itself contradicts. */
function withoutReceivedHostedOwner<T extends SpanOwnership>(span: T): T {
  const attributes = span.attributes;
  if (!attributes) {
    return span;
  }
  const scope = attributes['otel.scope.name'];
  const foreignRole =
    (attributes[SPAN_ROLE_ATTRIBUTE] || attributes['promptfoo.openai.hosted_trace_requested']) &&
    typeof scope === 'string' &&
    scope !== '[REDACTED]' &&
    scope !== PROMPTFOO_TRACER_NAME;
  const receivedNativeOwner =
    typeof attributes['promptfoo.openai.hosted_trace'] === 'string' &&
    Object.keys(attributes).some(
      (key) => key.startsWith('otel.') || key === 'event.name' || key === 'claude_code.event.name',
    );
  if (!foreignRole && !receivedNativeOwner) {
    return span;
  }
  const clean = { ...attributes };
  if (foreignRole) {
    delete clean[SPAN_ROLE_ATTRIBUTE];
    delete clean['promptfoo.openai.hosted_trace_requested'];
  }
  if (receivedNativeOwner) {
    delete clean['promptfoo.openai.hosted_trace'];
  }
  return { ...span, attributes: clean };
}

/** Internal grader activity can include imported spans without their own role attribute. */
function getGraderOwnedSpanIds(spans: readonly SpanOwnership[]): Set<string> {
  const graders = new Set(
    spans
      .filter((span) => span.attributes?.[SPAN_ROLE_ATTRIBUTE] === 'grader')
      .map((s) => s.spanId),
  );
  if (!graders.size) {
    return graders;
  }
  const children = new Map<string, string[]>();
  for (const { parentSpanId, spanId } of spans) {
    if (parentSpanId) {
      const siblings = children.get(parentSpanId);
      if (siblings) {
        siblings.push(spanId);
      } else {
        children.set(parentSpanId, [spanId]);
      }
    }
  }
  // Set iteration also visits newly added descendants and terminates on cyclic input.
  for (const id of graders) {
    for (const child of children.get(id) ?? []) {
      graders.add(child);
    }
  }
  return graders;
}

export function filterTargetSpans<T extends SpanOwnership>(spans: T[]): T[] {
  const normalized = spans.map(withoutReceivedHostedOwner);
  const graderIds = getGraderOwnedSpanIds(normalized);
  const targets = normalized.filter(({ spanId }) => !graderIds.has(spanId));
  const targetIds = new Set(targets.map(({ spanId }) => spanId));
  return targets.filter(({ attributes }) => {
    // A hosted grader can store its tools before its own wrapper has been exported.
    const owner = attributes?.['promptfoo.openai.hosted_trace'];
    return typeof owner !== 'string' || targetIds.has(owner);
  });
}

/** Identifies spans that describe model, tool, command, search, guardrail, or error activity. */
export function isRelevantSpan(span: SpanRelevanceInput): boolean {
  if (span.attributes?.[SPAN_ROLE_ATTRIBUTE] === 'grader') {
    return false;
  }

  if (
    span.statusCode === 2 ||
    getToolNameFromAttributes(span.attributes) ||
    getFirstStringAttribute(span.attributes, COMMAND_ATTRIBUTE_KEYS) ||
    getFirstStringAttribute(span.attributes, SEARCH_ATTRIBUTE_KEYS)
  ) {
    return true;
  }

  return Object.keys(span.attributes ?? {}).some((attribute) => {
    const normalizedAttribute = attribute.toLowerCase();

    return (
      normalizedAttribute.startsWith('gen_ai.') ||
      normalizedAttribute.startsWith('llm.') ||
      normalizedAttribute.startsWith('guardrail.') ||
      normalizedAttribute.startsWith('guardrails.') ||
      normalizedAttribute === 'ai.model.id'
    );
  });
}

/** Matches optional glob filters while preserving existing substring-filter behavior. */
export function matchesSpanFilter(spanName: string, filters: string[]): boolean {
  return filters.some((filter) => {
    if (!filter.includes('*') && !filter.includes('?')) {
      return spanName.toLowerCase().includes(filter.toLowerCase());
    }

    const escapedFilter = filter.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    const globPattern = escapedFilter.replace(/\*/g, '.*').replace(/\\\?/g, '.');

    return new RegExp(`^${globPattern}$`, 'i').test(spanName);
  });
}
