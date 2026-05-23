import { extractJsonObjects } from '../../util/json';

import type { TraceContextData } from '../../tracing/traceContext';
import type { ProviderResponse } from '../../types/providers';
import type { TraceData } from '../../types/tracing';
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
  command?: string;
  connector?: string;
  evidence?: string;
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
  path?: string;
  pluginId?: string;
  severity?: string;
  source: AgentObservationSource;
  spanId?: string;
  spanName?: string;
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

const PLUGIN_PREFIX = 'promptfoo:redteam:';

const AGENTIC_RUNTIME_PLUGIN_ID_ATTRS = [
  'promptfoo.agentic.plugin_id',
  'promptfoo.agent_sdk.plugin_id',
  'agentic.plugin_id',
  'agent.sdk.plugin_id',
  'agentic.pluginId',
  'agentSdk.pluginId',
  'agenticPluginId',
  'agentSdkPluginId',
];
const AGENTIC_RUNTIME_FINDING_KIND_ATTRS = [
  'promptfoo.agentic.finding.kind',
  'promptfoo.agent_sdk.finding.kind',
  'agentic.finding.kind',
  'agent.sdk.finding.kind',
  'agenticFindingKind',
  'agentSdkFindingKind',
];
const AGENTIC_RUNTIME_FINDING_LOCATION_ATTRS = [
  'promptfoo.agentic.finding.location',
  'promptfoo.agent_sdk.finding.location',
  'agentic.finding.location',
  'agent.sdk.finding.location',
  'agenticFindingLocation',
  'agentSdkFindingLocation',
];
const AGENTIC_RUNTIME_FINDING_EVIDENCE_ATTRS = [
  'promptfoo.agentic.finding.evidence',
  'promptfoo.agent_sdk.finding.evidence',
  'agentic.finding.evidence',
  'agent.sdk.finding.evidence',
  'agenticFindingEvidence',
  'agentSdkFindingEvidence',
];
const AGENTIC_RUNTIME_FINDING_SEVERITY_ATTRS = [
  'promptfoo.agentic.finding.severity',
  'promptfoo.agent_sdk.finding.severity',
  'agentic.finding.severity',
  'agent.sdk.finding.severity',
  'agenticFindingSeverity',
  'agentSdkFindingSeverity',
];
const AGENTIC_RUNTIME_EVIDENCE_JSON_ATTRS = [
  'promptfoo.agentic.evidence_json',
  'promptfoo.agent_sdk.evidence_json',
  'agentic.evidence_json',
  'agent.sdk.evidence_json',
  'agenticEvidence',
  'agentSdkEvidence',
];

type TraceLikeSpan = {
  attributes?: Record<string, unknown>;
  events?: Array<{
    attributes?: Record<string, unknown>;
    name?: string;
  }>;
  name?: string;
  spanId?: string;
};

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

