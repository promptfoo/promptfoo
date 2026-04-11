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

    // Filter out max-score and select-best assertions
    const relevantResults = componentResults.filter(
      (r: GradingResult) =>
        r.assertion && r.assertion.type !== 'max-score' && r.assertion.type !== 'select-best',
    );

    if (relevantResults.length === 0) {
      throw new Error(
        'max-score requires at least one other assertion (besides max-score or select-best) to aggregate scores from',
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
