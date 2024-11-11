import util from 'util';
import type { AssertionParams } from '../types';
import type { GradingResult } from '../types';

export const handleEquals = async ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  let pass: boolean;
  if (typeof renderedValue === 'object') {
    try {
      pass = util.isDeepStrictEqual(renderedValue, JSON.parse(outputString)) !== inverse;
    } catch (error) {
      pass = false;
    }
    const stringifiedValue = JSON.stringify(renderedValue);
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
