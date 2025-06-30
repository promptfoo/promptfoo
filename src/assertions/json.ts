import type { ValidateFunction } from 'ajv';
import yaml from 'js-yaml';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';
import { extractJsonObjects, getAjv } from '../util/json';

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

  if (pass && renderedValue) {
    let validate: ValidateFunction;
    if (typeof renderedValue === 'string') {
      if (renderedValue.startsWith('file://')) {
        // Reference the JSON schema from external file
        const schema = valueFromScript;
        invariant(schema, 'is-json references a file that does not export a JSON schema');
        validate = getAjv().compile(schema as object);
      } else {
        const scheme = yaml.load(renderedValue) as object;
        validate = getAjv().compile(scheme);
      }
    } else if (typeof renderedValue === 'object') {
      validate = getAjv().compile(renderedValue);
    } else {
      throw new Error('is-json assertion must have a string or object value');
    }
    pass = validate(parsedJson);
    if (!pass) {
      return {
        pass,
        score: 0,
        reason: `JSON does not conform to the provided schema. Errors: ${getAjv().errorsText(
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
  for (const jsonObject of jsonObjects) {
    if (renderedValue) {
      let validate: ValidateFunction;
      if (typeof renderedValue === 'string') {
        if (renderedValue.startsWith('file://')) {
          // Reference the JSON schema from external file
          const schema = valueFromScript;
          invariant(schema, 'contains-json references a file that does not export a JSON schema');
          validate = getAjv().compile(schema as object);
        } else {
          const scheme = yaml.load(renderedValue) as object;
          validate = getAjv().compile(scheme);
        }
      } else if (typeof renderedValue === 'object') {
        validate = getAjv().compile(renderedValue);
      } else {
        throw new Error('contains-json assertion must have a string or object value');
      }
      pass = validate(jsonObject);
      if (pass) {
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
