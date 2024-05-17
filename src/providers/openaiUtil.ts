import Ajv from 'ajv';
import { getNunjucksEngine } from '../util';

const ajv = new Ajv();

export interface OpenAiFunction {
  name: string;
  description?: string;
  parameters: any;
}

export interface OpenAiTool {
  type: string;
  function: OpenAiFunction;
}

export function validateFunctionCall(
  functionCall: { arguments: string; name: string },
  functions?: OpenAiFunction[],
) {
  // Parse function call and validate it against schema
  const functionArgs = JSON.parse(functionCall.arguments);
  const functionName = functionCall.name;
  const functionSchema = functions?.find((f) => f.name === functionName)?.parameters;
  if (!functionSchema) {
    throw new Error(`Called "${functionName}", but there is no function with that name`);
  }
  const validate = ajv.compile(functionSchema);
  if (!validate(functionArgs)) {
    throw new Error(
      `Call to "${functionName}" does not match schema: ${JSON.stringify(validate.errors)}`,
    );
  }
}