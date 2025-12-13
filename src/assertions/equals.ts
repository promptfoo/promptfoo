import util from 'util';
import { safeJsonParse } from '../util/json';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleEquals = async ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: Pick<
  AssertionParams,
  'assertion' | 'renderedValue' | 'outputString' | 'inverse'
>): Promise<GradingResult> => {
  let pass: boolean;
  if (typeof renderedValue === 'object') {
    const parsedOutput = safeJsonParse(outputString);
    pass = parsedOutput !== undefined
      ? util.isDeepStrictEqual(renderedValue, parsedOutput) !== inverse
      : false;
    renderedValue = JSON.stringify(renderedValue);
  } else {
    pass = (String(renderedValue) === outputString) !== inverse;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output "${outputString}" to ${inverse ? 'not ' : ''}equal "${renderedValue}"`,
    assertion,
  };
};
