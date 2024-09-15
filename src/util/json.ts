import invariant from 'tiny-invariant';

export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
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
  const jsonObjects = [];
  let startIndex = 0;
  const MAX_ATTEMPTS = 10;

  while (startIndex < str.length) {
    const openBracket = str.indexOf('{', startIndex);
    if (openBracket === -1) {
      break;
    }

    let bracketCount = 1;
    let closeBracket = openBracket + 1;

    while (bracketCount > 0 && closeBracket < str.length) {
      if (str[closeBracket] === '{') {
        bracketCount++;
      }
      if (str[closeBracket] === '}') {
        bracketCount--;
      }
      closeBracket++;
    }

    if (bracketCount === 0) {
      let attempts = 0;
      while (attempts < MAX_ATTEMPTS) {
        const jsonStr = str.slice(openBracket, closeBracket);
        try {
          const parsedObj = JSON.parse(jsonStr);

          jsonObjects.push(parsedObj);
          break;
        } catch (err) {
          // If parsing fails, try including the next closing bracket
          closeBracket = str.indexOf('}', closeBracket) + 1;
          if (closeBracket === 0) {
            break; // No more closing brackets
          }
        }
        attempts++;
      }
    }

    startIndex = openBracket + 1; // Move to the next character after the opening bracket
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