function normalizePluginId(pluginId: unknown): string | undefined {
  const value = stringifyValue(pluginId);
  if (!value) {
    return undefined;
  }
  return value.startsWith(PLUGIN_PREFIX) ? value.slice(PLUGIN_PREFIX.length) : value;
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

function parseAgentEvidenceCandidates(
  value: unknown,
): { findings?: AgentRunFinding[]; pluginId?: unknown }[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseAgentEvidenceCandidates(item));
  }

  if (isRecord(value)) {
    const nested = value.agenticEvidence ?? value.agentSdkEvidence;
    if (nested !== undefined) {
      return parseAgentEvidenceCandidates(nested);
    }
    return [value as { findings?: AgentRunFinding[] }];
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    return parseAgentEvidenceCandidates(JSON.parse(value));
  } catch {
    const candidates: { findings?: AgentRunFinding[]; pluginId?: unknown }[] = [];
    let untaggedValue = value;
    const tagPatterns = [
      /<AgenticRuntimeEvidence>([\s\S]*?)<\/AgenticRuntimeEvidence>/gi,
      /<AgenticEvidence>([\s\S]*?)<\/AgenticEvidence>/gi,
      /<AgentSdkEvidence>([\s\S]*?)<\/AgentSdkEvidence>/gi,
    ];
    for (const pattern of tagPatterns) {
      for (const tagged of value.matchAll(pattern)) {
        candidates.push(...parseAgentEvidenceCandidates(tagged[1]));
      }
      untaggedValue = untaggedValue.replace(pattern, '');
    }

    for (const object of extractJsonObjects(untaggedValue)) {
      const evidence = parseAgentEvidenceCandidates(object)[0];
      if (evidence?.findings) {
        candidates.push(evidence);
      }
    }

    return candidates;
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

  if (normalizedAttributeName.includes('tool.output')) {
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

function controlObservationFromSpan(
  span: TraceLikeSpan,
  spanIndex: number,
  source: AgentObservationSource,
): AgentObservation | undefined {
  const attributes = span.attributes || {};
  const name = span.name?.toLowerCase() || '';
  const spanType = stringifyValue(attributes['openai.agents.span_type'])?.toLowerCase();
  const location = `trace span ${spanIndex + 1}`;
  const guardrailDecision = getAttribute(attributes, ['guardrails.decision', 'guardrail.decision']);

  if (
    name.includes('guardrail') ||
    spanType === 'guardrail' ||
    Boolean(attributes['guardrail.name']) ||
    guardrailDecision !== undefined
  ) {
    return {
      kind: 'guardrail',
      location,
      outcome: stringifyValue(
        guardrailDecision ??
          getAttribute(attributes, ['guardrail.outcome']) ??
          attributes['codex.status'],
      ),
      source,
      spanId: span.spanId,
      spanName: span.name,
      text: span.name,
    };
  }

  if (
    name.includes('approval') ||
    spanType === 'approval' ||
    isExplicitlyTrue(attributes['approval.required'])
  ) {
    return {
      kind: 'approval',
      location,
      outcome: stringifyValue(attributes['approval.outcome'] ?? attributes['codex.status']),
      source,
      spanId: span.spanId,
      spanName: span.name,
      text: span.name,
    };
  }

  return undefined;
}

function findingObservationsFromAttributes(
  attributes: Record<string, unknown> | undefined,
  location: string,
  source: AgentObservationSource,
  span?: TraceLikeSpan,
): AgentObservation[] {
  const observations: AgentObservation[] = [];
  const evidenceJson = getAttribute(attributes, AGENTIC_RUNTIME_EVIDENCE_JSON_ATTRS);
  const parsedEvidenceCandidates = parseAgentEvidenceCandidates(evidenceJson);

  if (parsedEvidenceCandidates.some((evidence) => Array.isArray(evidence.findings))) {
    parsedEvidenceCandidates.forEach((parsedEvidence) => {
      parsedEvidence.findings?.forEach((finding, index) => {
        observations.push({
          evidence: stringifyValue(finding.evidence),
          fieldLocations: { evidence: location },
          findingKind: stringifyValue(finding.kind),
          kind: 'finding',
          location: `${location} finding ${index + 1}`,
          pluginId:
            normalizePluginId(finding.pluginId) ?? normalizePluginId(parsedEvidence.pluginId),
          severity: stringifyValue(finding.severity),
          source,
          spanId: span?.spanId,
          spanName: span?.name,
          text: stringifyValue(finding.evidence),
        });
      });
    });
    if (observations.length > 0) {
      return observations;
    }
  }

  const pluginId = normalizePluginId(getAttribute(attributes, AGENTIC_RUNTIME_PLUGIN_ID_ATTRS));
  if (!pluginId) {
    return observations;
  }

  const findingEvidence = stringifyValue(
    getAttribute(attributes, AGENTIC_RUNTIME_FINDING_EVIDENCE_ATTRS),
  );
  const findingKind = stringifyValue(getAttribute(attributes, AGENTIC_RUNTIME_FINDING_KIND_ATTRS));
  const findingLocation = stringifyValue(
    getAttribute(attributes, AGENTIC_RUNTIME_FINDING_LOCATION_ATTRS),
  );
  const findingSeverity = stringifyValue(
    getAttribute(attributes, AGENTIC_RUNTIME_FINDING_SEVERITY_ATTRS),
  );
  if (!findingEvidence && !findingKind && !findingLocation && !findingSeverity) {
    return observations;
  }

  observations.push({
    evidence: findingEvidence,
    fieldLocations: { evidence: location },
    findingKind,
    kind: 'finding',
    location: findingLocation || location,
    pluginId,
    severity: findingSeverity,
    source,
    spanId: span?.spanId,
    spanName: span?.name,
    text: findingEvidence,
  });

  return observations;
}

function observationsFromTraceAttributes(
  attributes: Record<string, unknown> | undefined,
  baseLocation: string,
  source: AgentObservationSource,
  span?: TraceLikeSpan,
): AgentObservation[] {
  const observations: AgentObservation[] = findingObservationsFromAttributes(
    attributes,
    baseLocation,
    source,
    span,
  );

  for (const [attributeName, attributeValue] of Object.entries(attributes ?? {})) {
    const value = stringifyValue(attributeValue);
    if (!value) {
      continue;
    }

    const normalizedAttributeName = attributeName.toLowerCase();
    const mapped = traceAttributeField(normalizedAttributeName);
    if (!mapped) {
      continue;
    }

    const location = `${baseLocation} attribute ${attributeName}`;
    const baseObservation = {
      fieldLocations: { [mapped.field]: location },
      location,
      source,
      spanId: span?.spanId,
      spanName: span?.name,
    } satisfies Partial<AgentObservation>;

    if (mapped.kind === 'command') {
      observations.push({
        ...baseObservation,
        command: mapped.field === 'command' ? value : undefined,
        kind: 'command',
        output: mapped.field === 'output' ? value : undefined,
        text: value,
      });
    } else if (mapped.kind === 'message') {
      observations.push({
        ...baseObservation,
        kind: 'message',
        text: value,
      });
    } else {
      observations.push({
        ...baseObservation,
        input: mapped.field === 'input' ? value : undefined,
        kind: 'tool_call',
        output: mapped.field === 'output' ? value : undefined,
        text: mapped.field === 'output' ? value : undefined,
        tool: mapped.field === 'tool' ? value : undefined,
      });
    }
  }

  const spanTool = inferredToolFromSpanName(span?.name);
  if (spanTool) {
    observations.push({
      fieldLocations: { tool: baseLocation },
      kind: 'tool_call',
      location: baseLocation,
      source,
      spanId: span?.spanId,
      spanName: span?.name,
      tool: spanTool,
    });
  }

  return observations;
}

export function observationsFromTraceData(
  traceData?: Pick<TraceData, 'spans'> | Pick<TraceContextData, 'spans'> | null,
  source: AgentObservationSource = 'trace',
): AgentObservation[] {
  if (!traceData?.spans) {
    return [];
  }

  const observations: AgentObservation[] = [];
  traceData.spans.forEach((span, spanIndex) => {
    const traceSpan = span as TraceLikeSpan;
    const controlObservation = controlObservationFromSpan(traceSpan, spanIndex, source);
    if (controlObservation) {
      observations.push(controlObservation);
    }

    observations.push(
      ...observationsFromTraceAttributes(
        traceSpan.attributes,
        `trace span ${spanIndex + 1}`,
        source,
        traceSpan,
      ),
    );

    traceSpan.events?.forEach((event) => {
      observations.push(
        ...observationsFromTraceAttributes(
          event.attributes,
          `trace span ${spanIndex + 1} event ${event.name || 'event'}`,
          'trace-event',
          traceSpan,
        ),
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
  if (type !== 'mcp_tool_call' && type !== 'mcpToolCall' && type !== 'dynamicToolCall') {
    return undefined;
  }
  const server = getString(item.server);
  const tool = getString(item.tool) ?? getString(item.name);
  const input = stringifyValue(item.arguments ?? item.args ?? item.input);
  const output = stringifyValue(item.output ?? item.result ?? item.error);
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
  providerResponse?: ProviderResponse,
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
      location: observation.fieldLocations?.evidence ?? observation.location,
      pluginId: observation.pluginId,
      severity: observation.severity,
    }));
}
