import invariant from '../util/invariant';

export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export function safeJsonStringify<T>(value: T, prettyPrint: boolean = false): string | undefined {
  // Prevent circular references
  const cache = new Set();
  const space = prettyPrint ? 2 : undefined;
  return (
    JSON.stringify(
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
    ) || undefined
  );
}

export function extractJsonObjects(str: string): object[] {
  const jsonObjects: object[] = [];
  const maxJsonLength = 100000; // Prevent processing extremely large invalid JSON

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      for (let j = i + 1; j <= Math.min(i + maxJsonLength, str.length); j++) {
        try {
          const potentialJson = str.slice(i, j);
          const parsedObj = JSON.parse(potentialJson);
          jsonObjects.push(parsedObj);
          i = j - 1; // Move i to the end of the valid JSON object
          break;
        } catch {
          // If it's not valid JSON yet, continue to the next character
          if (j === str.length || j === i + maxJsonLength) {
            // If we've reached the end of the string or max length, stop trying with this starting point
            break;
          }
        }
      }
    }
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
