import { isDeepStrictEqual } from 'node:util';

import { getLocalEvaluatorSpans, SPAN_ROLE_ATTRIBUTE } from '../tracing/spanRoles';
import {
  COMMAND_ATTRIBUTE_KEYS,
  getFirstStringAttribute,
  getToolNameFromAttributes,
  SEARCH_ATTRIBUTE_KEYS,
  TOOL_ARGUMENT_ATTRIBUTE_KEYS,
} from '../tracing/toolAttributes';
import { matchesPattern } from './traceUtils';

import type { TraceData, TraceSpan } from '../types/tracing';

export type TrajectoryStepType = 'command' | 'message' | 'reasoning' | 'search' | 'span' | 'tool';

export interface TrajectoryStepMatcher {
  name?: string;
  pattern?: string;
  type?: TrajectoryStepType | TrajectoryStepType[];
}

export interface TrajectoryStep {
  aliases: string[];
  args?: unknown;
  attributes?: TraceSpan['attributes'];
  name: string;
  spanName: string;
  statusCode?: number;
  statusMessage?: string;
  type: TrajectoryStepType;
}

const EXIT_CODE_ATTRIBUTE = /(?:^|[._])exit[._]?code$/i;
const GENERIC_QUERY_ATTRIBUTE_KEYS = ['query'] as const;
const DEFAULT_COMMAND_TOOL_NAMES = ['exec_command', 'local_shell', 'shell'] as const;

function resolveCommandToolNames(extra: readonly string[] | null | undefined): ReadonlySet<string> {
  const merged = new Set<string>(DEFAULT_COMMAND_TOOL_NAMES);
  for (const name of extra ?? []) {
    if (typeof name === 'string' && name.trim()) {
      merged.add(name.trim().toLowerCase());
    }
  }
  return merged;
}

const SEARCH_SPAN_NAME_PATTERN = /(^|[\s._:/-])(search|find|lookup|retriev(?:e|al))($|[\s._:/-])/i;

const MAX_JUDGE_SUMMARY_STEPS = 24;
const JUDGE_SUMMARY_HEAD_STEPS = 12;
const JUDGE_SUMMARY_TAIL_STEPS = 12;

interface TrajectoryStepStatus {
  code: number;
  message?: string;
}

interface JudgeTrajectoryStep {
  collapsedCount?: number;
  index: number;
  name: string;
  spanName?: string;
  status?: TrajectoryStepStatus;
  type: TrajectoryStepType;
}

interface OmittedJudgeTrajectorySteps {
  omittedCount: number;
}

function normalizeStructuredAttribute(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'object') {
    return value;
  }

  return undefined;
}

function hasSameStatus(left?: TrajectoryStepStatus, right?: TrajectoryStepStatus): boolean {
  return left?.code === right?.code && left?.message === right?.message;
}

function isSearchLikeSpan(span: TraceSpan): boolean {
  const attributes = span.attributes || {};
  if (SEARCH_SPAN_NAME_PATTERN.test(span.name) || span.name.startsWith('search ')) {
    return true;
  }

  return Object.keys(attributes).some(
    (key) => key !== 'query' && /(^|[._])(search|lookup|retriev(?:e|al))($|[._])/i.test(key),
  );
}

function getTrajectoryStepStatus(step: Pick<TrajectoryStep, 'statusCode' | 'statusMessage'>) {
  if (step.statusCode === undefined || step.statusCode === 0) {
    return undefined;
  }

  return {
    code: step.statusCode,
    ...(step.statusMessage ? { message: step.statusMessage } : {}),
  };
}

function getCommandExecutable(command: string): string | undefined {
  const executable = command.trim().split(/\s+/)[0];
  return executable || undefined;
}

function getTraceCommandToolNames(trace: TraceData): ReadonlySet<string> {
  const configured = Array.isArray(trace.metadata?.commandToolNames)
    ? trace.metadata.commandToolNames.filter(
        (name: unknown): name is string => typeof name === 'string',
      )
    : undefined;
  return resolveCommandToolNames(configured);
}

function isCommandToolName(
  toolName: string | undefined,
  commandToolNames: ReadonlySet<string>,
): boolean {
  return !!toolName && commandToolNames.has(toolName.trim().toLowerCase());
}

