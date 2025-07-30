import { matchesGEval } from '../matchers';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types';

export const handleGEval = async ({
  assertion,
  renderedValue,
  prompt,
  outputString,
  test,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' || Array.isArray(renderedValue),
    'G-Eval assertion type must have a string or array of strings value',
  );

  const threshold = assertion.threshold ?? 0.7;

  if (Array.isArray(renderedValue)) {
    const scores: number[] = [];
    const reasons: string[] = [];
    for (const value of renderedValue) {
      const resp = await matchesGEval(value, prompt || '', outputString, threshold, test.options);

      scores.push(resp.score);
      reasons.push(resp.reason);
    }

    const scoresSum = scores.reduce((a, b) => a + b, 0);

    return {
      assertion,
      pass: scoresSum / scores.length >= threshold,
      score: scoresSum / scores.length,
      reason: reasons.join('\n\n'),
    };
  } else {
    const resp = await matchesGEval(
      renderedValue,
      prompt || '',
      outputString,
      threshold,
      test.options,
    );

    return {
      assertion,
      ...resp,
    };
  }
};
