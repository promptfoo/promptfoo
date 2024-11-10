import util from 'util';
import type { Assertion } from '../types';
import type { AssertionValue } from '../types';
import type { GradingResult } from '../types';
import { coerceString } from './utils';

export const handleEquals = async (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): Promise<GradingResult> => {
  let pass: boolean;
  const outputString = coerceString(output);
  if (typeof renderedValue === 'object') {
    pass = util.isDeepStrictEqual(renderedValue, JSON.parse(outputString)) !== inverse;
    renderedValue = JSON.stringify(renderedValue);
  } else {
    pass = (renderedValue == outputString) !== inverse;
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
