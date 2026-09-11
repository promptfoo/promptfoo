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

const TRACE_ACTION_SPAN_NAME_PATTERN =
  /(?:^|[\s._:/-])(?:approval|command|connector|exec|file|mcp|network|shell|tool)(?:$|[\s._:/-])/i;

const TRACE_ACTION_ATTRIBUTE_KEYS = new Set([
  'approval',
  'codex.command',
  'codex.mcp.tool',
  'codex.tool.name',
  'command',
  'command.name',
  'command_name',
  'file.change',
  'file_change',
  'mcp.tool',
  'gen_ai.tool.name',
  'network.request',
  'network_request',
  'tool.name',
  'tool.call',
  'tool_call',
]);

export interface CodingAgentEvidence {
  hasActionEvidence: boolean;
  providerActionItems: unknown[];
  evidenceSources: string[];
  traceActionSpanCount: number;
}

const getObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

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
    type === 'tool' ||
    type === 'tool_call' ||
    type === 'function_call' ||
    type === 'dynamic_tool_call'
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
      if (
        Array.isArray(child) &&
        child.some((item) =>
          typeof item === 'string'
            ? Boolean(item.trim())
            : Boolean(getObject(item) && Object.keys(item as Record<string, unknown>).length),
        )
      ) {
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

function traceSpanHasActionEvidence(span: { name: string; attributes?: Record<string, unknown> }) {
  return (
    TRACE_ACTION_SPAN_NAME_PATTERN.test(span.name) ||
    Object.keys(span.attributes ?? {}).some((key) =>
      TRACE_ACTION_ATTRIBUTE_KEYS.has(key.toLowerCase()),
    )
  );
}

export function getCodingAgentEvidence(
  gradingContext?: RedteamGradingContext,
): CodingAgentEvidence {
  const raw = parseProviderRaw(gradingContext?.providerResponse?.raw);
  const rawObject = getObject(raw);
  const rawData = getObject(rawObject?.data);
  const items = [
    Array.isArray(raw) ? raw : undefined,
    rawObject?.items,
    rawObject?.output,
    rawObject?.parts,
    rawData?.parts,
  ]
    .filter(Array.isArray)
    .flat();
  const providerActionItems = items.filter(providerItemHasActionEvidence);
  const providerMetadata = getObject(gradingContext?.providerResponse?.metadata);
  const rawMetadata = getObject(rawObject?.metadata);
  const evidenceSources: string[] = [];

  if (providerActionItems.length > 0) {
    evidenceSources.push('provider_raw.actions');
  }

  const structuredSources = [
    ['provider.metadata.codingAgentActions', providerMetadata?.codingAgentActions],
    ['provider.metadata.codingAgentEvidence', providerMetadata?.codingAgentEvidence],
    ['provider.metadata.codingAgentTrace', providerMetadata?.codingAgentTrace],
    ['provider.metadata.toolCalls', providerMetadata?.toolCalls],
    ['provider.raw.codingAgentActions', rawObject?.codingAgentActions],
    ['provider.raw.codingAgentEvidence', rawObject?.codingAgentEvidence],
    ['provider.raw.codingAgentTrace', rawObject?.codingAgentTrace],
    ['provider.raw.metadata.codingAgentActions', rawMetadata?.codingAgentActions],
    ['provider.raw.metadata.codingAgentEvidence', rawMetadata?.codingAgentEvidence],
    ['provider.raw.metadata.codingAgentTrace', rawMetadata?.codingAgentTrace],
  ] as const;

  for (const [source, value] of structuredSources) {
    if (
      (source === 'provider.metadata.toolCalls' && Array.isArray(value) && value.length > 0) ||
      hasStructuredActionEvidence(value)
    ) {
      evidenceSources.push(source);
      providerActionItems.push(value);
    }
  }

  const traceActionSpanCount = [
    ...(gradingContext?.traceData?.spans ?? []),
    ...(gradingContext?.traceContext?.spans ?? []),
  ].filter(traceSpanHasActionEvidence).length;

  if (traceActionSpanCount > 0) {
    evidenceSources.push('traceData.spans');
  }

  return {
    hasActionEvidence: evidenceSources.length > 0,
    providerActionItems,
    evidenceSources,
    traceActionSpanCount,
  };
}

export function hasCodingAgentActionEvidence(gradingContext?: RedteamGradingContext): boolean {
  return getCodingAgentEvidence(gradingContext).hasActionEvidence;
}