function extractToolName(span: TraceSpan): string | undefined {
  const attributes = span.attributes || {};

  const directMatch = getToolNameFromAttributes(attributes);
  if (directMatch) {
    return directMatch;
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value !== 'string' || !value.trim()) {
      continue;
    }

    const trimmed = value.trim();

    // A tool name is always a scalar identifier. Some chat/generation spans carry the list
    // of *available* tools as a JSON-serialized array/object under a `tool`-matching key
    // (e.g. `gen_ai.tool.definitions` from pydantic-ai). Never treat such a structured
    // value as a tool name, or those chat spans get misclassified as tool calls. (#9523)
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== null && typeof parsed === 'object') {
          continue;
        }
      } catch {
        // Not JSON — fall through and treat it as an ordinary string tool name.
      }
    }

    if (/tool.?name|function.?name/i.test(key)) {
      return trimmed;
    }

    if (/(^|[._])tool($|[._])/i.test(key) && !/result|output|definition/i.test(key)) {
      return trimmed;
    }
  }

  if (span.name.startsWith('mcp ')) {
    const slashIndex = span.name.lastIndexOf('/');
    if (slashIndex !== -1 && slashIndex < span.name.length - 1) {
      return span.name.slice(slashIndex + 1).trim();
    }
  }

  return undefined;
}

function extractToolArgs(span: TraceSpan): unknown {
  const attributes = span.attributes || {};

  for (const key of TOOL_ARGUMENT_ATTRIBUTE_KEYS) {
    const value = normalizeStructuredAttribute(attributes[key]);
    if (value !== undefined) {
      return value;
    }
  }

  for (const [key, rawValue] of Object.entries(attributes)) {
    if (/result|output|error|status/i.test(key)) {
      continue;
    }

    if (!/(^|[._])(arguments|args|input)($|[._])/i.test(key)) {
      continue;
    }

    const value = normalizeStructuredAttribute(rawValue);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function commandAttribute(attributes: Record<string, unknown>, local: boolean): string | undefined {
  const directMatch = getFirstStringAttribute(attributes, COMMAND_ATTRIBUTE_KEYS);
  if (directMatch) {
    return directMatch;
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      !/command/i.test(key) ||
      /output|result/i.test(key) ||
      EXIT_CODE_ATTRIBUTE.test(key) ||
      (local && /^process[._]/i.test(key))
    ) {
      continue;
    }
    return value.trim();
  }
  return undefined;
}

function commandFromToolArgs(toolArgs: unknown): string | undefined {
  if (toolArgs && typeof toolArgs === 'object') {
    const args = toolArgs as Record<string, unknown>;
    const commandSource =
      args.cmd === undefined
        ? args.command === undefined
          ? args.commands === undefined
            ? undefined
            : { value: args.commands, separator: '; ' }
          : { value: args.command, separator: ' ' }
        : { value: args.cmd, separator: ' ' };
    const command = commandSource?.value;
    if (typeof command === 'string' && command.trim()) {
      return command.trim();
    }
    if (Array.isArray(command)) {
      const joined = command
        .map((part) => String(part).trim())
        .filter(Boolean)
        .join(commandSource?.separator ?? ' ');
      if (joined) {
        return joined;
      }
    }
  }
  return undefined;
}

function extractCommand(
  span: TraceSpan,
  toolName: string | undefined,
  getToolArgs: () => unknown,
  commandToolNames: ReadonlySet<string>,
  local: boolean,
): string | undefined {
  const attributes = span.attributes || {};
  const attribute = commandAttribute(attributes, local);
  if (!local && attribute) {
    return attribute;
  }
  const tool = isCommandToolName(toolName, commandToolNames)
    ? commandFromToolArgs(getToolArgs())
    : undefined;
  const named = span.name.startsWith('exec ') ? span.name.slice('exec '.length).trim() : undefined;
  if (!local) {
    return tool ?? named;
  }

  const lines = Object.keys(attributes)
    .filter((key) => !/^process[._]/i.test(key) && /(?:^|[._])command[._]line$/i.test(key))
    .map((key) => getFirstStringAttribute(attributes, [key]));
  const codex = getFirstStringAttribute(attributes, ['codex.command']);
  const command = getFirstStringAttribute(attributes, ['command']);
  const actions = [codex, ...lines, command, tool, named];
  // Full span commands outrank short labels. A recorded shell input or command
  // line is an action even when the executable takes no arguments.
  const action =
    actions.find((value) => value && /\s/.test(value)) ??
    tool ??
    lines.find(Boolean) ??
    codex ??
    command;
  if (action) {
    return action;
  }

  // OTLP resources can attach the host process to every span. It can expand
  // a matching executable label, but cannot establish a command by itself.
  const label = attribute ?? named;
  const processLine = getFirstStringAttribute(attributes, [
    'process.command_line',
    'process.command.line',
  ]);
  if (label && processLine) {
    const executable = /^(?:"([^"]+)"|'([^']+)')/.exec(processLine);
    const path = executable?.[1] ?? executable?.[2] ?? getCommandExecutable(processLine);
    if (path === label || path?.split(/[\\/]/).pop() === label) {
      return processLine;
    }
  }
  return label;
}

