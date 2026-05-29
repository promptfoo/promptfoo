import { isDeepStrictEqual } from 'node:util';

import { isGraderFailure, matchesTrajectoryGoalSuccess } from '../matchers/llmGrading';
import { matchesPattern } from './traceUtils';
import {
  extractTrajectorySteps,
  formatTrajectoryArgs,
  formatTrajectoryStep,
  matchesTrajectoryStep,
  normalizeTrajectoryMatcher,
  summarizeTrajectoryForJudge,
  type TrajectoryStep,
  type TrajectoryStepMatcher,
} from './trajectoryUtils';

import type { AssertionParams, GradingResult } from '../types/index';

interface TrajectoryCountValue extends TrajectoryStepMatcher {
  max?: number;
  min?: number;
}

type TrajectorySequenceStep = string | TrajectoryStepMatcher;
type TrajectorySequenceGroup = TrajectorySequenceStep[];

interface TrajectorySequenceValue {
  mode?: 'exact' | 'in_order';
  steps: Array<TrajectorySequenceStep | TrajectorySequenceGroup>;
}

interface TrajectoryGoalSuccessValue {
  goal: string;
}

type ToolArgsDefaults = Record<string, unknown>;

interface TrajectoryToolArgsMatchValue extends TrajectoryStepMatcher {
  args?: unknown;
  arguments?: unknown;
  mode?: 'exact' | 'partial';
  defaults?: ToolArgsDefaults;
  ignore?: string | string[];
}

function getTraceOrThrow(params: AssertionParams) {
  const trace = params.assertionValueContext.trace;
  if (!trace || !trace.spans) {
    throw new Error(`No trace data available for ${params.baseType} assertion`);
  }
  return trace;
}

function applyInverse(pass: boolean, inverse: boolean) {
  return inverse ? !pass : pass;
}

function formatStepList(stepLabels: string[]): string {
  return stepLabels.length > 0 ? stepLabels.join(', ') : '(none)';
}

function requireNamedTrajectoryMatcher(
  matcher: TrajectoryStepMatcher,
  assertionType: string,
  index?: number,
) {
  if (matcher.pattern || matcher.name) {
    return;
  }

  const stepLabel = index === undefined ? 'object' : `step ${index + 1}`;
  throw new Error(
    `${assertionType} assertion ${stepLabel} must include a name or pattern property`,
  );
}

function resolveGoalSuccessValue(value: unknown): TrajectoryGoalSuccessValue {
  if (typeof value === 'string' && value.trim()) {
    return { goal: value.trim() };
  }

  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as TrajectoryGoalSuccessValue).goal === 'string' &&
    (value as TrajectoryGoalSuccessValue).goal.trim()
  ) {
    return {
      goal: (value as TrajectoryGoalSuccessValue).goal.trim(),
    };
  }

  throw new Error(
    'trajectory:goal-success assertion must have a string value or an object with a goal property',
  );
}

function resolveToolMatchers(
  value: unknown,
):
  | { kind: 'list'; matchers: TrajectoryStepMatcher[] }
  | { kind: 'count'; matcher: TrajectoryCountValue } {
  if (typeof value === 'string') {
    return {
      kind: 'list',
      matchers: [normalizeTrajectoryMatcher(value, 'tool')],
    };
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return {
      kind: 'list',
      matchers: value.map((item) => normalizeTrajectoryMatcher(item, 'tool')),
    };
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const matcher = normalizeTrajectoryMatcher(value as TrajectoryStepMatcher, 'tool');
    return {
      kind: 'count',
      matcher: {
        ...matcher,
        max:
          typeof (value as TrajectoryCountValue).max === 'number'
            ? (value as TrajectoryCountValue).max
            : undefined,
        min:
          typeof (value as TrajectoryCountValue).min === 'number'
            ? (value as TrajectoryCountValue).min
            : undefined,
      },
    };
  }

  throw new Error(
    'trajectory:tool-used assertion must have a string, string array, or object value',
  );
}

