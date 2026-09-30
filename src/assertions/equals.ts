import util from 'util';

import type { AssertionParams, GradingResult } from '../types/index';

function getComparisonKeys(value: object): string[] {
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype) {
    throw new Error('Comparison is not JSON');
  }
  const keys = Object.keys(value);
  if (keys.length > 500 || (array && keys.length !== value.length)) {
    throw new Error('Comparison is not bounded JSON');
  }
  if (keys.some((key, index) => key.length > 20_000 || (array && key !== String(index)))) {
    throw new Error('Comparison has unsupported keys');
  }
  return array ? keys : keys.sort();
}

// Bound display metadata independently of the equality check. Preserve signed zero,
// which util.isDeepStrictEqual distinguishes, and sort keys for stable text diffs.
function formatComparisonJson(value: unknown): string | undefined {
  const parts: string[] = [];
  let length = 0;
  let nodes = 0;
  const append = (text: string) => {
    length += text.length;
    if (length > 20_000) {
      throw new Error('Comparison too large');
    }
    parts.push(text);
  };
  const visit = (item: unknown, depth: number) => {
    if (++nodes > 500 || depth > 20) {
      throw new Error('Comparison too complex');
    }
    if (item === null || typeof item === 'boolean') {
      append(String(item));
      return;
    }
    if (typeof item === 'number' && Number.isFinite(item)) {
      append(Object.is(item, -0) ? '-0' : String(item));
      return;
    }
    if (typeof item === 'string' && item.length <= 20_000) {
      append(JSON.stringify(item));
      return;
    }
    if (typeof item !== 'object') {
      throw new Error('Comparison is not JSON');
    }
    const array = Array.isArray(item);
    const keys = getComparisonKeys(item);
    append(array ? '[' : '{');
    keys.forEach((key, index) => {
      append((index ? ',\n' : '\n') + '  '.repeat(depth + 1));
      if (!array) {
        append(JSON.stringify(key) + ': ');
      }
      visit((item as Record<string, unknown>)[key], depth + 1);
    });
    if (keys.length) {
      append('\n' + '  '.repeat(depth));
    }
    append(array ? ']' : '}');
  };
  try {
    visit(value, 0);
    return parts.join('');
  } catch {
    return undefined;
  }
}

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
  let jsonComparison: { expected: string; actual: string } | undefined;
  if (typeof renderedValue === 'object') {
    try {
      const actual = JSON.parse(outputString);
      pass = util.isDeepStrictEqual(renderedValue, actual) !== inverse;
      if (!pass && !inverse && outputString.length <= 20_000) {
        const expectedJson = formatComparisonJson(renderedValue);
        const actualJson = formatComparisonJson(actual);
        if (expectedJson !== undefined && actualJson !== undefined) {
          jsonComparison = { expected: expectedJson, actual: actualJson };
        }
      }
    } catch {
      // The output is not valid JSON, so it cannot deep-equal the object value (the "equal"
      // result is false). Respect `inverse` (false !== inverse) so `not-equals` passes here
      // instead of falsely failing.
      pass = inverse;
    }
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
    ...(jsonComparison && { metadata: { jsonComparison } }),
  };
};
