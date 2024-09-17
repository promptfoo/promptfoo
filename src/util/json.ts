import invariant from 'tiny-invariant';

export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export function safeJsonStringify(value: any, prettyPrint: boolean = false): string {
  // Prevent circular references
  const cache = new Set();
  const space = prettyPrint ? 2 : undefined;
  return JSON.stringify(
    value,
    (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (cache.has(val)) {
          return;
        }
        cache.add(val);
      }
      return val;
    },
    space,
  );
}

export function extractJsonObjects(str: string): object[] {
  // This will extract all json objects from a string

  const jsonObjects = [];
  let openBracket = str.indexOf('{');
  let closeBracket = str.indexOf('}', openBracket);
  // Iterate over the string until we find a valid JSON-like pattern
  // Iterate over all trailing } until the contents parse as json
  const MAX_ATTEMPTS = 10;
  let openBracketAttempts = 0;
  while (openBracket !== -1 && openBracketAttempts < MAX_ATTEMPTS) {
    const jsonStr = str.slice(openBracket, closeBracket + 1);
    try {
      jsonObjects.push(JSON.parse(jsonStr));
      // This is a valid JSON object, so start looking for
      // an opening bracket after the last closing bracket
      openBracket = str.indexOf('{', closeBracket + 1);
      closeBracket = str.indexOf('}', openBracket);
    } catch {
      // Not a valid object, move on to the next closing bracket
      closeBracket = str.indexOf('}', closeBracket + 1);
      let closeBracketAttempts = 0;
      while (closeBracket === -1 && closeBracketAttempts < MAX_ATTEMPTS) {
        // No closing brackets made a valid json object, so
        // start looking with the next opening bracket
        openBracket = str.indexOf('{', openBracket + 1);
        closeBracket = str.indexOf('}', openBracket);
        closeBracketAttempts++;
      }
      if (closeBracketAttempts >= MAX_ATTEMPTS) {
        // If we've reached the maximum number of attempts, break out of the loop
        break;
      }
    }
    openBracketAttempts++;
  }
  return jsonObjects;
}

export function extractFirstJsonObject<T>(str: string): T {
  const jsonObjects = extractJsonObjects(str);
  invariant(jsonObjects.length >= 1, `Expected a JSON object, but got ${JSON.stringify(str)}`);
  return jsonObjects[0] as T;
}

/**
 * Reorders the keys of an object based on a specified order, preserving any unspecified keys.
 * Symbol keys are preserved and added at the end.
 *
 * @param obj - The object whose keys need to be reordered.
 * @param order - An array specifying the desired order of keys.
 * @returns A new object with keys reordered according to the specified order.
 *
 * @example
 * const obj = { c: 3, a: 1, b: 2 };
 * const orderedObj = orderKeys(obj, ['a', 'b']);
 * // Result: { a: 1, b: 2, c: 3 }
 */
export function orderKeys<T extends object>(obj: T, order: (keyof T)[]): T {
  const result: T = {} as T;

  // Add ordered keys (excluding undefined values)
  for (const key of order) {
    if (key in obj && obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }

  // Add remaining keys (excluding undefined values)
  for (const key in obj) {
    if (!(key in result) && obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }

  // Add symbol keys (excluding undefined values)
  const symbolKeys = Object.getOwnPropertySymbols(obj);
  for (const sym of symbolKeys) {
    if (obj[sym as keyof T] !== undefined) {
      result[sym as keyof T] = obj[sym as keyof T];
    }
  }

  return result;
}
