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
  invariant(prompt, `Grader ${baseType} must have a prompt`);
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
