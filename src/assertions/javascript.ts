import { type GradingResult, isGradingResult } from '../types/index';
import invariant from '../util/invariant';
import { getProcessShim } from '../util/transform';

import type { AssertionParams } from '../types/index';

const validateResult = async (result: any): Promise<boolean | number | GradingResult> => {
  result = await Promise.resolve(result);
  if (typeof result === 'boolean' || typeof result === 'number' || isGradingResult(result)) {
    return result;
  } else {
    throw new Error(
      `Custom function must return a boolean, number, or GradingResult object. Got type ${typeof result}: ${JSON.stringify(
        result,
      )}`,
    );
  }
};

export const handleJavascript = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  outputString,
  output,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  let pass;
  let score;
  try {
    if (typeof assertion.value === 'function') {
      let ret = assertion.value(outputString, assertionValueContext);
      ret = await validateResult(ret);
      if (!ret.assertion) {
        // Populate the assertion object if the custom function didn't return it.
        const functionString = assertion.value.toString();
        ret.assertion = {
          type: 'javascript',
          value: functionString.length > 50 ? functionString.slice(0, 50) + '...' : functionString,
        };
      }
      return ret;
    }
    invariant(typeof renderedValue === 'string', 'javascript assertion must have a string value');

    /**
     * Removes trailing newline from the rendered value.
     * This is necessary for handling multi-line string literals in YAML
     * that are defined on a single line in the YAML file.
     *
     * @example
     * value: |
     *   output === 'true'
     */
    renderedValue = renderedValue.trimEnd();

    let result: boolean | number | GradingResult;
    if (typeof valueFromScript === 'undefined') {
      const functionBody = renderedValue.includes('\n') ? renderedValue : `return ${renderedValue}`;
      // Pass process shim for ESM compatibility - allows process.mainModule.require to work
      const customFunction = new Function('output', 'context', 'process', functionBody);
      result = await validateResult(
        customFunction(output, assertionValueContext, getProcessShim()),
      );
    } else {
      invariant(
        typeof valueFromScript === 'boolean' ||
          typeof valueFromScript === 'number' ||
          typeof valueFromScript === 'object',
        `Javascript assertion script must return a boolean, number, or object (${assertion.value})`,
      );
      result = await validateResult(valueFromScript);
    }

    if (typeof result === 'boolean') {
      pass = result !== inverse;
      score = pass ? 1 : 0;
    } else if (typeof result === 'number') {
      pass = assertion.threshold !== undefined ? result >= assertion.threshold : result > 0;
      score = result;
    } else if (typeof result === 'object') {
      return result;
    } else {
      throw new Error('Custom function must return a boolean or number');
    }
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Custom function threw error: ${(err as Error).message}
Stack Trace: ${(err as Error).stack}
${renderedValue}`,
      assertion,
    };
  }
  return {
    pass,
    score,
    reason: pass
      ? 'Assertion passed'
      : `Custom function returned ${inverse ? 'true' : 'false'}
${renderedValue}`,
    assertion,
  };
};
