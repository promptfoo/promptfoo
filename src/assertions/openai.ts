import type { OpenAiChatCompletionProvider } from '../providers/openai/chat';
import { validateFunctionCall } from '../providers/openai/util';
import type { AssertionParams } from '../types';
import type { GradingResult } from '../types';
import { renderVarsInObject, maybeLoadFromExternalFile } from '../util';
import invariant from '../util/invariant';

export const handleIsValidOpenAiFunctionCall = async ({
  assertion,
  output,
  provider,
  test,
}: AssertionParams): Promise<GradingResult> => {
  if (typeof output === 'object' && 'function_call' in output) {
    output = (output as { function_call: any }).function_call;
  }
  const functionOutput = output as { arguments: string; name: string };
  if (
    typeof functionOutput !== 'object' ||
    typeof functionOutput.name !== 'string' ||
    typeof functionOutput.arguments !== 'string'
  ) {
    return {
      pass: false,
      score: 0,
      reason: `OpenAI did not return a valid-looking function call: ${JSON.stringify(
        functionOutput,
      )}`,
      assertion,
    };
  }
  try {
    await validateFunctionCall(
      functionOutput,
      (provider as OpenAiChatCompletionProvider).config.functions,
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

export const handleIsValidOpenAiToolsCall = async ({
  assertion,
  output,
  provider,
  test,
}: AssertionParams): Promise<GradingResult> => {
  if (typeof output === 'object' && 'tool_calls' in output) {
    output = (output as { tool_calls: any }).tool_calls;
  }
  const toolsOutput = output as {
    type: 'function';
    function: { arguments: string; name: string };
  }[];
  if (
    !Array.isArray(toolsOutput) ||
    toolsOutput.length === 0 ||
    typeof toolsOutput[0].function.name !== 'string' ||
    typeof toolsOutput[0].function.arguments !== 'string'
  ) {
    return {
      pass: false,
      score: 0,
      reason: `OpenAI did not return a valid-looking tools response: ${JSON.stringify(
        toolsOutput,
      )}`,
      assertion,
    };
  }

  let tools = (provider as OpenAiChatCompletionProvider).config.tools;
  if (tools) {
    tools = await maybeLoadFromExternalFile(renderVarsInObject(tools, test.vars));
  }
  invariant(
    tools,
    `Tools are expected to be an array of objects with a function property. Got: ${JSON.stringify(
      tools,
    )}`,
  );
  try {
    // Use Promise.all to properly await all async validateFunctionCall operations
    await Promise.all(
      toolsOutput.map((toolOutput) => 
        validateFunctionCall(
          toolOutput.function,
          tools.map((tool) => tool.function),
          test.vars,
        )
      )
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