export const handleTrajectoryToolUsed = (params: AssertionParams): GradingResult => {
  const trace = getTraceOrThrow(params);
  const steps = extractTrajectorySteps(trace).filter((step) => step.type === 'tool');
  const expected = resolveToolMatchers(params.renderedValue ?? params.assertion.value);

  if (expected.kind === 'list') {
    if (expected.matchers.length === 0) {
      throw new Error('trajectory:tool-used assertion requires at least one expected tool');
    }

    const missing = expected.matchers.filter(
      (matcher) => !steps.some((step) => matchesTrajectoryStep(step, matcher)),
    );
    const matched = expected.matchers.filter((matcher) =>
      steps.some((step) => matchesTrajectoryStep(step, matcher)),
    );

    const pass = params.inverse ? matched.length === 0 : missing.length === 0;
    const actualTools = steps.map(formatTrajectoryStep);

    const expectedTools = expected.matchers.map(
      (matcher) => matcher.pattern || matcher.name || '*',
    );

    let reason: string;
    if (params.inverse) {
      reason = pass
        ? `Forbidden tool(s) were not used: ${expectedTools.join(', ')}`
        : `Forbidden tool(s) were used: ${matched
            .map((matcher) => matcher.pattern || matcher.name || '*')
            .join(', ')}. Actual tools: ${formatStepList(actualTools)}`;
    } else if (pass) {
      reason = `Observed required tool(s): ${expectedTools.join(', ')}. Actual tools: ${formatStepList(actualTools)}`;
    } else {
      const missingTools = missing.map((matcher) => matcher.pattern || matcher.name || '*');
      reason = `Missing required tool(s): ${missingTools.join(', ')}. Actual tools: ${formatStepList(actualTools)}`;
    }

    return {
      pass,
      score: pass ? 1 : 0,
      reason,
      assertion: params.assertion,
    };
  }

  const matcher = expected.matcher;
  const min = matcher.min ?? 1;
  const max = matcher.max;
  if (!matcher.pattern && !matcher.name) {
    throw new Error(
      'trajectory:tool-used assertion object must include a name or pattern property',
    );
  }

  const matchingSteps = steps.filter((step) => matchesTrajectoryStep(step, matcher));
  const count = matchingSteps.length;
  const basePass = count >= min && (max === undefined || count <= max);
  const pass = applyInverse(basePass, params.inverse);
  const matcherLabel = matcher.pattern || matcher.name || '*';

  let reason = `Matched tool "${matcherLabel}" ${count} time(s)`;
  if (max === undefined) {
    reason += ` (expected at least ${min})`;
  } else {
    reason += ` (expected ${min}-${max})`;
  }
  if (matchingSteps.length > 0) {
    reason += `. Matches: ${matchingSteps.map(formatTrajectoryStep).join(', ')}`;
  }

  if (params.inverse) {
    reason = basePass
      ? `Tool "${matcherLabel}" matched ${count} time(s), which violates the inverse assertion`
      : `Tool "${matcherLabel}" did not satisfy the forbidden match condition`;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion: params.assertion,
  };
};

function resolveSequenceValue(value: unknown): TrajectorySequenceValue {
  if (Array.isArray(value)) {
    return {
      mode: 'in_order',
      steps: value as TrajectorySequenceValue['steps'],
    };
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sequenceValue = value as Partial<TrajectorySequenceValue>;
    return {
      mode: sequenceValue.mode || 'in_order',
      steps: sequenceValue.steps || [],
    };
  }

  throw new Error('trajectory:tool-sequence assertion must have an array or object value');
}