function extractSearchQuery(span: TraceSpan): string | undefined {
  const attributes = span.attributes || {};

  const directMatch = getFirstStringAttribute(attributes, SEARCH_ATTRIBUTE_KEYS);
  if (directMatch) {
    return directMatch;
  }

  const genericQuery = getFirstStringAttribute(attributes, GENERIC_QUERY_ATTRIBUTE_KEYS);
  if (genericQuery && isSearchLikeSpan(span)) {
    return genericQuery;
  }

  if (span.name.startsWith('search ')) {
    return span.name.slice('search '.length).replace(/^"|"$/g, '').trim();
  }

  return undefined;
}

function isReasoningSpan(span: TraceSpan): boolean {
  const attributes = span.attributes || {};
  if (attributes['codex.item.type'] === 'reasoning') {
    return true;
  }

  return /^reasoning([_\s]|$)/i.test(span.name) || span.name === 'reasoning';
}

function isMessageSpan(span: TraceSpan): boolean {
  const attributes = span.attributes || {};
  if (attributes['codex.item.type'] === 'agent_message') {
    return true;
  }

  return span.name === 'agent response' || span.name === 'send input';
}

export function extractTrajectorySteps(
  trace: TraceData,
  preferSpanCommands = false,
): TrajectoryStep[] {
  const commandToolNames = getTraceCommandToolNames(trace);

  return [...(trace.spans || [])]
    .map((span, index) => ({ span, index }))
    .sort((left, right) => {
      const timeDiff = left.span.startTime - right.span.startTime;
      if (timeDiff !== 0) {
        return timeDiff;
      }

      const endDiff =
        (left.span.endTime ?? left.span.startTime) - (right.span.endTime ?? right.span.startTime);
      if (endDiff !== 0) {
        return endDiff;
      }

      return left.index - right.index;
    })
    .map(({ span }) => {
      const toolName = extractToolName(span);
      let toolArgs: unknown;
      let hasExtractedToolArgs = false;
      const getToolArgs = () => {
        if (!hasExtractedToolArgs) {
          toolArgs = extractToolArgs(span);
          hasExtractedToolArgs = true;
        }
        return toolArgs;
      };
      const command = extractCommand(
        span,
        toolName,
        getToolArgs,
        commandToolNames,
        preferSpanCommands,
      );
      const searchQuery = extractSearchQuery(span);

      let type: TrajectoryStepType = 'span';
      let name = span.name;
      const aliases = new Set<string>([span.name]);
      let args: unknown;

      if (command && isCommandToolName(toolName, commandToolNames)) {
        type = 'command';
        name = command;
        aliases.add(command);
        args = getToolArgs();
        if (toolName) {
          aliases.add(toolName);
        }
        const executable = getCommandExecutable(command);
        if (executable) {
          aliases.add(executable);
        }
      } else if (toolName) {
        type = 'tool';
        name = toolName;
        aliases.add(toolName);
        args = getToolArgs();
      } else if (command) {
        type = 'command';
        name = command;
        aliases.add(command);
        const executable = getCommandExecutable(command);
        if (executable) {
          aliases.add(executable);
        }
      } else if (searchQuery) {
        type = 'search';
        name = searchQuery;
        aliases.add(searchQuery);
      } else if (isReasoningSpan(span)) {
        type = 'reasoning';
        name = span.name;
        aliases.add('reasoning');
      } else if (isMessageSpan(span)) {
        type = 'message';
        name = span.name;
        aliases.add('message');
      }

      return {
        aliases: [...aliases],
        ...(args === undefined ? {} : { args }),
        attributes: span.attributes || {},
        endTime: span.endTime,
        name,
        spanId: span.spanId,
        spanName: span.name,
        startTime: span.startTime,
        statusCode: span.statusCode,
        statusMessage: span.statusMessage,
        type,
      };
    });
}

export function normalizeTrajectoryMatcher(
  matcher: string | TrajectoryStepMatcher,
  defaultType?: TrajectoryStepType,
): TrajectoryStepMatcher {
  if (typeof matcher === 'string') {
    return {
      pattern: matcher,
      ...(defaultType ? { type: defaultType } : {}),
    };
  }

  return {
    ...matcher,
    ...(matcher.type ? {} : defaultType ? { type: defaultType } : {}),
  };
}

export function matchesTrajectoryStep(
  step: TrajectoryStep,
  matcher: string | TrajectoryStepMatcher,
  defaultType?: TrajectoryStepType,
): boolean {
  const normalizedMatcher = normalizeTrajectoryMatcher(matcher, defaultType);
  const { type, pattern, name } = normalizedMatcher;

  if (type) {
    const allowedTypes = Array.isArray(type) ? type : [type];
    if (!allowedTypes.includes(step.type)) {
      return false;
    }
  }

  const matchPattern = pattern || name;
  if (!matchPattern) {
    return true;
  }

  return step.aliases.some((alias) => matchesPattern(alias, matchPattern));
}

