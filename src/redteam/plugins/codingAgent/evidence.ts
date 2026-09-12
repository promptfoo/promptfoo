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

const APPROVAL_REQUEST_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'execCommandApproval',
  'applyPatchApproval',
]);

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

export function collectCodingAgentPublicResponseEvidence(gradingContext?: RedteamGradingContext) {
  return Object.entries(gradingContext?.providerResponse ?? {})
    .filter(([key, value]) => key !== 'raw' && value !== undefined)
    .map(([key, value]) => ({ location: `provider ${key}`, value }));
}

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
  if (type === 'web_search_call' || type === 'web_search') {
    return Boolean(getObject(object.action) || getString(object.query));
  }
  if (type === 'code_interpreter_call') {
    return Boolean(getString(object.code));
  }
  if (type === 'command_execution') {
    return Boolean(getString(object.command));
  }
  if (type === 'file_change') {
    return Boolean(
      getString(object.path) ||
        (Array.isArray(object.changes) &&
          object.changes.some((change) => getString(getObject(change)?.path))),
    );
  }
  return (
    [
      'mcp_call',
      'mcp_tool_call',
      'tool',
      'tool_call',
      'function_call',
      'dynamic_tool_call',
    ].includes(type ?? '') && isNamedToolCall(object)
  );
};

function isNamedToolCall(value: unknown): boolean {
  const call = getObject(value);
  return Boolean(
    getString(call?.name) ?? getString(call?.tool) ?? getString(getObject(call?.function)?.name),
  );
}

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
      const hasPayload = (item: unknown): boolean => {
        if (typeof item === 'string') {
          return Boolean(item.trim());
        }
        const action = getObject(item);
        if (!action) {
          return false;
        }
        if (getString(action.type)) {
          return providerItemHasActionEvidence(action);
        }
        return Boolean(
          getString(action.command) ||
            getString(action.path) ||
            getString(action.url) ||
            getString(action.connector) ||
            getString(action.tool) ||
            getString(getObject(action.function)?.name) ||
            ((key === 'toolCalls' || key === 'mcpToolCalls') && isNamedToolCall(action)),
        );
      };
      if ((Array.isArray(child) ? child : [child]).some(hasPayload)) {
        return true;
      }
      if (
        (key === 'toolCalls' || key === 'mcpToolCalls') &&
        getObject(child) &&
        Object.values(getObject(child) ?? {}).some(
          (call) => getObject(call)?.args !== undefined || getObject(call)?.arguments !== undefined,
        )
      ) {
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

  if (
    Array.isArray(rawObject?.serverRequests) &&
    rawObject.serverRequests.some((request) =>
      APPROVAL_REQUEST_METHODS.has(getString(getObject(request)?.method) ?? ''),
    )
  ) {
    evidenceSources.push('provider.raw.serverRequests');
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
    const hasEvidence =
      source === 'provider.metadata.toolCalls'
        ? Array.isArray(value) && value.some(isNamedToolCall)
        : hasStructuredActionEvidence(value);
    if (hasEvidence) {
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

export function collectCodingAgentTraceEvidence(
  context?: RedteamGradingContext,
): { location: string; value: unknown }[] {
  const evidence: { location: string; value: unknown }[] = [];
  if (context?.traceSummary) {
    evidence.push({ location: 'trace summary', value: context.traceSummary });
  }
  const spans = [...(context?.traceData?.spans ?? []), ...(context?.traceContext?.spans ?? [])];
  for (const [index, span] of spans.entries()) {
    for (const [field, value] of [
      ['name', span.name],
      ['attributes', span.attributes ?? {}],
      ['status', 'status' in span ? span.status : span.statusMessage],
      ['events', 'events' in span ? span.events : undefined],
    ] as const) {
      if (value !== undefined) {
        evidence.push({ location: `trace span ${index + 1} ${field}`, value });
      }
    }
  }
  if (context?.traceContext?.insights?.length) {
    evidence.push({ location: 'trace insights', value: context.traceContext.insights });
  }
  return evidence;
}
