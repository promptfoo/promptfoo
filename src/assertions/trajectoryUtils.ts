import { getTraceTextRedactor, sanitizeTraceAttributes } from '../tracing/sanitizeAttributes';
import {
  COMMAND_ATTRIBUTE_KEYS,
  getFirstStringAttribute,
  getToolNameFromAttributes,
  SEARCH_ATTRIBUTE_KEYS,
  TOOL_ARGUMENT_ATTRIBUTE_KEYS,
  TOOL_RESULT_ATTRIBUTE_KEYS,
} from '../tracing/toolAttributes';
import { matchesPattern } from './traceUtils';

import type { TraceData, TraceSpan } from '../types/tracing';

/** Evidence hidden or omitted by trace policy cannot produce a grading verdict. */
export class TraceEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceEvidenceError';
  }
}

export type TrajectoryStepType = 'command' | 'message' | 'reasoning' | 'search' | 'span' | 'tool';
type TrajectoryAttributes = Record<string, unknown>;

export interface TrajectoryStepMatcher {
  name?: string;
  pattern?: string;
  type?: TrajectoryStepType | TrajectoryStepType[];
}

export interface TrajectoryStep {
  aliases: string[];
  args?: unknown;
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

const REDACTED_EVIDENCE_RE = /\[REDACTED\]|<redacted(?:_[a-z_]+)?>|\[TRUNCATED\]/i;
const MAX_JUDGE_SUMMARY_STEPS = 24;

interface TrajectoryStepStatus {
  code: number;
}

interface JudgeTrajectoryStep {
  collapsedCount?: number;
  index: number;
  name: string;
  spanName?: string;
  execution?: { authorized?: boolean; exitCode?: number };
  sql?: { query: string; authorized?: boolean; rowCount?: number };
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
  return left?.code === right?.code;
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

function getTrajectoryStepStatus(step: Pick<TrajectoryStep, 'statusCode'>) {
  if (step.statusCode === undefined || step.statusCode === 0) {
    return undefined;
  }

  return {
    code: step.statusCode,
  };
}

function getCommandExecutable(command: string): string | undefined {
  const executable = command.trim().split(/\s+/)[0];
  return executable || undefined;
}

function getTraceCommandToolNames(trace: Pick<TraceData, 'metadata'>): ReadonlySet<string> {
  const configured = Array.isArray(trace.metadata?.commandToolNames)
    ? trace.metadata.commandToolNames.filter(
        (name: unknown): name is string => typeof name === 'string',
      )
    : undefined;
  return resolveCommandToolNames(configured);
}

function isCommandToolCall(
  toolName: string | undefined,
  commandToolNames: ReadonlySet<string>,
  args?: unknown,
): boolean {
  const name = toolName?.trim().toLowerCase();
  return (
    !!name &&
    (commandToolNames.has(name) ||
      (name === 'execute' &&
        !!args &&
        typeof args === 'object' &&
        ['cmd', 'command', 'commands'].some((key) => key in args)))
  );
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

function extractCommand(
  span: TraceSpan,
  toolName = extractToolName(span),
  getToolArgs = () => extractToolArgs(span),
  commandToolNames = resolveCommandToolNames(undefined),
): string | undefined {
  const attributes = span.attributes || {};

  const directMatch = getFirstStringAttribute(attributes, COMMAND_ATTRIBUTE_KEYS);
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

  const toolArgs = getToolArgs();
  if (
    isCommandToolCall(toolName, commandToolNames, toolArgs) &&
    toolArgs &&
    typeof toolArgs === 'object'
  ) {
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

  if (span.name.startsWith('exec ')) {
    return span.name.slice('exec '.length).trim();
  }

  return undefined;
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
  trace: Pick<TraceData, 'spans' | 'metadata'>,
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
      const command = extractCommand(span, toolName, getToolArgs, commandToolNames);
      const searchQuery = extractSearchQuery(span);

      let type: TrajectoryStepType = 'span';
      let name = span.name;
      const aliases = new Set<string>([span.name]);
      let args: unknown;

      if (command && isCommandToolCall(toolName, commandToolNames, getToolArgs())) {
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
      !previousStep.sql &&
      !step.sql &&
      !previousStep.execution &&
      !step.execution &&
      hasSameStatus(previousStep.status, step.status)
    ) {
      previousStep.collapsedCount = (previousStep.collapsedCount ?? 1) + 1;
      continue;
    }

    compacted.push(step);
  }

  return compacted;
}

function takeFirstAndLast<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) {
    return items;
  }
  const tailCount = Math.floor(limit / 2);
  return [...items.slice(0, Math.ceil(limit / 2)), ...(tailCount ? items.slice(-tailCount) : [])];
}

function truncateJudgeTrajectorySteps(
  steps: JudgeTrajectoryStep[],
): Array<JudgeTrajectoryStep | OmittedJudgeTrajectorySteps> {
  if (steps.length <= MAX_JUDGE_SUMMARY_STEPS) {
    return steps;
  }

  const evidenceSteps = steps.filter((step) => step.sql || step.execution);
  if (evidenceSteps.length > MAX_JUDGE_SUMMARY_STEPS) {
    throw new TraceEvidenceError(
      `${evidenceSteps.some((step) => step.execution) ? 'Shell' : 'SQL'} trace evidence exceeds the judge summary limit and cannot be graded.`,
    );
  }
  const retained = new Set([
    ...evidenceSteps,
    ...takeFirstAndLast(
      steps.filter((step) => !step.sql && !step.execution),
      MAX_JUDGE_SUMMARY_STEPS - evidenceSteps.length,
    ),
  ]);
  const summary: Array<JudgeTrajectoryStep | OmittedJudgeTrajectorySteps> = [];
  for (const step of steps) {
    if (retained.has(step)) {
      summary.push(step);
      continue;
    }
    const previous = summary[summary.length - 1];
    const omission = previous && 'omittedCount' in previous ? previous : { omittedCount: 0 };
    if (omission !== previous) {
      summary.push(omission);
    }
    omission.omittedCount += 1;
  }
  return summary;
}

function getSqlExecutionDetails(
  step: Pick<TrajectoryStep, 'attributes' | 'spanId' | 'spanName' | 'startTime'>,
  redactText: (value: string) => string,
  redactAttributes?: string[],
): JudgeTrajectoryStep['sql'] {
  const attributes = step.attributes;
  const databaseQuery = getFirstStringAttribute(attributes, ['db.query.text', 'db.statement']);
  const args = extractToolArgs({
    spanId: step.spanId,
    name: step.spanName,
    startTime: step.startTime,
    attributes,
  });
  const argumentObject = args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
  const toolName = getToolNameFromAttributes(attributes) ?? step.spanName;
  const isQueryTool =
    /(^|[\s.:/-])(?:(?:read|run|execute)_query|(?:run|execute)_sql|query_database|sql_query|query)($|[\s.:/-])/i.test(
      toolName,
    );
  const argumentQuery =
    typeof args === 'string'
      ? args
      : getFirstStringAttribute(argumentObject, ['sql', 'query', 'statement']);
  const scalarSql =
    argumentQuery !== undefined &&
    (isQueryTool ||
      /^\s*(?:select|with|insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|explain|pragma|show|describe|call|exec(?:ute)?)\b/i.test(
        argumentQuery,
      ))
      ? argumentQuery.trim()
      : undefined;
  const query = databaseQuery ?? scalarSql;
  if ((query || isQueryTool) && REDACTED_EVIDENCE_RE.test(redactText(toolName))) {
    throw new TraceEvidenceError('SQL trace evidence was redacted and cannot be graded.');
  }
  if (!query) {
    if (
      isQueryTool &&
      (args !== undefined || getToolNameFromAttributes(attributes) !== undefined)
    ) {
      throw new TraceEvidenceError('SQL query arguments could not be read and cannot be graded.');
    }
    return undefined;
  }
  const output = normalizeStructuredAttribute(
    TOOL_RESULT_ATTRIBUTE_KEYS.map((key) => attributes[key]).find((value) => value != null),
  );
  const result = output && typeof output === 'object' ? (output as Record<string, unknown>) : {};
  // Keep only query text and explicit outcome indicators. Rows and bind values
  // can contain private data and are not part of the judge summary.
  const sql = sanitizeTraceAttributes(
    {
      query,
      ...(typeof result.authorized === 'boolean' ? { authorized: result.authorized } : {}),
      ...(typeof result.rowCount === 'number' && Number.isFinite(result.rowCount)
        ? { rowCount: result.rowCount }
        : {}),
    },
    { redactAttributes, truncateValues: false },
  ) as NonNullable<JudgeTrajectoryStep['sql']>;
  const redactedQuery = redactText(sql.query);
  if (redactedQuery !== query || REDACTED_EVIDENCE_RE.test(redactedQuery)) {
    throw new TraceEvidenceError('SQL trace evidence was redacted and cannot be graded.');
  }
  if (redactedQuery.length > 400) {
    throw new TraceEvidenceError(
      'SQL trace evidence exceeds the judge summary limit and cannot be graded.',
    );
  }
  sql.query = redactedQuery;
  return sql;
}

export function summarizeTrajectoryForJudge(
  trace: Pick<TraceData, 'traceId' | 'spans' | 'metadata'>,
  options: { includeSql?: boolean; includeCommands?: boolean; redactAttributes?: string[] } = {},
): string {
  const spans = trace.spans.map((span) => ({
    ...span,
    attributes: sanitizeTraceAttributes(span.attributes, {
      redactAttributes: options.redactAttributes,
      truncateValues: false,
    }),
  }));
  const redactText = getTraceTextRedactor(
    trace.spans.map((span, index) => ({
      original: span.attributes,
      sanitized: spans[index].attributes,
    })),
  );
  const sanitizedTrace = {
    ...trace,
    spans: spans.map((span) => ({ ...span, name: redactText(span.name) })),
  };
  const sqlBySpanId = new Map(
    options.includeSql
      ? trace.spans.map(
          (span) =>
            [
              span.spanId,
              getSqlExecutionDetails(
                {
                  attributes: span.attributes ?? {},
                  spanId: span.spanId,
                  spanName: span.name,
                  startTime: span.startTime,
                },
                redactText,
                options.redactAttributes,
              ),
            ] as const,
        )
      : [],
  );
  const trajectorySteps = extractTrajectorySteps(sanitizedTrace);
  if (options.includeCommands) {
    const commandToolNames = getTraceCommandToolNames(trace);
    for (const [index, step] of extractTrajectorySteps(trace).entries()) {
      if (step.type === 'tool' && isCommandToolCall(step.name, commandToolNames, step.args)) {
        throw new TraceEvidenceError(
          'Shell command arguments could not be read and cannot be graded.',
        );
      }
      if (step.type === 'command') {
        const command = redactText(step.name);
        if (
          trajectorySteps[index].type !== 'command' ||
          trajectorySteps[index].name !== step.name ||
          command !== step.name ||
          REDACTED_EVIDENCE_RE.test(command)
        ) {
          throw new TraceEvidenceError('Shell trace evidence was redacted and cannot be graded.');
        }
        if (command.length > 400) {
          throw new TraceEvidenceError(
            'Shell trace evidence exceeds the judge summary limit and cannot be graded.',
          );
        }
      }
    }
  }
  const boundedName = (name: string) => {
    const redacted = redactText(name);
    return redacted.length > 400 ? `${redacted.slice(0, 399)}…` : redacted;
  };
  const rawSteps = trajectorySteps.map((step, index) => {
    let status = getTrajectoryStepStatus(step);
    let execution: JudgeTrajectoryStep['execution'];
    if (options.includeCommands && step.type === 'command') {
      const output = normalizeStructuredAttribute(
        TOOL_RESULT_ATTRIBUTE_KEYS.map((key) => step.attributes[key]).find(
          (value) => value != null,
        ),
      );
      if (typeof output === 'string' && REDACTED_EVIDENCE_RE.test(output)) {
        throw new TraceEvidenceError('Shell execution evidence was redacted and cannot be graded.');
      }
      const result =
        output && typeof output === 'object' ? (output as Record<string, unknown>) : {};
      const exitCode = result.exitCode ?? result.exit_code ?? step.attributes['process.exit.code'];
      execution = {
        ...(typeof result.authorized === 'boolean' ? { authorized: result.authorized } : {}),
        ...(typeof exitCode === 'number' && Number.isInteger(exitCode) ? { exitCode } : {}),
      };
      if (execution.exitCode !== undefined) {
        status = { code: status?.code === 2 || execution.exitCode !== 0 ? 2 : 1 };
      }
    }
    const sql = sqlBySpanId.get(step.spanId);
    return {
      index: index + 1,
      type: step.type,
      name: boundedName(step.name),
      ...(step.spanName === step.name ? {} : { spanName: boundedName(step.spanName) }),
      ...(status ? { status } : {}),
      ...(sql ? { sql } : {}),
      ...(execution ? { execution } : {}),
    };
  });
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
