import { getGraderById } from '../redteam/graders';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * As the name implies, this function "handles" redteam assertions by either calling the
 * grader or preferably returning a `storedGraderResult` if it exists on the provider response.
 */
export const handleRedteam = async ({
  assertion,
  baseType,
  test,
  prompt,
  outputString,
  provider,
  renderedValue,
  providerResponse,
}: AssertionParams): Promise<GradingResult> => {
  // Skip grading if stored result exists from strategy execution for this specific assertion
  if (
    providerResponse.metadata?.storedGraderResult &&
    test.metadata?.pluginId &&
    assertion.type.includes(test.metadata.pluginId)
  ) {
    const storedResult = providerResponse.metadata.storedGraderResult;

    return {
      ...storedResult,
      assertion: {
        ...(storedResult.assertion ?? assertion),
        value: storedResult.assertion?.value || assertion.value,
      },
      metadata: {
        ...test.metadata,
        ...storedResult.metadata,
      },
    };
  }

  const grader = getGraderById(assertion.type);
  invariant(grader, `Unknown grader: ${baseType}`);

  // Handle missing prompt gracefully instead of throwing
  // This can happen when preview/test runs occur before attack generation
  if (!prompt || prompt.trim() === '') {
    return {
      pass: false,
      score: 0,
      reason: `No prompt available for grader ${baseType}. Ensure attack generation ran before testing. If using the UI, wait for test case generation to complete.`,
      assertion,
    };
  }

  const { grade, rubric, suggestions } = await grader.getResult(
    prompt,
    outputString,
    test,
    provider,
    renderedValue,
  );

  return {
    ...grade,
    ...(grade.assertion || assertion
      ? {
          assertion: {
            ...(grade.assertion ?? assertion),
            value: rubric,
          },
        }
      : {}),
    suggestions,
    metadata: {
      // Pass through all test metadata for redteam
      ...test.metadata,
      ...grade.metadata,
    },
  };
};
