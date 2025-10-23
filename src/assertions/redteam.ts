import { getGraderById } from '../redteam/graders';
import type {
  AssertionParams,
  GradingResult,
} from '../types/index';
import invariant from '../util/invariant';

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
  
  // For agent-based strategies, use the final attack message as the prompt
  const promptToGrade = prompt || providerResponse.metadata?.redteamFinalPrompt || '';
  invariant(promptToGrade, `Grader ${baseType} must have a prompt`);
  
  const { grade, rubric, suggestions } = await grader.getResult(
    promptToGrade,
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
