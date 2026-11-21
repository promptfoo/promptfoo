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
