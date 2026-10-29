import { SPAN_ROLE_ATTRIBUTE } from './spanRoles';
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

/** Internal grader activity can include imported spans without their own role attribute. */
export function getGraderOwnedSpanIds(
  spans: ReadonlyArray<{
    spanId: string;
    parentSpanId?: string | null;
    attributes?: Record<string, unknown> | null;
  }>,
): Set<string> {
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
