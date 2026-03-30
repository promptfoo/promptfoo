import yaml from 'js-yaml';
import invariant from '../util/invariant';
import { extractJsonObjects, getAjv } from '../util/json';
import type { ValidateFunction } from 'ajv';

import type { AssertionParams, GradingResult } from '../types/index';

function getJsonSchemaValidator({
  renderedValue,
  valueFromScript,
  assertion,
}: Pick<AssertionParams, 'renderedValue' | 'valueFromScript' | 'assertion'>):
  | { validate: ValidateFunction }
  | { failure: GradingResult } {
  try {
    if (typeof renderedValue === 'string') {
      if (renderedValue.startsWith('file://')) {
        const schema = valueFromScript;
        invariant(
          schema !== undefined && schema !== null,
          `${assertion.type} references a file that does not export a JSON schema`,
        );

        return { validate: getAjv().compile(schema as object | boolean) };
      }

      return { validate: getAjv().compile(yaml.load(renderedValue) as object | boolean) };
    }

    if (typeof renderedValue === 'boolean' || typeof renderedValue === 'object') {
      return { validate: getAjv().compile(renderedValue as object | boolean) };
    }

    throw new Error(`${assertion.type} assertion must have a string or object value`);
  } catch (error) {
    return {
      failure: {
        pass: false,
        score: 0,
        reason: `Invalid JSON schema: ${error instanceof Error ? error.message : String(error)}`,
        assertion,
      },
    };
  }
}

export function handleIsJson({
  outputString,
  renderedValue,
  inverse,
  valueFromScript,
  assertion,
}: AssertionParams): GradingResult {
  let parsedJson;
  let pass;
  try {
    parsedJson = JSON.parse(outputString);
    pass = !inverse;
  } catch {
    pass = inverse;
  }

  if (parsedJson !== undefined && renderedValue !== undefined && renderedValue !== null) {
    const validatorResult = getJsonSchemaValidator({ renderedValue, valueFromScript, assertion });
    if ('failure' in validatorResult) {
      return validatorResult.failure;
    }

    const { validate } = validatorResult;
    const valid = validate(parsedJson);
    pass = inverse ? !valid : valid;
    if (!pass) {
      return {
        pass,
        score: 0,
        reason: inverse
          ? 'Output is JSON that conforms to the provided schema'
          : `JSON does not conform to the provided schema. Errors: ${getAjv().errorsText(
              validate.errors,
            )}`,
        assertion,
      };
    }
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : 'Expected output to be valid JSON',
    assertion,
  };
}

export function handleContainsJson({
  assertion,
  renderedValue,
  outputString,
  inverse,
  valueFromScript,
}: AssertionParams): GradingResult {
  let errorMessage = 'Expected output to contain valid JSON';
  const jsonObjects = extractJsonObjects(outputString);
  let pass = inverse ? jsonObjects.length === 0 : jsonObjects.length > 0;
  let validate: ValidateFunction | undefined;

  if (renderedValue !== undefined && renderedValue !== null) {
    const validatorResult = getJsonSchemaValidator({ renderedValue, valueFromScript, assertion });
    if ('failure' in validatorResult) {
      return validatorResult.failure;
    }

    validate = validatorResult.validate;
  }

  for (const jsonObject of jsonObjects) {
    if (validate) {
      const valid = validate(jsonObject);
      pass = inverse ? !valid : valid;
      if (valid) {
        if (inverse) {
          errorMessage = 'Output contains JSON conforming to the provided schema';
        }
        break;
      } else {
        errorMessage = `JSON does not conform to the provided schema. Errors: ${getAjv().errorsText(
          validate.errors,
        )}`;
      }
    }
  }
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : errorMessage,
    assertion,
  };
}