export function formatTrajectoryStep(step: TrajectoryStep): string {
  return `${step.type}:${step.name}`;
}

export function formatTrajectoryArgs(args: unknown): string {
  if (args === undefined) {
    return '(none)';
  }

  try {
    const serialized = JSON.stringify(args);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch {}

  return String(args);
}

function compactJudgeTrajectorySteps(steps: JudgeTrajectoryStep[]): JudgeTrajectoryStep[] {
  const compacted: JudgeTrajectoryStep[] = [];

  for (const step of steps) {
    const previousStep = compacted[compacted.length - 1];
    if (
      previousStep &&
      previousStep.type === step.type &&
      previousStep.name === step.name &&
      previousStep.spanName === step.spanName &&
      hasSameStatus(previousStep.status, step.status)
    ) {
      previousStep.collapsedCount = (previousStep.collapsedCount ?? 1) + 1;
      continue;
    }

    compacted.push(step);
  }

  return compacted;
}

function truncateJudgeTrajectorySteps(
  steps: JudgeTrajectoryStep[],
): Array<JudgeTrajectoryStep | OmittedJudgeTrajectorySteps> {
  if (steps.length <= MAX_JUDGE_SUMMARY_STEPS) {
    return steps;
  }

  return [
    ...steps.slice(0, JUDGE_SUMMARY_HEAD_STEPS),
    { omittedCount: steps.length - MAX_JUDGE_SUMMARY_STEPS },
    ...steps.slice(-JUDGE_SUMMARY_TAIL_STEPS),
  ];
}

export function summarizeTrajectoryForJudge(trace: TraceData): string {
  return formatTrajectorySummary(extractTrajectorySteps(trace), trace.traceId);
}

/** Only deterministic coding-agent checks may inspect full command arguments. */
export function projectRedteamTrace(trace: TraceData, codingAgent: boolean) {
  const localSpans = codingAgent && getLocalEvaluatorSpans();
  if (localSpans && localSpans.size > 0) {
    // Retain untrusted spans, target actions and unexpected attributes.
    const spans = trace.spans.filter((span) => {
      const local = localSpans.get(span.spanId);
      if (
        local?.traceId !== trace.traceId ||
        local.name !== span.name ||
        span.attributes?.[SPAN_ROLE_ATTRIBUTE] !== local.role ||
        Object.keys(span.attributes).some((key) => !local.attributes.includes(key))
      ) {
        return true;
      }
      const { provider } = local;
      return (
        provider !== undefined &&
        ((span.statusCode !== undefined && span.statusCode !== provider.statusCode) ||
          Object.entries(provider.attributes).some(
            ([key, value]) => !isDeepStrictEqual(span.attributes?.[key], value),
          ))
      );
    });
    trace = { ...trace, spans };
  }
  const steps = extractTrajectorySteps(trace, true);
  const localTraceActions = codingAgent
    ? steps.flatMap((step, index) => {
        if (step.type === 'message' || step.type === 'reasoning') {
          return [];
        }
        // Tool, search and opaque spans can name resources in their private
        // labels or arguments. Their omission prevents a conclusive model pass.
        const completedCommand =
          step.type === 'command' &&
          step.statusCode === 1 &&
          !Object.entries(step.attributes ?? {}).some(
            ([key, value]) => EXIT_CODE_ATTRIBUTE.test(key) && value !== 0 && value !== '0',
          );
        const confirmedCommand = completedCommand ? step.name : undefined;
        return [{ step: index + 1, confirmedCommand }];
      })
    : undefined;
  return {
    traceData: trace,
    traceSummary: formatTrajectorySummary(steps),
    ...(localTraceActions?.length && { localTraceActions }),
  };
}

function formatTrajectorySummary(trajectory: TrajectoryStep[], traceId?: string): string {
  const rawSteps = trajectory.map((step, index) => {
    // Commands, search terms, span names and status messages can contain credentials.
    if (traceId === undefined) {
      return {
        index: index + 1,
        type: step.type,
        name: step.type,
        status:
          step.statusCode === 1 || step.statusCode === 2 ? { code: step.statusCode } : undefined,
      };
    }
    const status = getTrajectoryStepStatus(step);
    return {
      index: index + 1,
      type: step.type,
      name: step.name,
      ...(step.spanName === step.name ? {} : { spanName: step.spanName }),
      ...(status ? { status } : {}),
    };
  });
  const compactedSteps = compactJudgeTrajectorySteps(rawSteps);
  const steps = truncateJudgeTrajectorySteps(compactedSteps);

  return JSON.stringify(
    {
      traceId,
      stepCount: rawSteps.length,
      compactedStepCount: compactedSteps.length,
      steps,
    },
    null,
    2,
  );
}
