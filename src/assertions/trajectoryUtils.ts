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
  attributes: Record<string, any>;
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

const SEARCH_ATTRIBUTE_KEYS = [
  'codex.search.query',
  'search.query',
  'search_query',
  'query',
] as const;

function getStringAttribute(
  attributes: Record<string, any>,
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
    .sort((a, b) => {
      const timeDiff = a.startTime - b.startTime;
      if (timeDiff !== 0) {
        return timeDiff;
      }

      const endDiff = (a.endTime ?? a.startTime) - (b.endTime ?? b.startTime);
      if (endDiff !== 0) {
        return endDiff;
      }

      return a.name.localeCompare(b.name);
    })
    .map((span) => {
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

export function summarizeTrajectoryForJudge(trace: TraceData): string {
  const steps = extractTrajectorySteps(trace).map((step, index) => ({
    index: index + 1,
    type: step.type,
    name: step.name,
    ...(step.spanName !== step.name ? { spanName: step.spanName } : {}),
    ...(step.statusCode !== undefined && step.statusCode !== 0
      ? {
          status: {
            code: step.statusCode,
            ...(step.statusMessage ? { message: step.statusMessage } : {}),
          },
        }
      : {}),
  }));

  return JSON.stringify(
    {
      traceId: trace.traceId,
      stepCount: steps.length,
      steps,
    },
    null,
    2,
  );
}
