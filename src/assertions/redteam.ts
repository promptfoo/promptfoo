import invariant from 'tiny-invariant';
import { getGraderById } from '../redteam/graders';
import type { ApiProvider, Assertion, AssertionValue, GradingResult, TestCase } from '../types';
import { coerceString } from './utils';

export const handleRedteam = async (
  assertion: Assertion,
  baseType: string,
  test: TestCase,
  prompt: string | undefined,
  output: string | object,
  provider: ApiProvider | undefined,
  renderedValue: AssertionValue | undefined,
): Promise<GradingResult> => {
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