// A step in `steps` is either a single tool (string/matcher) or a group (array of
// tools) that must run in the same turn. Resolve every entry into a group of matchers,
// and report whether any explicit group was used so flat sequences keep legacy behavior.
function resolveSequenceMatcherGroups(steps: TrajectorySequenceValue['steps']): {
  groups: TrajectoryStepMatcher[][];
  hasGroups: boolean;
} {
  let hasGroups = false;
  const groups = steps.map((step, groupIndex) => {
    const isGroup = Array.isArray(step);
    if (isGroup) {
      hasGroups = true;
      if (step.length === 0) {
        throw new Error(
          `trajectory:tool-sequence assertion step group ${groupIndex + 1} must contain at least one tool`,
        );
      }
    }
    const groupSteps = isGroup ? step : [step];
    return groupSteps.map((groupStep, withinIndex) => {
      const location = isGroup
        ? `step group ${groupIndex + 1} tool ${withinIndex + 1}`
        : `step ${groupIndex + 1}`;
      if (typeof groupStep !== 'string' && !isRecord(groupStep)) {
        throw new Error(
          `trajectory:tool-sequence assertion ${location} must be a tool name or a matcher object`,
        );
      }
      const matcher = normalizeTrajectoryMatcher(groupStep, 'tool');
      if (!matcher.pattern && !matcher.name) {
        throw new Error(
          `trajectory:tool-sequence assertion ${location} must include a name or pattern property`,
        );
      }
      return matcher;
    });
  });
  return { groups, hasGroups };
}

// Group tool calls into "turns". Two calls are the same turn when they ran concurrently
// (their spans overlap in time) under the same parent span — i.e. the model issued them
// together and they executed in parallel. We bucket by parent span first (so calls from
// different generations never merge, even if their spans happen to overlap), then split
// each bucket wherever calls stop overlapping (a gap means a new, sequential turn). This
// is robust to single-root traces (sequential calls under one parent split by their gaps)
// and to turns whose spans interleave in time with another turn's. Calls that touch at a
// boundary or have no duration (point-in-time spans, identical start) count as one turn.
function groupToolStepsByTurn(toolSteps: TrajectoryStep[]): TrajectoryStep[][] {
  const byParent = new Map<string | undefined, TrajectoryStep[]>();
  for (const step of toolSteps) {
    const bucket = byParent.get(step.parentSpanId);
    if (bucket) {
      bucket.push(step);
    } else {
      byParent.set(step.parentSpanId, [step]);
    }
  }

  const turns: TrajectoryStep[][] = [];
  for (const bucket of byParent.values()) {
    let currentTurn: TrajectoryStep[] | undefined;
    let currentEnd = Number.NEGATIVE_INFINITY;
    for (const step of bucket) {
      const stepEnd = step.endTime ?? step.startTime;
      if (currentTurn && step.startTime <= currentEnd) {
        currentTurn.push(step);
        currentEnd = Math.max(currentEnd, stepEnd);
      } else {
        currentTurn = [step];
        turns.push(currentTurn);
        currentEnd = stepEnd;
      }
    }
  }

  // Order turns by their timeline. Tie-break by end time then span id so equal-start turns
  // from different parents have a deterministic order independent of span arrival order.
  return turns.sort(
    (a, b) =>
      a[0].startTime - b[0].startTime ||
      (a[0].endTime ?? a[0].startTime) - (b[0].endTime ?? b[0].startTime) ||
      a[0].spanId.localeCompare(b[0].spanId),
  );
}

// Tools requested together have no meaningful order, so a turn matches a group when every
// matcher can be paired with a distinct step (order-insensitive). Sizes are tiny, so a
// backtracking assignment is both simple and exact.
function turnMatchesGroup(
  turnSteps: TrajectoryStep[],
  groupMatchers: TrajectoryStepMatcher[],
): boolean {
  if (turnSteps.length !== groupMatchers.length) {
    return false;
  }
  const consumed = new Array(turnSteps.length).fill(false);
  const assign = (matcherIndex: number): boolean => {
    if (matcherIndex === groupMatchers.length) {
      return true;
    }
    for (let i = 0; i < turnSteps.length; i++) {
      if (!consumed[i] && matchesTrajectoryStep(turnSteps[i], groupMatchers[matcherIndex])) {
        consumed[i] = true;
        if (assign(matcherIndex + 1)) {
          return true;
        }
        consumed[i] = false;
      }
    }
    return false;
  };
  return assign(0);
}

function formatExpectedGroup(group: TrajectoryStepMatcher[]): string {
  const labels = group.map((matcher) => matcher.pattern || matcher.name || '*');
  return group.length > 1 ? `[${labels.join(' + ')}]` : labels[0];
}

