import yaml from 'js-yaml';
import { extractJsonObjects, getAjv } from '../util/json';
import { processFileReference } from './utils';
import type { ValidateFunction } from 'ajv';

import type { AssertionParams, GradingResult } from '../types/index';

function hasJsonSchema(assertion: AssertionParams['assertion']): boolean {
  return assertion.value !== undefined && assertion.value !== null && assertion.value !== '';
}

function getJsonSchemaValidator({
  renderedValue,
  assertion,
}: Pick<AssertionParams, 'renderedValue' | 'assertion'>):
  | { validate: ValidateFunction }
  | { failure: GradingResult } {
  try {
    let schema: unknown = renderedValue;

    if (typeof renderedValue === 'string') {
      if (renderedValue.startsWith('file://')) {
        schema = processFileReference(renderedValue);
        if (typeof schema === 'string' && renderedValue.endsWith('.txt')) {
          schema = yaml.load(schema);
        }
        if (schema === undefined || schema === null) {
          throw new Error(`${assertion.type} schema file must contain an object or boolean schema`);
        }
      } else {
        schema = yaml.load(renderedValue);
      }
    }

    if (schema === null || (typeof schema !== 'boolean' && typeof schema !== 'object')) {
      throw new Error(`${assertion.type} assertion must have a string, boolean, or object value`);
    }

    return { validate: getAjv().compile(schema as object | boolean) };
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

  if (parsedJson !== undefined && hasJsonSchema(assertion)) {
    const validatorResult = getJsonSchemaValidator({ renderedValue, assertion });
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
}: AssertionParams): GradingResult {
  let errorMessage = 'Expected output to contain valid JSON';
  const jsonObjects = extractJsonObjects(outputString);
  let pass = inverse ? jsonObjects.length === 0 : jsonObjects.length > 0;
  let validate: ValidateFunction | undefined;

  if (jsonObjects.length > 0 && hasJsonSchema(assertion)) {
    const validatorResult = getJsonSchemaValidator({ renderedValue, assertion });
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
