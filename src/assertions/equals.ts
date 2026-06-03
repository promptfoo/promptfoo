import type { AssertionParams, GradingResult } from '../types/index';

function getEnumerableOwnKeys(value: object): Array<string | symbol> {
  return Reflect.ownKeys(value).filter(
    (key) => Object.getOwnPropertyDescriptor(value, key)?.enumerable,
  );
}

function isJsonDeepEqual(
  left: unknown,
  right: unknown,
  compared = new WeakMap<object, WeakSet<object>>(),
): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  if (Object.getPrototypeOf(leftRecord) !== Object.getPrototypeOf(rightRecord)) {
    return false;
  }

  const comparedWithLeft = compared.get(leftRecord);
  if (comparedWithLeft?.has(rightRecord)) {
    return true;
  }
  if (comparedWithLeft) {
    comparedWithLeft.add(rightRecord);
  } else {
    compared.set(leftRecord, new WeakSet([rightRecord]));
  }

  const leftKeys = getEnumerableOwnKeys(leftRecord);
  const rightKeys = getEnumerableOwnKeys(rightRecord);
  if (leftKeys.length !== rightKeys.length || !leftKeys.every((key) => rightKeys.includes(key))) {
    return false;
  }

  return leftKeys.every((key) =>
    isJsonDeepEqual(Reflect.get(leftRecord, key), Reflect.get(rightRecord, key), compared),
  );
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
  if (typeof renderedValue === 'object') {
    try {
      pass = isJsonDeepEqual(renderedValue, JSON.parse(outputString)) !== inverse;
    } catch {
      pass = false;
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
  };
};