function formatActualTurn(turn: TrajectoryStep[]): string {
  const labels = turn.map(formatTrajectoryStep);
  return turn.length > 1 ? `[${labels.join(' + ')}]` : labels[0];
}

function formatTurnList(turns: TrajectoryStep[][]): string {
  return turns.length > 0 ? turns.map(formatActualTurn).join(', ') : '(none)';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesExpectedArgsPartial(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => matchesExpectedArgsPartial(actual[index], item))
    );
  }

  if (isRecord(expected)) {
    if (!isRecord(actual)) {
      return false;
    }

    return Object.entries(expected).every(
      ([key, expectedValue]) =>
        Object.prototype.hasOwnProperty.call(actual, key) &&
        matchesExpectedArgsPartial(actual[key], expectedValue),
    );
  }

  return isDeepStrictEqual(actual, expected);
}

interface StrippedToolArgs {
  cleaned: unknown;
  stripped: string[];
}

function stripDefaults(actual: unknown, defaults: ToolArgsDefaults | undefined): StrippedToolArgs {
  if (!defaults || !isRecord(actual)) {
    return { cleaned: actual, stripped: [] };
  }

  const cleaned: Record<string, unknown> = {};
  const stripped: string[] = [];
  for (const [key, value] of Object.entries(actual)) {
    if (
      Object.prototype.hasOwnProperty.call(defaults, key) &&
      isDeepStrictEqual(value, defaults[key])
    ) {
      stripped.push(key);
      continue;
    }
    // Use defineProperty rather than `cleaned[key] = value` so reserved keys such as
    // "__proto__" are kept as own properties instead of mutating the prototype. A plain
    // assignment would silently drop a hallucinated `__proto__` argument and let exact
    // mode pass when it should fail — defeating the point of stripping defaults.
    Object.defineProperty(cleaned, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return { cleaned, stripped };
}

function matchesIgnoreKey(entry: string, key: string): boolean {
  if (entry === key) {
    return true;
  }
  // Entries containing glob characters are treated as patterns (e.g. "*_id" to ignore
  // request_id, order_id, ...). Plain entries stay an exact, case-sensitive match.
  if (/[*?]/.test(entry)) {
    return matchesPattern(key, entry);
  }
  return false;
}

function stripIgnoredArgs(value: unknown, ignore: string[]): StrippedToolArgs {
  if (ignore.length === 0 || !isRecord(value)) {
    return { cleaned: value, stripped: [] };
  }

  const cleaned: Record<string, unknown> = {};
  const stripped: string[] = [];
  for (const [key, entryValue] of Object.entries(value)) {
    if (ignore.some((entry) => matchesIgnoreKey(entry, key))) {
      stripped.push(key);
      continue;
    }
    // Mirror stripDefaults: use defineProperty so a reserved key such as "__proto__"
    // remains an own property instead of mutating the prototype, which would otherwise
    // let a hallucinated argument escape exact matching.
    Object.defineProperty(cleaned, key, {
      value: entryValue,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return { cleaned, stripped };
}

function matchesToolArgs(
  actual: unknown,
  expected: unknown,
  mode: NonNullable<TrajectoryToolArgsMatchValue['mode']>,
  defaults: ToolArgsDefaults | undefined,
  ignore: string[],
): boolean {
  // `ignore` removes a key from the comparison entirely, so it applies to both the
  // observed and expected payloads. `defaults` only tolerates an observed value that
  // equals its declared default, so it applies to the observed payload alone.
  const cleanedActual = stripDefaults(stripIgnoredArgs(actual, ignore).cleaned, defaults).cleaned;
  const cleanedExpected = stripIgnoredArgs(expected, ignore).cleaned;

  if (mode === 'exact') {
    return isDeepStrictEqual(cleanedActual, cleanedExpected);
  }

  return matchesExpectedArgsPartial(cleanedActual, cleanedExpected);
}

function resolveToolArgsMatchMode(
  mode: TrajectoryToolArgsMatchValue['mode'],
): NonNullable<TrajectoryToolArgsMatchValue['mode']> {
  if (mode === undefined) {
    return 'partial';
  }

  if (mode === 'partial' || mode === 'exact') {
    return mode;
  }

  throw new Error('trajectory:tool-args-match assertion mode must be "partial" or "exact"');
}

function resolveToolArgsMatchDefaults(defaults: unknown): ToolArgsDefaults | undefined {
  if (defaults === undefined) {
    return undefined;
  }

  if (!isRecord(defaults)) {
    throw new Error(
      'trajectory:tool-args-match assertion defaults must be an object mapping argument names to default values',
    );
  }

  return defaults;
}

function resolveToolArgsMatchIgnore(ignore: unknown): string[] {
  if (ignore === undefined) {
    return [];
  }

  const entries = Array.isArray(ignore) ? ignore : [ignore];
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new Error(
        'trajectory:tool-args-match assertion ignore must be a non-empty string or an array of non-empty strings',
      );
    }
  }

  return entries as string[];
}

function resolveToolArgsMatchValue(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('trajectory:tool-args-match assertion must have an object value');
  }

  const matcher = normalizeTrajectoryMatcher(value as TrajectoryStepMatcher, 'tool');
  requireNamedTrajectoryMatcher(matcher, 'trajectory:tool-args-match');

  const expectedArgs = Object.prototype.hasOwnProperty.call(value, 'args')
    ? (value as TrajectoryToolArgsMatchValue).args
    : (value as TrajectoryToolArgsMatchValue).arguments;

  if (expectedArgs === undefined) {
    throw new Error(
      'trajectory:tool-args-match assertion must include an args or arguments property',
    );
  }

  return {
    matcher,
    expectedArgs,
    mode: resolveToolArgsMatchMode((value as TrajectoryToolArgsMatchValue).mode),
    defaults: resolveToolArgsMatchDefaults((value as TrajectoryToolArgsMatchValue).defaults),
    ignore: resolveToolArgsMatchIgnore((value as TrajectoryToolArgsMatchValue).ignore),
  } as const;
}

export const handleTrajectoryToolSequence = (params: AssertionParams): GradingResult => {
  const trace = getTraceOrThrow(params);
  const toolSteps = extractTrajectorySteps(trace).filter((step) => step.type === 'tool');
  const value = resolveSequenceValue(params.renderedValue ?? params.assertion.value);
  const { groups, hasGroups } = resolveSequenceMatcherGroups(value.steps);
  const expectedMatchers = groups.flat();

  if (expectedMatchers.length === 0) {
    throw new Error('trajectory:tool-sequence assertion requires at least one expected step');
  }

  const actualTools = toolSteps.map(formatTrajectoryStep);
  let basePass = false;
  let reason = '';

  if (hasGroups) {
    // Turn-aware matching (opt-in via nested groups): compare turns, not flat steps.
    const actualTurns = groupToolStepsByTurn(toolSteps);

    if (value.mode === 'exact') {
      basePass =
        actualTurns.length === groups.length &&
        groups.every((group, index) => turnMatchesGroup(actualTurns[index], group));
      reason = basePass
        ? `Observed expected tool turns: ${formatTurnList(actualTurns)}`
        : `Expected tool turns ${groups.map(formatExpectedGroup).join(', ')}, but observed ${formatTurnList(actualTurns)}`;
    } else {
      let expectedIndex = 0;
      for (const turn of actualTurns) {
        if (expectedIndex >= groups.length) {
          break;
        }
        if (turnMatchesGroup(turn, groups[expectedIndex])) {
          expectedIndex += 1;
        }
      }
      basePass = expectedIndex === groups.length;
      reason = basePass
        ? `Observed tool turns in order: ${groups.map(formatExpectedGroup).join(', ')}. Actual turns: ${formatTurnList(actualTurns)}`
        : `Expected tool turn ${formatExpectedGroup(groups[expectedIndex])} was not observed in order. Actual turns: ${formatTurnList(actualTurns)}`;
    }
  } else if (value.mode === 'exact') {
    // Legacy flat exact matching (turn-agnostic) — unchanged for back-compat.
    basePass =
      toolSteps.length === expectedMatchers.length &&
      expectedMatchers.every((matcher, index) => matchesTrajectoryStep(toolSteps[index], matcher));

    if (basePass) {
      reason = `Observed exact tool sequence: ${formatStepList(actualTools)}`;
    } else {
      reason = `Expected exact tool sequence of ${expectedMatchers
        .map((matcher) => matcher.pattern || matcher.name || '*')
        .join(', ')}, but actual tools were ${formatStepList(actualTools)}`;
    }
  } else {
    // Legacy flat in_order matching (turn-agnostic) — unchanged for back-compat.
    let expectedIndex = 0;
    const matchedSteps: string[] = [];

    for (const step of toolSteps) {
      if (expectedIndex >= expectedMatchers.length) {
        break;
      }

      if (matchesTrajectoryStep(step, expectedMatchers[expectedIndex])) {
        matchedSteps.push(formatTrajectoryStep(step));
        expectedIndex += 1;
      }
    }

    basePass = expectedIndex === expectedMatchers.length;

    if (basePass) {
      reason = `Observed tool sequence in order: ${matchedSteps.join(', ')}. Actual tools: ${formatStepList(actualTools)}`;
    } else {
      const nextExpected =
        expectedMatchers[expectedIndex]?.pattern || expectedMatchers[expectedIndex]?.name || '*';
      reason = `Expected tool "${nextExpected}" was not observed in order. Actual tools: ${formatStepList(actualTools)}`;
    }
  }

  const pass = applyInverse(basePass, params.inverse);
  if (params.inverse) {
    reason = basePass
      ? `Forbidden tool sequence was observed. Actual tools: ${formatStepList(actualTools)}`
      : `Forbidden tool sequence was not observed`;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion: params.assertion,
  };
};

export const handleTrajectoryToolArgsMatch = (params: AssertionParams): GradingResult => {
  const trace = getTraceOrThrow(params);
  const toolSteps = extractTrajectorySteps(trace).filter((step) => step.type === 'tool');
  const { matcher, expectedArgs, mode, defaults, ignore } = resolveToolArgsMatchValue(
    params.renderedValue ?? params.assertion.value,
  );
  const matcherLabel = matcher.pattern || matcher.name || '*';
  const actualTools = toolSteps.map(formatTrajectoryStep);
  const matchingSteps = toolSteps.filter((step) => matchesTrajectoryStep(step, matcher));
  const stepsWithArgs = matchingSteps.filter((step) => step.args !== undefined);
  const matchedStep = stepsWithArgs.find((step) =>
    matchesToolArgs(step.args, expectedArgs, mode, defaults, ignore),
  );
  const basePass = matchedStep !== undefined;
  const pass = applyInverse(basePass, params.inverse);
  const ignoredArgs = matchedStep ? stripIgnoredArgs(matchedStep.args, ignore).stripped : [];
  const ignoredDefaults = matchedStep
    ? stripDefaults(stripIgnoredArgs(matchedStep.args, ignore).cleaned, defaults).stripped
    : [];
  const ignoredArgsSuffix =
    ignoredArgs.length > 0 ? `. Ignored argument(s): ${ignoredArgs.join(', ')}` : '';
  const ignoredDefaultsSuffix =
    ignoredDefaults.length > 0
      ? `. Ignored default argument(s): ${ignoredDefaults.join(', ')}`
      : '';
  const expectedArgsLabel = formatTrajectoryArgs(expectedArgs);
  const observedArgsLabel =
    stepsWithArgs.length > 0
      ? stepsWithArgs.map((step) => formatTrajectoryArgs(step.args)).join(', ')
      : '(none)';

  let reason: string;
  if (params.inverse) {
    if (basePass) {
      reason = `Forbidden argument match for tool "${matcherLabel}" was observed on ${formatTrajectoryStep(matchedStep!)}. Args: ${formatTrajectoryArgs(matchedStep!.args)}`;
    } else if (matchingSteps.length === 0) {
      reason = `Forbidden argument match for tool "${matcherLabel}" was not observed because no tool call matched it`;
    } else {
      reason = `Forbidden argument match for tool "${matcherLabel}" was not observed. Observed args: ${observedArgsLabel}`;
    }
  } else if (basePass) {
    reason = `Tool "${matcherLabel}" matched expected arguments (${mode}) on ${formatTrajectoryStep(matchedStep!)}. Args: ${formatTrajectoryArgs(matchedStep!.args)}${ignoredArgsSuffix}${ignoredDefaultsSuffix}`;
  } else if (matchingSteps.length === 0) {
    reason = `No tool call matched "${matcherLabel}". Actual tools: ${formatStepList(actualTools)}`;
  } else if (stepsWithArgs.length === 0) {
    reason = `Tool "${matcherLabel}" was observed but no arguments were captured. Actual tools: ${formatStepList(actualTools)}`;
  } else {
    reason = `No call to tool "${matcherLabel}" matched expected arguments (${mode}): ${expectedArgsLabel}. Observed args: ${observedArgsLabel}`;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion: params.assertion,
  };
};

function resolveStepCountValue(value: unknown): TrajectoryCountValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('trajectory:step-count assertion must have an object value');
  }

  const matcher = normalizeTrajectoryMatcher(value as TrajectoryStepMatcher);
  return {
    ...matcher,
    max:
      typeof (value as TrajectoryCountValue).max === 'number'
        ? (value as TrajectoryCountValue).max
        : undefined,
    min:
      typeof (value as TrajectoryCountValue).min === 'number'
        ? (value as TrajectoryCountValue).min
        : undefined,
  };
}

