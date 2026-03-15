import { matchesPattern } from './traceUtils';

import type { TraceData, TraceSpan } from '../types/tracing';

export type TrajectoryStepType = 'command' | 'message' | 'reasoning' | 'search' | 'span' | 'tool';
type TrajectoryAttributes = Record<string, unknown>;

export interface TrajectoryStepMatcher {
  name?: string;
  pattern?: string;
  type?: TrajectoryStepType | TrajectoryStepType[];
}

export interface TrajectoryStep {
  aliases: string[];
  attributes: TrajectoryAttributes;
  endTime?: number;
  name: string;
  spanId: string;
  spanName: string;
  startTime: number;
  statusCode?: number;
  statusMessage?: string;
  type: TrajectoryStepType;
}

const TOOL_ATTRIBUTE_KEYS = [
  'tool.name',
  'tool_name',
  'tool',
  'function.name',
  'function_name',
  'gen_ai.tool.name',
  'codex.mcp.tool',
  'agent.tool',
  'agent.tool_name',
  'agent.toolName',
] as const;

const COMMAND_ATTRIBUTE_KEYS = [
  'codex.command',
  'command',
  'command.name',
  'command_name',
] as const;

const SEARCH_ATTRIBUTE_KEYS = ['codex.search.query', 'search.query', 'search_query'] as const;

const GENERIC_QUERY_ATTRIBUTE_KEYS = ['query'] as const;

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

function getStringAttribute(
  attributes: TrajectoryAttributes,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
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

function extractToolName(span: TraceSpan): string | undefined {
  const attributes = span.attributes || {};

  const directMatch = getStringAttribute(attributes, TOOL_ATTRIBUTE_KEYS);
  if (directMatch) {
    return directMatch;
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value !== 'string' || !value.trim()) {
      continue;
    }

    if (/tool.?name|function.?name/i.test(key)) {
      return value.trim();
    }

    if (/(^|[._])tool($|[._])/i.test(key) && !/result|output/i.test(key)) {
      return value.trim();
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

function extractCommand(span: TraceSpan): string | undefined {
  const attributes = span.attributes || {};

  const directMatch = getStringAttribute(attributes, COMMAND_ATTRIBUTE_KEYS);
  if (directMatch) {
    return directMatch;
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value !== 'string' || !value.trim()) {
      continue;
    }

    if (/command/i.test(key) && !/output|result/i.test(key)) {
      return value.trim();
    }
  }

  if (span.name.startsWith('exec ')) {
    return span.name.slice('exec '.length).trim();
  }

  return undefined;
}

function extractSearchQuery(span: TraceSpan): string | undefined {
  const attributes = span.attributes || {};

  const directMatch = getStringAttribute(attributes, SEARCH_ATTRIBUTE_KEYS);
  if (directMatch) {
    return directMatch;
  }

  const genericQuery = getStringAttribute(attributes, GENERIC_QUERY_ATTRIBUTE_KEYS);
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

export function extractTrajectorySteps(trace: TraceData): TrajectoryStep[] {
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
      const command = extractCommand(span);
      const searchQuery = extractSearchQuery(span);

      let type: TrajectoryStepType = 'span';
      let name = span.name;
      const aliases = new Set<string>([span.name]);

      if (toolName) {
        type = 'tool';
        name = toolName;
        aliases.add(toolName);
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
  const rawSteps = extractTrajectorySteps(trace).map((step, index) => ({
    index: index + 1,
    type: step.type,
    name: step.name,
    ...(step.spanName !== step.name ? { spanName: step.spanName } : {}),
    ...(getTrajectoryStepStatus(step) ? { status: getTrajectoryStepStatus(step) } : {}),
  }));
  const compactedSteps = compactJudgeTrajectorySteps(rawSteps);
  const steps = truncateJudgeTrajectorySteps(compactedSteps);

  return JSON.stringify(
    {
      traceId: trace.traceId,
      stepCount: rawSteps.length,
      compactedStepCount: compactedSteps.length,
      steps,
    },
    null,
    2,
  );
}
