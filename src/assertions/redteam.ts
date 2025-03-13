import { getGraderById } from '../redteam/graders';
import type { Assertion, AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handleRedteam = async ({
  assertion,
  baseType,
  test,
  prompt,
  outputString,
  provider,
  renderedValue,
}: AssertionParams): Promise<GradingResult> => {
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
  const finalAssertion: Assertion = {
    ...assertion,
    value: rubric,
  };
  grade.componentResults?.forEach((componentResult: GradingResult) => {
    componentResult.assertion = finalAssertion;
  });
  return {
    assertion: finalAssertion,
    ...grade,
    suggestions,
    metadata: {
      // Pass through all test metadata for redteam
      ...test.metadata,
      ...grade.metadata,
    },
  };
};
