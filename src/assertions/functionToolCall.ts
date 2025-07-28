import { AIStudioChatProvider } from '../providers/google/ai.studio';
import { GoogleLiveProvider } from '../providers/google/live';
import { validateFunctionCall as validateGoogleFunctionCall } from '../providers/google/util';
import { VertexChatProvider } from '../providers/google/vertex';
import { OpenAiChatCompletionProvider } from '../providers/openai/chat';
import { validateFunctionCall as validateOpenAIFunctionCall } from '../providers/openai/util';

import type { AssertionParams, GradingResult } from '../types';

export const handleIsValidFunctionCall = ({
  assertion,
  output,
  provider,
  test,
}: AssertionParams): GradingResult => {
  try {
    if (
      provider instanceof AIStudioChatProvider ||
      provider instanceof GoogleLiveProvider ||
      provider instanceof VertexChatProvider
    ) {
      validateGoogleFunctionCall(
        output,
        (provider as AIStudioChatProvider | GoogleLiveProvider | VertexChatProvider).config?.tools,
        test.vars,
      );
    } else if (provider instanceof OpenAiChatCompletionProvider) {
      validateOpenAIFunctionCall(
        output,
        (provider as OpenAiChatCompletionProvider).config.functions,
        test.vars,
      );
    } else {
      throw new Error(`Provider does not have functionality for checking function call.`);
    }
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
