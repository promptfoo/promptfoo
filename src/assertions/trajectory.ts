import { matchesTrajectoryGoalSuccess } from '../matchers';
import {
  extractTrajectorySteps,
  formatTrajectoryStep,
  matchesTrajectoryStep,
  normalizeTrajectoryMatcher,
  summarizeTrajectoryForJudge,
  type TrajectoryStepMatcher,
} from './trajectoryUtils';

import type { AssertionParams, GradingResult } from '../types/index';

interface TrajectoryCountValue extends TrajectoryStepMatcher {
  max?: number;
  min?: number;
}

interface TrajectorySequenceValue {
  mode?: 'exact' | 'in_order';
  steps: Array<string | TrajectoryStepMatcher>;
}

interface TrajectoryGoalSuccessValue {
  goal: string;
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
  if (max !== undefined) {
    reason += ` (expected ${min}-${max})`;
  } else {
    reason += ` (expected at least ${min})`;
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
      steps: value as Array<string | TrajectoryStepMatcher>,
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

export const handleTrajectoryToolSequence = (params: AssertionParams): GradingResult => {
  const trace = getTraceOrThrow(params);
  const toolSteps = extractTrajectorySteps(trace).filter((step) => step.type === 'tool');
  const value = resolveSequenceValue(params.renderedValue ?? params.assertion.value);
  const expectedMatchers = value.steps.map((step, index) => {
    const matcher = normalizeTrajectoryMatcher(step, 'tool');
    requireNamedTrajectoryMatcher(matcher, 'trajectory:tool-sequence', index);
    return matcher;
  });

  if (expectedMatchers.length === 0) {
    throw new Error('trajectory:tool-sequence assertion requires at least one expected step');
  }

  const actualTools = toolSteps.map(formatTrajectoryStep);
  let basePass = false;
  let reason = '';

  if (value.mode === 'exact') {
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