export const handleTrajectoryStepCount = (params: AssertionParams): GradingResult => {
  const trace = getTraceOrThrow(params);
  const steps = extractTrajectorySteps(trace);
  const matcher = resolveStepCountValue(params.renderedValue ?? params.assertion.value);

  const { min, max } = matcher;
  if (min === undefined && max === undefined) {
    throw new Error('trajectory:step-count assertion must include a min or max property');
  }

  const matchingSteps = steps.filter((step) => matchesTrajectoryStep(step, matcher));
  const count = matchingSteps.length;
  const basePass = (min === undefined || count >= min) && (max === undefined || count <= max);
  const pass = applyInverse(basePass, params.inverse);

  const filterParts: string[] = [];
  if (matcher.type) {
    const types = Array.isArray(matcher.type) ? matcher.type : [matcher.type];
    filterParts.push(`type=${types.join('|')}`);
  }
  const pattern = matcher.pattern || matcher.name;
  if (pattern) {
    filterParts.push(`pattern=${pattern}`);
  }

  let reason = `Matched ${count} trajectory step(s)`;
  if (filterParts.length > 0) {
    reason += ` for ${filterParts.join(', ')}`;
  }

  if (min !== undefined && max !== undefined) {
    reason += ` (expected ${min}-${max})`;
  } else if (min !== undefined) {
    reason += ` (expected at least ${min})`;
  } else if (max !== undefined) {
    reason += ` (expected at most ${max})`;
  }

  if (matchingSteps.length > 0) {
    reason += `. Matches: ${matchingSteps.map(formatTrajectoryStep).join(', ')}`;
  }

  if (params.inverse) {
    reason = basePass
      ? `Trajectory step count satisfied the forbidden range`
      : `Trajectory step count did not satisfy the forbidden range`;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion: params.assertion,
  };
};

export const handleTrajectoryGoalSuccess = async (
  params: AssertionParams,
): Promise<GradingResult> => {
  const trace = getTraceOrThrow(params);
  const { goal } = resolveGoalSuccessValue(params.renderedValue ?? params.assertion.value);
  const trajectory = summarizeTrajectoryForJudge(trace);
  const result = await matchesTrajectoryGoalSuccess(
    goal,
    trajectory,
    params.outputString,
    params.test.options,
    params.assertionValueContext.vars,
    params.assertion,
    params.providerCallContext,
  );

  if (!params.inverse) {
    return result;
  }

  if (isGraderFailure(result)) {
    return { ...result, assertion: params.assertion };
  }

  return {
    ...result,
    assertion: params.assertion,
    pass: !result.pass,
    score: result.pass ? 0 : 1,
    reason: result.pass
      ? `Agent unexpectedly achieved the goal: ${goal}`
      : `Agent did not achieve the forbidden goal: ${goal}`,
  };
};
