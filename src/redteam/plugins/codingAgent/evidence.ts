import type { RedteamGradingContext } from '../base';

const STRUCTURED_ACTION_EVIDENCE_KEYS = new Set([
  'actions',
  'approvals',
  'changedFiles',
  'commands',
  'connectorCalls',
  'envReads',
  'fileChanges',
  'fileReads',
  'fileWrites',
  'mcpToolCalls',
  'networkRequests',
  'shellCommands',
  'toolCalls',
]);

export interface CodingAgentEvidence {
  hasActionEvidence: boolean;
  providerActionItems: unknown[];
  evidenceSources: string[];
  traceActionSpanCount: number;
  traceSummaryHasActionEvidence: boolean;
}

const getObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const safeStringify = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

function parseProviderRaw(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const providerItemHasActionEvidence = (item: unknown): boolean => {
  const object = getObject(item);
  if (!object) {
    return false;
  }

  const type = getString(object.type);
  return (
    type === 'command_execution' ||
    type === 'file_change' ||
    type === 'mcp_tool_call' ||
    type === 'tool_call' ||
    type === 'function_call'
  );
};

function hasStructuredActionEvidence(value: unknown, depth: number = 0): boolean {
  if (depth > 5) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasStructuredActionEvidence(item, depth + 1));
  }

  const object = getObject(value);
  if (!object) {
    return false;
  }

  if (providerItemHasActionEvidence(object)) {
    return true;
  }

  for (const [key, child] of Object.entries(object)) {
    if (STRUCTURED_ACTION_EVIDENCE_KEYS.has(key)) {
      if (typeof child === 'string' && child.trim()) {
        return true;
      }
      if (Array.isArray(child) && child.length > 0) {
        return true;
      }
      if (getObject(child) && Object.keys(child as Record<string, unknown>).length > 0) {
        return true;
      }
    }

    if (hasStructuredActionEvidence(child, depth + 1)) {
      return true;
    }
  }

  return false;
}

export function getCodingAgentEvidence(
  gradingContext?: RedteamGradingContext,
): CodingAgentEvidence {
  const raw = parseProviderRaw(gradingContext?.providerResponse?.raw);
  const rawObject = getObject(raw);
  const items = Array.isArray(rawObject?.items) ? rawObject.items : [];
  const providerActionItems = items.filter(providerItemHasActionEvidence);
  const providerMetadata = getObject(gradingContext?.providerResponse?.metadata);
  const rawMetadata = getObject(rawObject?.metadata);
  const evidenceSources: string[] = [];

  if (providerActionItems.length > 0) {
    evidenceSources.push('provider_raw.items');
  }

  const structuredSources = [
    ['provider.metadata.codingAgentActions', providerMetadata?.codingAgentActions],
    ['provider.metadata.codingAgentEvidence', providerMetadata?.codingAgentEvidence],
    ['provider.metadata.codingAgentTrace', providerMetadata?.codingAgentTrace],
    ['provider.raw.codingAgentActions', rawObject?.codingAgentActions],
    ['provider.raw.codingAgentEvidence', rawObject?.codingAgentEvidence],
    ['provider.raw.codingAgentTrace', rawObject?.codingAgentTrace],
    ['provider.raw.metadata.codingAgentActions', rawMetadata?.codingAgentActions],
    ['provider.raw.metadata.codingAgentEvidence', rawMetadata?.codingAgentEvidence],
    ['provider.raw.metadata.codingAgentTrace', rawMetadata?.codingAgentTrace],
    ['traceData.metadata', gradingContext?.traceData?.metadata],
  ] as const;

  for (const [source, value] of structuredSources) {
    if (hasStructuredActionEvidence(value)) {
      evidenceSources.push(source);
    }
  }

  const traceActionSpanCount =
    gradingContext?.traceData?.spans?.filter((span) => {
      const text = `${span.name}\n${safeStringify(span.attributes ?? {})}`.toLowerCase();
      return /\b(command|exec|shell|tool|mcp|connector|file|write|network|approval)\b/.test(text);
    }).length ?? 0;

  if (traceActionSpanCount > 0) {
    evidenceSources.push('traceData.spans');
  }

  const traceSummaryHasActionEvidence =
    /\b(command_execution|tool call|mcp tool|file change|approval|network request|executed command)\b/i.test(
      gradingContext?.traceSummary ?? '',
    );

  if (traceSummaryHasActionEvidence) {
    evidenceSources.push('traceSummary');
  }

  return {
    hasActionEvidence: evidenceSources.length > 0,
    providerActionItems,
    evidenceSources,
    traceActionSpanCount,
    traceSummaryHasActionEvidence,
  };
}

export function hasCodingAgentActionEvidence(gradingContext?: RedteamGradingContext): boolean {
  return getCodingAgentEvidence(gradingContext).hasActionEvidence;
}
