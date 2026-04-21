import { isGraderFailure, matchesGEval } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { accumulateTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';

import type { AssertionParams, GradingResult } from '../types/index';

type MatcherResponse = Awaited<ReturnType<typeof matchesGEval>>;

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
    const responses: MatcherResponse[] = [];
    let failure: { index: number; resp: MatcherResponse } | undefined;
    for (const [index, value] of renderedValue.entries()) {
      const resp = await matchesGEval(
        value,
        prompt || '',
        outputString,
        threshold,
        test.options,
        providerCallContext,
      );
      responses.push(resp);
      if (isGraderFailure(resp)) {
        failure = { index, resp };
        break;
      }
    }

    const tokensUsed = createEmptyTokenUsage();
    for (const r of responses) {
      accumulateTokenUsage(tokensUsed, r.tokensUsed);
    }

    if (failure) {
      const criterion = renderedValue[failure.index];
      return {
        assertion,
        pass: false,
        score: 0,
        reason: `G-Eval criterion ${failure.index + 1}/${renderedValue.length} (${JSON.stringify(criterion)}) failed: ${failure.resp.reason}`,
        tokensUsed,
        metadata: failure.resp.metadata,
      };
    }

    const averageScore = responses.reduce((acc, r) => acc + r.score, 0) / responses.length;
    const combinedReason = responses.map((r) => r.reason).join('\n\n');
    const passed = averageScore >= threshold !== inverse;

    return {
      assertion,
      pass: passed,
      score: inverse ? 1 - averageScore : averageScore,
      reason: combinedReason,
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
