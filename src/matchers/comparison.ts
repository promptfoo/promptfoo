import { SELECT_BEST_PROMPT } from '../prompts/index';
import { getDefaultProviders } from '../providers/defaults';
import invariant from '../util/invariant';
import { callProviderWithContext, getAndCheckProvider } from './providers';
import { loadRubricPrompt, renderLlmRubricPrompt } from './rubric';
import { fail, normalizeMatcherTokenUsage, tryParse } from './shared';

import type {
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  VarValue,
} from '../types/index';

export const METRIC_SELECTOR_ASSERTION_TYPES = [
  'select-lowest-cost',
  'select-lowest-latency',
] as const;

export type MetricSelectorAssertionType = (typeof METRIC_SELECTOR_ASSERTION_TYPES)[number];

type MetricSelectorCandidate = {
  latencyMs?: number;
  promptIdx: number;
  response?: { cached?: boolean; cost?: number };
  success: boolean;
};

const selectorDefinitions = {
  'select-lowest-cost': {
    direction: 'min',
    label: 'cost',
    value: (result: MetricSelectorCandidate) => result.response?.cost,
  },
  'select-lowest-latency': {
    direction: 'min',
    label: 'latency',
    value: (result: MetricSelectorCandidate) => result.latencyMs,
  },
} as const;

export function isMetricSelectorAssertionType(
  type: string | undefined,
): type is MetricSelectorAssertionType {
  return METRIC_SELECTOR_ASSERTION_TYPES.some((candidate) => candidate === type);
}

const isValidMetric = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export async function selectMetric(
  results: MetricSelectorCandidate[],
  assertion: Assertion,
): Promise<Omit<GradingResult, 'assertion'>[]> {
  invariant(
    isMetricSelectorAssertionType(assertion.type),
    `Unsupported selector: ${assertion.type}`,
  );
  invariant(
    results.length >= 2,
    `${assertion.type} assertion must have at least two outputs to compare between`,
  );

  const definition = selectorDefinitions[assertion.type];
  const values = results.map(definition.value);
  const onlyPassing =
    assertion.type === 'select-lowest-latency' ||
    (assertion.value !== null &&
      typeof assertion.value === 'object' &&
      'onlyPassing' in assertion.value &&
      assertion.value.onlyPassing === true);
  const failAll = (reason: string) =>
    results.map(() => ({
      pass: false,
      score: 0,
      reason,
    }));
  const eligible = results.flatMap((result, index) =>
    !onlyPassing || result.success ? [index] : [],
  );

  if (eligible.length === 0) {
    return failAll(
      `${assertion.type} requires at least one eligible output; all outputs failed other assertions`,
    );
  }

  const cached = eligible.filter((index) => results[index].response?.cached);
  if (cached.length > 0) {
    return failAll(
      `${assertion.type} does not support cached eligible outputs (prompt indexes: ${cached.map((index) => results[index].promptIdx).join(', ')}). Rerun the eval with --no-cache`,
    );
  }

  const invalid = eligible.filter((index) => !isValidMetric(values[index]));
  if (invalid.length > 0) {
    return failAll(
      `${assertion.type} requires every eligible output to report a finite, non-negative ${definition.label}; missing or invalid ${definition.label} for prompt indexes: ${invalid.map((index) => results[index].promptIdx).join(', ')}`,
    );
  }

  let winner = eligible[0];
  for (const index of eligible.slice(1)) {
    const value = values[index]!;
    const winnerValue = values[winner]!;
    const better = definition.direction === 'min' ? value < winnerValue : value > winnerValue;
    if (better || (value === winnerValue && results[index].promptIdx < results[winner].promptIdx)) {
      winner = index;
    }
  }

  const objective = definition.direction === 'min' ? 'lowest' : 'highest';
  return results.map((_result, index) => {
    if (onlyPassing && !results[index].success) {
      return {
        pass: false,
        score: 0,
        reason: `Not eligible for ${assertion.type} because the output failed another assertion`,
      };
    }
    const selected = index === winner;
    return {
      pass: selected,
      score: selected ? 1 : 0,
      reason: selected
        ? `Selected as ${objective} ${definition.label} output (${definition.label}: ${values[index]})`
        : `Not selected (${definition.label}: ${values[index]}, ${objective}: ${values[winner]})`,
    };
  });
}

