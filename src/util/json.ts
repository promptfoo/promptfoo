import yaml from 'js-yaml';
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

export function convertSlashCommentsToHash(str: string): string {
  // Split into lines, process each line, then join back
  return str
    .split('\n')
    .map((line) => {
      let state = 'normal'; // 'normal' | 'singleQuote' | 'doubleQuote'
      let result = '';
      let i = 0;

      while (i < line.length) {
        const char = line[i];
        const nextChar = line[i + 1];
        const prevChar = i > 0 ? line[i - 1] : '';

        switch (state) {
          case 'normal':
            // Check for string start, but ignore apostrophes in words
            if (char === "'" && !/[a-zA-Z]/.test(prevChar)) {
              state = 'singleQuote';
              result += char;
            } else if (char === '"') {
              state = 'doubleQuote';
              result += char;
            } else if (char === '/' && nextChar === '/') {
              // Count consecutive slashes
              let slashCount = 2;
              while (i + slashCount < line.length && line[i + slashCount] === '/') {
                slashCount++;
              }
              // Convert to equivalent number of #s
              const hashes = '#'.repeat(Math.floor(slashCount / 2));
              return result + hashes + line.slice(i + slashCount);
            } else {
              result += char;
            }
            break;

          case 'singleQuote':
            result += char;
            // Check for string end, but ignore apostrophes in words
            if (char === "'" && prevChar !== '\\' && !/[a-zA-Z]/.test(nextChar)) {
              state = 'normal';
            }
            break;

          case 'doubleQuote':
            result += char;
            if (char === '"' && prevChar !== '\\') {
              state = 'normal';
            }
            break;
        }

        i++;
      }

      return result;
    })
    .join('\n');
}

export function extractJsonObjects(str: string): object[] {
  const jsonObjects: object[] = [];
  const maxJsonLength = 100000; // Prevent processing extremely large invalid JSON

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      for (let j = i + 1; j <= Math.min(i + maxJsonLength, str.length); j++) {
        try {
          const potentialJson = str.slice(i, j);
          const processedJson = convertSlashCommentsToHash(potentialJson);
          const parsedObj = yaml.load(processedJson, { json: true });
          if (typeof parsedObj === 'object' && parsedObj !== null) {
            jsonObjects.push(parsedObj);
            i = j - 1; // Move i to the end of the valid JSON object
            break;
          }
        } catch {
          // If it's not valid YAML yet, continue to the next character
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
