import { isGraderFailure, matchesGEval } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { accumulateTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleGEval = async ({
  assertion,
  inverse,
  renderedValue,
  prompt,
  outputString,
  test,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' ||
      (Array.isArray(renderedValue) && renderedValue.every((value) => typeof value === 'string')),
    'G-Eval assertion type must have a string or array of strings value',
  );

  const threshold = assertion.threshold ?? 0.7;

  if (Array.isArray(renderedValue)) {
    if (renderedValue.length === 0) {
      return {
        assertion,
        pass: false,
        score: 0,
        reason: 'G-Eval assertion requires at least one criterion string in the value array.',
      };
    }

    // Evaluate criteria serially so we can short-circuit on the first grader
    // failure — a grader transport/parse failure is propagated verbatim without
    // inversion, and continuing to spend grader calls on the remaining criteria
    // would be wasted API cost.
    const tokensUsed = createEmptyTokenUsage();
    const reasons: string[] = [];
    let totalScore = 0;
    for (const [index, value] of renderedValue.entries()) {
      const resp = await matchesGEval(
        value,
        prompt || '',
        outputString,
        threshold,
        test.options,
        providerCallContext,
      );
      accumulateTokenUsage(tokensUsed, resp.tokensUsed);
      if (isGraderFailure(resp)) {
        const criterion = renderedValue[index];
        return {
          assertion,
          pass: false,
          score: 0,
          reason: `G-Eval criterion ${index + 1}/${renderedValue.length} (${JSON.stringify(criterion)}) failed: ${resp.reason}`,
          tokensUsed,
          metadata: resp.metadata,
        };
      }
      totalScore += resp.score;
      reasons.push(resp.reason);
    }

    const averageScore = totalScore / reasons.length;
    const passed = averageScore >= threshold !== inverse;

    return {
      assertion,
      pass: passed,
      score: inverse ? 1 - averageScore : averageScore,
      reason: reasons.join('\n\n'),
      tokensUsed,
    };
  }

  const resp = await matchesGEval(
    renderedValue,
    prompt || '',
    outputString,
    threshold,
    test.options,
    providerCallContext,
  );

  if (isGraderFailure(resp)) {
    return {
      assertion,
      pass: false,
      score: 0,
      reason: resp.reason,
      tokensUsed: resp.tokensUsed,
      metadata: resp.metadata,
    };
  }

  const passed = resp.score >= threshold !== inverse;

  return {
    assertion,
    ...resp,
    pass: passed,
    score: inverse ? 1 - resp.score : resp.score,
  };
};