export async function matchesSelectBest(
  criteria: string,
  outputs: string[],
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>[]> {
  invariant(
    outputs.length >= 2,
    'select-best assertion must have at least two outputs to compare between',
  );
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'select-best check',
  );

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, SELECT_BEST_PROMPT);
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    criteria,
    outputs: outputs.map((o) => tryParse(o)),
    ...(vars || {}),
  });

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'select-best',
    {
      criteria,
      outputs: outputs.map((o) => tryParse(o)),
      ...(vars || {}),
    },
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    return Array.from({ length: outputs.length }, () =>
      fail(resp.error || 'No output', resp.tokenUsage),
    );
  }

  invariant(typeof resp.output === 'string', 'select-best produced malformed response');

  const firstIntegerMatch = resp.output.trim().match(/\d+/);
  const verdict = firstIntegerMatch ? Number.parseInt(firstIntegerMatch[0], 10) : Number.NaN;

  if (Number.isNaN(verdict) || verdict < 0 || verdict >= outputs.length) {
    return Array.from({ length: outputs.length }, () =>
      fail(`Invalid select-best verdict: ${verdict}`, resp.tokenUsage),
    );
  }

  const tokensUsed = normalizeMatcherTokenUsage(resp.tokenUsage);
  return outputs.map((_output, index) => {
    if (index === verdict) {
      return {
        pass: true,
        score: 1,
        reason: `Output selected as the best: ${criteria}`,
        tokensUsed,
      };
    } else {
      return {
        pass: false,
        score: 0,
        reason: `Output not selected: ${criteria}`,
        tokensUsed,
      };
    }
  });
}

export async function selectMaxScore(
  outputs: string[],
  resultsWithGradingResults: Array<{
    gradingResult?: { componentResults?: GradingResult[] } | null;
  }>,
  assertion: Assertion,
): Promise<Omit<GradingResult, 'assertion'>[]> {
  invariant(
    outputs.length >= 2,
    'max-score assertion must have at least two outputs to compare between',
  );

  // Parse options from assertion value
  const value = assertion.value || {};
  const options = {
    method: (typeof value === 'object' && 'method' in value ? value.method : 'average') as
      | 'average'
      | 'sum',
    weights: (typeof value === 'object' && 'weights' in value ? value.weights : {}) as Record<
      string,
      number
    >,
    threshold:
      typeof value === 'object' && 'threshold' in value ? (value.threshold as number) : undefined,
  };

  // Calculate aggregate score for each output
  const scores = resultsWithGradingResults.map((result, index) => {
    // Get component results from gradingResult if available
    const componentResults = result.gradingResult?.componentResults || [];

    // Selection assertions are evaluated separately and must not contribute to max-score.
    const relevantResults = componentResults.filter(
      (r: GradingResult) =>
        r.assertion && r.assertion.type !== 'max-score' && !r.assertion.type.startsWith('select-'),
    );

    if (relevantResults.length === 0) {
      throw new Error(
        'max-score requires at least one other assertion (besides max-score or select-* assertions) to aggregate scores from',
      );
    }

    // Calculate weighted scores for each assertion
    let totalWeightedScore = 0;
    let totalWeight = 0;

    relevantResults.forEach((componentResult: GradingResult) => {
      const assertionType = componentResult.assertion?.type || 'unknown';
      const weight =
        options.weights[assertionType] === undefined ? 1.0 : options.weights[assertionType]; // Default weight is 1

      const score = componentResult.score || 0;
      totalWeightedScore += score * weight;
      totalWeight += weight;
    });

    // Calculate aggregate score based on method
    let aggregateScore: number;
    if (options.method === 'sum') {
      aggregateScore = totalWeightedScore;
    } else {
      // Average method (default)
      aggregateScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    }

    return {
      index,
      score: aggregateScore,
      componentCount: relevantResults.length,
      totalWeight,
    };
  });

  // Find max score (with deterministic tie-breaking by index)
  let maxScore = -Infinity;
  let winnerIndex = 0;

  for (let i = 0; i < scores.length; i++) {
    if (scores[i].score > maxScore) {
      maxScore = scores[i].score;
      winnerIndex = i;
    }
  }

  // Apply threshold if specified
  const meetsThreshold = options.threshold === undefined || maxScore >= options.threshold;

  // Return results for each output
  return scores.map(({ index, score, componentCount, totalWeight }) => {
    const isWinner = index === winnerIndex && meetsThreshold;

    return {
      pass: isWinner,
      score: isWinner ? 1 : 0,
      reason: isWinner
        ? `Selected as highest scoring output (score: ${score.toFixed(3)})`
        : score === maxScore && !meetsThreshold
          ? `Not selected - score ${score.toFixed(3)} below threshold ${options.threshold}`
          : `Not selected (score: ${score.toFixed(3)}, max: ${maxScore.toFixed(3)})`,
      namedScores: {
        maxScore: score,
        assertionCount: componentCount,
        totalWeight,
      },
    };
  });
}
