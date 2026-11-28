import invariant from '../util/invariant';
import {
  compileAssertionSchema,
  compileInlineAssertionSchema,
  extractJsonObjects,
  schemaValidationFailure,
} from '../util/json';
import type { ValidateFunction } from 'ajv';

import type { AssertionParams, GradingResult } from '../types/index';

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

  if (parsedJson !== undefined && renderedValue) {
    let validate: ValidateFunction;
    if (typeof renderedValue === 'string') {
      if (renderedValue.startsWith('file://')) {
        // Reference the JSON schema from external file
        const schema = valueFromScript;
        invariant(schema, 'is-json references a file that does not export a JSON schema');
        validate = compileAssertionSchema(schema as object);
      } else {
        validate = compileInlineAssertionSchema(renderedValue);
      }
    } else if (typeof renderedValue === 'object') {
      validate = compileAssertionSchema(renderedValue);
    } else {
      throw new Error('is-json assertion must have a string or object value');
    }
    const valid = validate(parsedJson);
    pass = inverse ? !valid : valid;
    if (!pass) {
      return {
        pass,
        score: 0,
        reason: inverse
          ? 'Output is JSON that conforms to the provided schema'
          : schemaValidationFailure(validate),
        assertion,
      };
    }
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : `Expected output to ${inverse ? 'not ' : ''}be valid JSON`,
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
  let errorMessage = `Expected output to ${inverse ? 'not ' : ''}contain valid JSON`;
  const jsonObjects = extractJsonObjects(outputString);
  let pass = inverse ? jsonObjects.length === 0 : jsonObjects.length > 0;
  for (const jsonObject of jsonObjects) {
    if (renderedValue) {
      let validate: ValidateFunction;
      if (typeof renderedValue === 'string') {
        if (renderedValue.startsWith('file://')) {
          // Reference the JSON schema from external file
          const schema = valueFromScript;
          invariant(schema, 'contains-json references a file that does not export a JSON schema');
          validate = compileAssertionSchema(schema as object);
        } else {
          validate = compileInlineAssertionSchema(renderedValue);
        }
      } else if (typeof renderedValue === 'object') {
        validate = compileAssertionSchema(renderedValue);
      } else {
        throw new Error('contains-json assertion must have a string or object value');
      }
      const valid = validate(jsonObject);
      pass = inverse ? !valid : valid;
      if (valid) {
        if (inverse) {
          errorMessage = 'Output contains JSON conforming to the provided schema';
        }
        break;
      } else {
        errorMessage = schemaValidationFailure(validate);
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
