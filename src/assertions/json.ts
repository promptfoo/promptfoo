import invariant from '../util/invariant';
import { extractJsonObjects, getAjv } from '../util/json';
import { loadYaml } from '../util/yamlLoad';
import type { ValidateFunction } from 'ajv';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Resolves the supplied schema into a validator, independently of the provider
 * output, so an unsupported value is rejected even when there is nothing to
 * validate against. Returns undefined when no schema was supplied.
 */
function compileSchema(
  renderedValue: AssertionParams['renderedValue'],
  valueFromScript: AssertionParams['valueFromScript'],
  assertionType: 'is-json' | 'contains-json',
): ValidateFunction | undefined {
  if (renderedValue === undefined) {
    return undefined;
  }
  if (typeof renderedValue === 'string') {
    if (renderedValue.startsWith('file://')) {
      // Reference the JSON schema from external file
      const schema = valueFromScript;
      invariant(
        schema !== undefined && schema !== null,
        `${assertionType} references a file that does not export a JSON schema`,
      );
      return getAjv().compile(schema as object | boolean);
    }
    // An empty, whitespace-only, or comment-only document supplies no schema
    const scheme = loadYaml(renderedValue) as object | undefined;
    return scheme === undefined ? undefined : getAjv().compile(scheme);
  }
  if (
    typeof renderedValue === 'boolean' ||
    (renderedValue !== null && typeof renderedValue === 'object')
  ) {
    return getAjv().compile(renderedValue);
  }
  throw new Error(`${assertionType} assertion must have a string, object, or boolean value`);
}

export function handleIsJson({
  outputString,
  renderedValue,
  inverse,
  valueFromScript,
  assertion,
}: AssertionParams): GradingResult {
  const validate = compileSchema(renderedValue, valueFromScript, 'is-json');

  let parsedJson;
  let pass;
  try {
    parsedJson = JSON.parse(outputString);
    pass = !inverse;
  } catch {
    pass = inverse;
  }

  if (parsedJson !== undefined && validate) {
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
  const validate = compileSchema(renderedValue, valueFromScript, 'contains-json');

  let errorMessage = `Expected output to ${inverse ? 'not ' : ''}contain valid JSON`;
  const jsonObjects = extractJsonObjects(outputString);
  let pass = inverse ? jsonObjects.length === 0 : jsonObjects.length > 0;

  if (validate) {
    for (const jsonObject of jsonObjects) {
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
