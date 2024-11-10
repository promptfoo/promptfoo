import invariant from 'tiny-invariant';
import { getGraderById } from '../redteam/graders';
import type { AssertionParams, GradingResult } from '../types';
import { coerceString } from './utils';

export const handleRedteam = async ({
  assertion,
  baseType,
  test,
  prompt,
  output,
  provider,
  renderedValue,
}: AssertionParams): Promise<GradingResult> => {
  const grader = getGraderById(assertion.type);
  invariant(grader, `Unknown promptfoo grader: ${baseType}`);
  invariant(prompt, `Promptfoo grader ${baseType} must have a prompt`);
  const outputString = coerceString(output);
  const { grade, rubric, suggestions } = await grader.getResult(
    prompt,
    outputString,
    test,
    provider,
    renderedValue,
  );
  return {
    assertion: {
      ...assertion,
      value: rubric,
    },
    ...grade,
    suggestions,
    metadata: {
      // Pass through all test metadata for redteam
      ...test.metadata,
      ...grade.metadata,
    },
  };
};
