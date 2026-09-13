import { normalizePluginId, parseEvidenceCandidates } from './json';

import type { RedteamGradingContext } from '../grading/types';

export type AgentObservationKind =
  | 'approval'
  | 'command'
  | 'connector_call'
  | 'delegation'
  | 'file_read'
  | 'file_write'
  | 'finding'
  | 'guardrail'
  | 'handoff'
  | 'memory_read'
  | 'memory_write'
  | 'message'
  | 'network_request'
  | 'tool_call'
  | 'verifier_change';

export type AgentObservationSource =
  | 'final'
  | 'provider-output'
  | 'provider-raw'
  | 'trace'
  | 'trace-event';

export type AgentObservation = {
  actor?: string;
  callId?: string;
  command?: string;
  connector?: string;
  endTimestamp?: number;
  endTimestampNanos?: string;
  evidence?: string;
  eventId?: string;
  fieldLocations?: Partial<
    Record<'command' | 'evidence' | 'input' | 'output' | 'path' | 'text' | 'tool', string>
  >;
  findingKind?: string;
  from?: string;
  input?: string;
  kind: AgentObservationKind;
  location: string;
  operation?: string;
  outcome?: string;
  output?: string;
  parentSpanId?: string;
  path?: string;
  pluginId?: string;
  severity?: string;
  source: AgentObservationSource;
  spanId?: string;
  spanName?: string;
  timestamp?: number;
  timestampNanos?: string;
  text?: string;
  to?: string;
  tool?: string;
  url?: string;
};

export type AgentRunFinding = {
  evidence?: string;
  kind?: string;
  location?: string;
  pluginId?: string;
  severity?: string;
};

const TOOL_CALL_ID_ATTRIBUTES = ['gen_ai.tool.call.id', 'tool.call.id', 'tool_call_id'];

const AGENTIC_RUNTIME_EVIDENCE_NAMESPACES = [
  {
    pluginIds: ['promptfoo.agentic.plugin_id'],
    json: 'promptfoo.agentic.evidence_json',
    finding: 'promptfoo.agentic.finding.',
  },
  {
    pluginIds: ['promptfoo.agent_sdk.plugin_id'],
    json: 'promptfoo.agent_sdk.evidence_json',
    finding: 'promptfoo.agent_sdk.finding.',
  },
  {
    pluginIds: ['agentic.plugin_id', 'agentic.pluginId'],
    json: 'agentic.evidence_json',
    finding: 'agentic.finding.',
  },
  {
    pluginIds: ['agent.sdk.plugin_id', 'agentSdk.pluginId'],
    json: 'agent.sdk.evidence_json',
    finding: 'agent.sdk.finding.',
  },
  {
    pluginIds: ['agenticPluginId', 'agentic.pluginId'],
    json: 'agenticevidence',
    finding: 'agenticfinding',
  },
  {
    pluginIds: ['agentSdkPluginId', 'agentSdk.pluginId'],
    json: 'agentsdkevidence',
    finding: 'agentsdkfinding',
  },
];

type TraceLikeSpan = {
  attributes?: Record<string, unknown>;
  endTime?: number;
  events?: Array<{
    attributes?: Record<string, unknown>;
    name?: string;
    timestamp?: number;
    timestampNanos?: string;
  }>;
  name?: string;
  parentSpanId?: string;
  spanId?: string;
  startTime?: number;
  statusCode?: number;
  statusMessage?: string;
  status?: { code?: number | string; message?: string };
};

type TraceDataLike = {
  spans?: unknown[];
};

type ProviderResponseLike = {
  output?: unknown;
  raw?: unknown;
};

export const TOOL_NAME_ATTRIBUTE_KEYS = [
  'tool.name',
  'tool_name',
  'tool',
  'function.name',
  'function_name',
  'ai.toolCall.name',
  'gen_ai.tool.name',
  'agent.tool_name',
  'agent.tool',
  'agent.toolName',
  'codex.mcp.tool',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringifyValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isExplicitlyTrue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
  }
  return false;
}

