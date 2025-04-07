import type { AIStudioChatProvider } from '../providers/google/ai.studio';
import type { GoogleMMLiveProvider } from '../providers/google/live';
import { validateFunctionCall } from '../providers/google/util';
import type { VertexChatProvider } from '../providers/google/vertex';
import type { AssertionParams } from '../types';
import type { GradingResult } from '../types';

export const handleIsValidGoogleFunctionCall = ({
  assertion,
  output,
  provider,
  test,
}: AssertionParams): GradingResult => {
  if (typeof output === 'object' && 'functionCall' in output) {
    output = (output as { functionCall: any }).functionCall;
  }
  const functionOutput = output as { args: string; name: string };
  if (
    typeof functionOutput !== 'object' ||
    typeof functionOutput.name !== 'string' ||
    typeof functionOutput.args !== 'string'
  ) {
    return {
      pass: false,
      score: 0,
      reason: `Google did not return a valid-looking function call: ${JSON.stringify(
        functionOutput,
      )}`,
      assertion,
    };
  }
  try {
    validateFunctionCall(
      functionOutput,
      (provider as AIStudioChatProvider | GoogleMMLiveProvider | VertexChatProvider).config.tools,
      test.vars,
    );
    return {
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion,
    };
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: (err as Error).message,
      assertion,
    };
  }
};