function getAttribute(
  attributes: Record<string, unknown> | undefined,
  keys: readonly string[],
): unknown {
  if (!attributes) {
    return undefined;
  }

  for (const key of keys) {
    if (attributes[key] !== undefined) {
      return attributes[key];
    }
  }

  const lowerCaseEntries = Object.entries(attributes).map(([key, value]) => [
    key.toLowerCase(),
    value,
  ]);
  for (const key of keys) {
    const match = lowerCaseEntries.find(([candidate]) => candidate === key.toLowerCase());
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function getToolNameFromAttributes(
  attributes: Record<string, unknown> | undefined,
): string | undefined {
  if (!attributes) {
    return undefined;
  }

  for (const key of TOOL_NAME_ATTRIBUTE_KEYS) {
    const value = attributes[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function parseRawValue(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function traceAttributeField(
  normalizedAttributeName: string,
):
  | { field: 'command'; kind: 'command' }
  | { field: 'input' | 'output' | 'tool'; kind: 'tool_call' }
  | { field: 'output'; kind: 'command' }
  | { field: 'text'; kind: 'message' }
  | undefined {
  if (
    normalizedAttributeName === 'codex.output' ||
    normalizedAttributeName.includes('command.output') ||
    normalizedAttributeName.endsWith('.stdout') ||
    normalizedAttributeName.endsWith('.stderr')
  ) {
    return { field: 'output', kind: 'command' };
  }

  if (
    normalizedAttributeName.includes('tool.output') ||
    normalizedAttributeName.includes('tool.result') ||
    normalizedAttributeName === 'gen_ai.tool.call.result' ||
    normalizedAttributeName === 'ai.toolcall.result' ||
    normalizedAttributeName === 'langfuse.output' ||
    normalizedAttributeName === 'braintrust.output'
  ) {
    return { field: 'output', kind: 'tool_call' };
  }

  if (
    normalizedAttributeName === 'codex.message' ||
    normalizedAttributeName.includes('agent.message') ||
    normalizedAttributeName.includes('assistant.message') ||
    normalizedAttributeName.includes('final.response') ||
    normalizedAttributeName.includes('response.output') ||
    normalizedAttributeName.includes('completion')
  ) {
    return { field: 'text', kind: 'message' };
  }

  if (
    normalizedAttributeName === 'codex.command' ||
    normalizedAttributeName === 'command' ||
    normalizedAttributeName === 'command_name' ||
    normalizedAttributeName.includes('command.line') ||
    normalizedAttributeName.includes('command.name')
  ) {
    return { field: 'command', kind: 'command' };
  }

  if (
    normalizedAttributeName === 'tool.name' ||
    normalizedAttributeName === 'gen_ai.tool.name' ||
    normalizedAttributeName === 'codex.tool.name' ||
    normalizedAttributeName === 'codex.mcp.tool' ||
    normalizedAttributeName === 'mcp.tool.name' ||
    normalizedAttributeName.endsWith('.tool.name')
  ) {
    return { field: 'tool', kind: 'tool_call' };
  }

  if (
    normalizedAttributeName === 'tool.input' ||
    normalizedAttributeName === 'gen_ai.tool.call.arguments' ||
    normalizedAttributeName === 'function.arguments' ||
    normalizedAttributeName === 'ai.toolcall.args' ||
    normalizedAttributeName.includes('tool.args') ||
    normalizedAttributeName.includes('tool.arguments') ||
    normalizedAttributeName.includes('tool.input') ||
    normalizedAttributeName === 'codex.mcp.input'
  ) {
    return { field: 'input', kind: 'tool_call' };
  }

  return undefined;
}

function inferredToolFromSpanName(spanName?: string): string | undefined {
  const normalized = spanName?.trim();
  if (!normalized) {
    return undefined;
  }
  const match = /^tool\s+(.+)$/i.exec(normalized);
  if (match?.[1]) {
    return match[1].trim();
  }
  return undefined;
}

export function hasErrorStatus(span: TraceLikeSpan): boolean {
  const attributes = span.attributes ?? {};
  const statusCode = span.statusCode ?? span.status?.code;
  return (
    statusCode === 2 ||
    Number(attributes['otel.log.severity_number']) >= 17 ||
    [
      statusCode,
      span.statusMessage,
      span.status?.message,
      attributes['otel.log.severity_text'],
    ].some((value) => /^(?:STATUS_CODE_)?(?:ERROR|FATAL)[1-4]?$/i.test(String(value)))
  );
}

function controlObservationFromSpan(
  span: TraceLikeSpan,
  location: string,
  source: AgentObservationSource,
): AgentObservation | undefined {
  const attributes = span.attributes || {};
  const name = span.name?.toLowerCase() || '';
  const spanType = stringifyValue(attributes['openai.agents.span_type'])?.toLowerCase();
  const guardrailDecision = getAttribute(attributes, ['guardrails.decision', 'guardrail.decision']);
  const failed = hasErrorStatus(span);

  if (
    name.includes('guardrail') ||
    spanType === 'guardrail' ||
    Boolean(attributes['guardrail.name']) ||
    guardrailDecision !== undefined
  ) {
    return {
      kind: 'guardrail',
      callId: getString(getAttribute(attributes, TOOL_CALL_ID_ATTRIBUTES)),
      endTimestamp: span.endTime,
      tool: getToolNameFromAttributes(attributes),
      location,
      outcome: failed
        ? 'error'
        : isExplicitlyTrue(attributes['guardrail.triggered'])
          ? 'blocked'
          : stringifyValue(
              guardrailDecision ??
                getAttribute(attributes, ['guardrail.outcome']) ??
                attributes['codex.status'],
            ),
      parentSpanId: span.parentSpanId,
      source,
      spanId: span.spanId,
      spanName: span.name,
      timestamp: span.startTime,
      text: stringifyValue(attributes['guardrail.name']) ?? span.name,
    };
  }

  if (
    name.includes('approval') ||
    spanType === 'approval' ||
    isExplicitlyTrue(attributes['approval.required'])
  ) {
    return {
      kind: 'approval',
      callId: getString(getAttribute(attributes, TOOL_CALL_ID_ATTRIBUTES)),
      endTimestamp: span.endTime,
      tool: getToolNameFromAttributes(attributes),
      location,
      outcome: failed ? 'error' : stringifyValue(attributes['approval.outcome']),
      parentSpanId: span.parentSpanId,
      source,
      spanId: span.spanId,
      spanName: span.name,
      timestamp: span.startTime,
      text: span.name,
    };
  }

  return undefined;
}

export function getTraceEvidenceValues(
  attributes: Record<string, unknown> | undefined,
  enclosingAttributes?: Record<string, unknown>,
): unknown[] {
  const entries = Object.entries(attributes ?? {});
  const values: unknown[] = [];
  for (const namespace of AGENTIC_RUNTIME_EVIDENCE_NAMESPACES) {
    const idKeys = namespace.pluginIds.map((key) => key.toLowerCase());
    const ownIds = entries.filter(
      ([key, value]) => value !== undefined && idKeys.includes(key.toLowerCase()),
    );
    const json = entries.filter(
      ([key, value]) => value !== undefined && key.toLowerCase() === namespace.json,
    );
    const finding = Object.fromEntries(
      ['kind', 'location', 'evidence', 'severity'].map((field) => [
        field,
        getAttribute(attributes, [namespace.finding + field]),
      ]),
    );
    const hasFinding = Object.values(finding).some((value) => value !== undefined);
    if (!json.length && !hasFinding && !ownIds.length) {
      continue;
    }
    const explicitIds = ownIds
      .map(([, value]) => normalizePluginId(value))
      .filter((id): id is string => id !== undefined);
    const ids = explicitIds.length
      ? explicitIds
      : Object.entries(enclosingAttributes ?? {})
          .filter(([key]) => idKeys.includes(key.toLowerCase()))
          .map(([, value]) => normalizePluginId(value))
          .filter((id): id is string => id !== undefined);
    const pluginIds = [...new Set(ids)];
    if (pluginIds.length > 1) {
      throw new Error('Agentic trace evidence has conflicting plugin IDs and cannot be graded');
    }
    const pluginId = pluginIds[0];
    values.push(
      ...json.map(([, value]) =>
        pluginId === undefined ? value : { pluginId, agenticEvidence: value },
      ),
    );
    if (hasFinding) {
      values.push({ pluginId, findings: [finding] });
    } else if (json.length === 0) {
      values.push({ pluginId });
    }
  }
  return values;
}

function findingObservationsFromAttributes(
  attributes: Record<string, unknown> | undefined,
  location: string,
  source: AgentObservationSource,
  span?: TraceLikeSpan,
  enclosingAttributes?: Record<string, unknown>,
): AgentObservation[] {
  const observations: AgentObservation[] = [];
  const parsedEvidenceCandidates = parseEvidenceCandidates(
    getTraceEvidenceValues(attributes, enclosingAttributes),
  );

  for (const parsedEvidence of parsedEvidenceCandidates) {
    if (!Array.isArray(parsedEvidence.findings)) {
      continue;
    }
    parsedEvidence.findings.filter(isRecord).forEach((finding, index) => {
      observations.push({
        evidence: stringifyValue(finding.evidence),
        fieldLocations: { evidence: location },
        findingKind: stringifyValue(finding.kind),
        kind: 'finding',
        location: stringifyValue(finding.location) || `${location} finding ${index + 1}`,
        pluginId: normalizePluginId(finding.pluginId) ?? normalizePluginId(parsedEvidence.pluginId),
        parentSpanId: span?.parentSpanId,
        severity: stringifyValue(finding.severity),
        source,
        spanId: span?.spanId,
        spanName: span?.name,
        timestamp: span?.startTime,
        text: stringifyValue(finding.evidence),
      });
    });
  }

  return dedupeFindingObservations(observations);
}

function dedupeFindingObservations(observations: AgentObservation[]): AgentObservation[] {
  const seen = new Set<string>();
  return observations.filter((observation) => {
    const key = JSON.stringify([
      observation.pluginId,
      observation.findingKind,
      observation.location,
      observation.evidence,
      observation.severity,
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizedToolObservationsFromAttributes(
  attributes: Record<string, unknown> | undefined,
  baseLocation: string,
  source: AgentObservationSource,
  span?: TraceLikeSpan,
): AgentObservation[] {
  const tool = getToolNameFromAttributes(attributes);
  const callId = getString(getAttribute(attributes, TOOL_CALL_ID_ATTRIBUTES));
  return tool
    ? [
        {
          callId,
          fieldLocations: { tool: baseLocation },
          kind: 'tool_call',
          location: baseLocation,
          parentSpanId: span?.parentSpanId,
          source,
          spanId: span?.spanId,
          spanName: span?.name,
          timestamp: span?.startTime,
          tool,
        },
      ]
    : [];
}

function isDuplicateNormalizedToolObservation(
  mapped: ReturnType<typeof traceAttributeField>,
  value: string,
  normalizedToolName?: string,
): boolean {
  return mapped?.kind === 'tool_call' && mapped.field === 'tool' && value === normalizedToolName;
}

function observationFromMappedTraceAttribute(
  mapped: NonNullable<ReturnType<typeof traceAttributeField>>,
  value: string,
  location: string,
  source: AgentObservationSource,
  span?: TraceLikeSpan,
): AgentObservation {
  const baseObservation = {
    callId: getString(getAttribute(span?.attributes, TOOL_CALL_ID_ATTRIBUTES)),
    fieldLocations: { [mapped.field]: location },
    location,
    parentSpanId: span?.parentSpanId,
    source,
    spanId: span?.spanId,
    spanName: span?.name,
    timestamp: span?.startTime,
  } satisfies Partial<AgentObservation>;

  if (mapped.kind === 'command') {
    return {
      ...baseObservation,
      command: mapped.field === 'command' ? value : undefined,
      kind: 'command',
      output: mapped.field === 'output' ? value : undefined,
      text: value,
    };
  }
  if (mapped.kind === 'message') {
    return {
      ...baseObservation,
      kind: 'message',
      text: value,
    };
  }
  return {
    ...baseObservation,
    input: mapped.field === 'input' ? value : undefined,
    kind: 'tool_call',
    output: mapped.field === 'output' ? value : undefined,
    text: mapped.field === 'output' ? value : undefined,
    tool: mapped.field === 'tool' ? value : undefined,
  };
}

function observationsFromTraceAttributes(
  attributes: Record<string, unknown> | undefined,
  baseLocation: string,
  source: AgentObservationSource,
  span?: TraceLikeSpan,
  enclosingAttributes?: Record<string, unknown>,
): AgentObservation[] {
  const observations: AgentObservation[] = findingObservationsFromAttributes(
    attributes,
    baseLocation,
    source,
    span,
    enclosingAttributes,
  );
  const spanType = stringifyValue(attributes?.['openai.agents.span_type'])?.toLowerCase();
  const dedicatedControl =
    spanType === 'guardrail' ||
    spanType === 'approval' ||
    (!inferredToolFromSpanName(span?.name) &&
      /(?:^|[.\s:/_-])(?:guardrail|approval)(?:$|[.\s:/_-])/i.test(span?.name ?? ''));
  const normalizedToolObservations = dedicatedControl
    ? []
    : normalizedToolObservationsFromAttributes(attributes, baseLocation, source, span);
  observations.push(...normalizedToolObservations);
  const normalizedToolName = normalizedToolObservations[0]?.tool;

  for (const [attributeName, attributeValue] of Object.entries(attributes ?? {})) {
    const value = stringifyValue(attributeValue);
    if (!value) {
      continue;
    }

    const normalizedAttributeName = attributeName.toLowerCase();
    const mapped = traceAttributeField(normalizedAttributeName);
    if (!mapped || (dedicatedControl && mapped.kind === 'tool_call' && mapped.field === 'tool')) {
      continue;
    }
    if (isDuplicateNormalizedToolObservation(mapped, value, normalizedToolName)) {
      continue;
    }

    const location = `${baseLocation} attribute ${attributeName}`;
    observations.push(observationFromMappedTraceAttribute(mapped, value, location, source, span));
  }

  const spanTool = inferredToolFromSpanName(span?.name);
  if (spanTool && !dedicatedControl) {
    observations.push({
      callId: getString(getAttribute(attributes, TOOL_CALL_ID_ATTRIBUTES)),
      fieldLocations: { tool: baseLocation },
      kind: 'tool_call',
      location: baseLocation,
      parentSpanId: span?.parentSpanId,
      source,
      spanId: span?.spanId,
      spanName: span?.name,
      timestamp: span?.startTime,
      tool: spanTool,
    });
  }

  return observations;
}

function nanosecondTimestamp(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^\d{1,20}$/.test(value) &&
    BigInt(value) > 0n &&
    BigInt(value) <= 0xffffffffffffffffn
    ? value
    : undefined;
}

export function observationsFromTraceData(
  traceData?: TraceDataLike | null,
  source: AgentObservationSource = 'trace',
): AgentObservation[] {
  if (!traceData?.spans) {
    return [];
  }

  const observations: AgentObservation[] = [];
  const append = (batch: AgentObservation[]) => {
    if (observations.length + batch.length > 1000) {
      throw new Error('Agentic trace exceeds 1000 observations and cannot be graded');
    }
    observations.push(...batch);
  };
  traceData.spans.forEach((span, spanIndex) => {
    const traceSpan = span as TraceLikeSpan;
    const spanLocation = `trace span ${spanIndex + 1}`;
    const logTimestamp = traceSpan.attributes?.['otel.log.time_unix_nano'];
    const isLog = Object.keys(traceSpan.attributes ?? {}).some((key) =>
      key.startsWith('otel.log.'),
    );
    const spanSource = isLog ? 'trace-event' : source;
    const controlObservation = controlObservationFromSpan(traceSpan, spanLocation, spanSource);
    const spanObservations = [
      ...(controlObservation ? [controlObservation] : []),
      ...observationsFromTraceAttributes(traceSpan.attributes, spanLocation, spanSource, traceSpan),
    ];
    const startNanos = isLog
      ? logTimestamp
      : traceSpan.attributes?.['otel.span.start_time_unix_nano'];
    const endNanos = isLog ? startNanos : traceSpan.attributes?.['otel.span.end_time_unix_nano'];
    const timestampNanos = nanosecondTimestamp(startNanos);
    const endTimestampNanos = nanosecondTimestamp(endNanos);
    append(
      spanObservations.map((observation) => ({
        ...observation,
        ...(isLog && { eventId: traceSpan.spanId ?? spanLocation }),
        ...((isLog || startNanos !== undefined) && !timestampNanos && { timestamp: undefined }),
        ...((isLog || endNanos !== undefined) && !endTimestampNanos && { endTimestamp: undefined }),
        timestampNanos,
        endTimestampNanos,
      })),
    );

    traceSpan.events?.forEach((event, eventIndex) => {
      const timestampNanos = nanosecondTimestamp(event.timestampNanos);
      const eventLocation = `${spanLocation} event ${eventIndex + 1}`;
      const callId =
        getAttribute(event.attributes, TOOL_CALL_ID_ATTRIBUTES) ??
        getAttribute(traceSpan.attributes, TOOL_CALL_ID_ATTRIBUTES);
      const eventSpan = {
        attributes: {
          ...(callId === undefined ? {} : { 'gen_ai.tool.call.id': callId }),
          ...event.attributes,
        },
        name: event.name,
        parentSpanId: traceSpan.parentSpanId,
        spanId: traceSpan.spanId,
        startTime:
          event.timestampNanos !== undefined && !timestampNanos ? undefined : event.timestamp,
        statusCode: hasErrorStatus(traceSpan) ? 2 : traceSpan.statusCode,
      };
      const eventControlObservation = controlObservationFromSpan(
        eventSpan,
        eventLocation,
        'trace-event',
      );
      if (eventControlObservation) {
        append([{ ...eventControlObservation, eventId: eventLocation, timestampNanos }]);
      }
      append(
        observationsFromTraceAttributes(
          eventSpan.attributes,
          eventLocation,
          'trace-event',
          eventSpan,
          traceSpan.attributes,
        ).map((observation) => ({ ...observation, eventId: eventLocation, timestampNanos })),
      );
    });
  });

  return observations;
}

function messageObservationFromProviderRawItem(
  item: Record<string, unknown>,
  type: string | undefined,
  itemNumber: number,
): AgentObservation | undefined {
  if (type !== 'agent_message' && type !== 'agentMessage') {
    return undefined;
  }
  const text = getString(item.text);
  if (!text) {
    return undefined;
  }
  return {
    fieldLocations: { text: `provider raw item ${itemNumber} agent message` },
    kind: 'message',
    location: `provider raw item ${itemNumber} agent message`,
    source: 'provider-raw',
    text,
  };
}

function commandObservationFromProviderRawItem(
  item: Record<string, unknown>,
  type: string | undefined,
  itemNumber: number,
): AgentObservation | undefined {
  if (type !== 'command_execution' && type !== 'commandExecution') {
    return undefined;
  }
  const command = getString(item.command);
  const output = getString(item.aggregated_output) ?? getString(item.aggregatedOutput);
  return {
    command,
    fieldLocations: {
      command: command ? `provider raw item ${itemNumber} command` : undefined,
      output: output ? `provider raw item ${itemNumber} command output` : undefined,
    },
    kind: 'command',
    location: `provider raw item ${itemNumber} command execution`,
    output,
    source: 'provider-raw',
    text: output ?? command,
  };
}

function toolObservationFromProviderRawItem(
  item: Record<string, unknown>,
  type: string | undefined,
  itemNumber: number,
): AgentObservation | undefined {
  if (
    type !== 'mcp_tool_call' &&
    type !== 'mcpToolCall' &&
    type !== 'dynamicToolCall' &&
    type !== 'dynamic_tool_call'
  ) {
    return undefined;
  }
  const server = getString(item.server);
  const tool = getString(item.tool) ?? getString(item.name);
  const input = stringifyValue(item.arguments ?? item.args ?? item.input);
  const output = stringifyValue(
    item.output ?? item.result ?? item.content_items ?? item.contentItems ?? item.error,
  );
  return {
    connector: server,
    fieldLocations: {
      input: input ? `provider raw item ${itemNumber} tool input` : undefined,
      output: output ? `provider raw item ${itemNumber} tool output` : undefined,
      tool: tool ? `provider raw item ${itemNumber} tool` : undefined,
    },
    input,
    kind: server ? 'connector_call' : 'tool_call',
    location: `provider raw item ${itemNumber} tool call`,
    operation: tool,
    output,
    source: 'provider-raw',
    text: output ?? input,
    tool,
  };
}

function fileWriteObservationsFromProviderRawItem(
  item: Record<string, unknown>,
  type: string | undefined,
  itemNumber: number,
): AgentObservation[] {
  if (type !== 'file_change' && type !== 'fileChange') {
    return [];
  }
  const changes = Array.isArray(item.changes) ? item.changes : [];
  return changes.flatMap((change, changeIndex) => {
    const changeObject = isRecord(change) ? change : undefined;
    const filePath = getString(changeObject?.path);
    if (!filePath) {
      return [];
    }
    const location = `provider raw item ${itemNumber} file change ${changeIndex + 1}`;
    return [
      {
        fieldLocations: { path: location },
        kind: 'file_write' as const,
        location,
        path: filePath,
        source: 'provider-raw' as const,
        text: filePath,
      },
    ];
  });
}

function observationsFromProviderRawItem(item: unknown, index: number): AgentObservation[] {
  if (!isRecord(item)) {
    return [];
  }

  const type = getString(item.type);
  const itemNumber = index + 1;
  return [
    messageObservationFromProviderRawItem(item, type, itemNumber),
    commandObservationFromProviderRawItem(item, type, itemNumber),
    toolObservationFromProviderRawItem(item, type, itemNumber),
    ...fileWriteObservationsFromProviderRawItem(item, type, itemNumber),
  ].filter((observation): observation is AgentObservation => Boolean(observation));
}

export function observationsFromProviderRaw(raw: unknown): AgentObservation[] {
  const parsed = parseRawValue(raw);
  const object = isRecord(parsed) ? parsed : undefined;
  if (!object) {
    return [];
  }

  const observations: AgentObservation[] = [];
  const finalResponse = getString(object.finalResponse);
  if (finalResponse) {
    observations.push({
      fieldLocations: { text: 'provider raw final response' },
      kind: 'message',
      location: 'provider raw final response',
      source: 'provider-raw',
      text: finalResponse,
    });
  }

  const items = Array.isArray(object.items) ? object.items : [];
  items.forEach((item, index) =>
    observations.push(...observationsFromProviderRawItem(item, index)),
  );

  return observations;
}

export function observationsFromProviderResponse(
  providerResponse?: ProviderResponseLike,
): AgentObservation[] {
  const observations: AgentObservation[] = [];

  if (typeof providerResponse?.output === 'string' && providerResponse.output.trim()) {
    observations.push({
      fieldLocations: { text: 'provider output' },
      kind: 'message',
      location: 'provider output',
      source: 'provider-output',
      text: providerResponse.output,
    });
  }

  observations.push(...observationsFromProviderRaw(providerResponse?.raw));
  return observations;
}

export function observationsFromGradingContext({
  gradingContext,
  llmOutput,
}: {
  gradingContext?: RedteamGradingContext;
  llmOutput?: string;
}): AgentObservation[] {
  const observations: AgentObservation[] = [];
  if (typeof llmOutput === 'string' && llmOutput.trim()) {
    observations.push({
      fieldLocations: { text: 'final output' },
      kind: 'message',
      location: 'final output',
      source: 'final',
      text: llmOutput,
    });
  }

  observations.push(...observationsFromProviderResponse(gradingContext?.providerResponse));
  observations.push(...observationsFromTraceData(gradingContext?.traceData));
  observations.push(...observationsFromTraceData(gradingContext?.traceContext));
  return observations;
}

export function findingsFromObservations(observations: AgentObservation[]): AgentRunFinding[] {
  return observations
    .filter((observation) => observation.kind === 'finding')
    .map((observation) => ({
      evidence: observation.evidence ?? observation.text,
      kind: observation.findingKind,
      location: observation.location,
      pluginId: observation.pluginId,
      severity: observation.severity,
    }));
}
