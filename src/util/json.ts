import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';
import { getEnvBool, getEnvString } from '../envars';
import type { EvaluateResult, ResultFailureReason } from '../types';
import invariant from '../util/invariant';

let ajvInstance: Ajv | null = null;

export function resetAjv(): void {
  if (getEnvString('NODE_ENV') !== 'test') {
    throw new Error('resetAjv can only be called in test environment');
  }
  ajvInstance = null;
}

export function getAjv(): Ajv {
  if (!ajvInstance) {
    const ajvOptions: ConstructorParameters<typeof Ajv>[0] = {
      strictSchema: !getEnvBool('PROMPTFOO_DISABLE_AJV_STRICT_MODE'),
    };
    ajvInstance = new Ajv(ajvOptions);
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a truncated version of an object for safe JSON stringification.
 * Prevents memory issues by limiting string, array, and object sizes.
 *
 * @param value - The value to truncate and stringify
 * @param prettyPrint - Whether to format the JSON with indentation
 * @returns A JSON string representation of the truncated value
 */
function safeJsonStringifyTruncated<T>(value: T, prettyPrint: boolean = false): string {
  const cache = new Set();
  const space = prettyPrint ? 2 : undefined;

  const truncateValue = (val: any): any => {
    if (typeof val === 'string') {
      return val.length > 1000 ? val.substring(0, 1000) + '...[truncated]' : val;
    }

    if (Array.isArray(val)) {
      const truncated = val.slice(0, 10).map(truncateValue);
      if (val.length > 10) {
        truncated.push(`...[${val.length - 10} more items]`);
      }
      return truncated;
    }

    if (typeof val === 'object' && val !== null) {
      if (cache.has(val)) {
        return '[Circular Reference]';
      }
      cache.add(val);

      const truncated: any = {};
      let count = 0;

      for (const [k, v] of Object.entries(val)) {
        if (count >= 20) {
          truncated['...[truncated]'] = `${Object.keys(val).length - count} more keys`;
          break;
        }
        truncated[k] = truncateValue(v);
        count++;
      }
      return truncated;
    }

    return val;
  };

  try {
    return JSON.stringify(truncateValue(value), null, space) || '{}';
  } catch {
    return `{"error": "Failed to stringify even truncated data", "type": "${typeof value}", "constructor": "${value?.constructor?.name || 'unknown'}"}`;
  }
}

/**
 * Safely stringify a value to JSON, handling circular references and large objects.
 *
 * @param value - The value to stringify
 * @param prettyPrint - Whether to format the JSON with indentation
 * @returns JSON string representation, or undefined if serialization fails
 */
export function safeJsonStringify<T>(value: T, prettyPrint: boolean = false): string | undefined {
  const cache = new Set();
  const space = prettyPrint ? 2 : undefined;

  try {
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
  } catch (error) {
    if (error instanceof RangeError && error.message.includes('Invalid string length')) {
      return safeJsonStringifyTruncated(value, prettyPrint);
    }
    return undefined;
  }
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
      let openBraces = 1;
      let closeBraces = 0;
      let j = i + 1;

      // Track braces as we go to detect potential JSON objects
      while (j < Math.min(i + maxJsonLength, str.length) && openBraces > closeBraces) {
        if (str[j] === '{') {
          openBraces++;
        }
        if (str[j] === '}') {
          closeBraces++;
        }
        j++;

        // When we have a potential complete object OR we've reached the end
        if (openBraces === closeBraces || j === str.length || j === i + maxJsonLength) {
          try {
            // If we're at the end but braces don't match, add missing closing braces
            let potentialJson = str.slice(i, j);
            if (openBraces > closeBraces) {
              potentialJson += '}'.repeat(openBraces - closeBraces);
            }

            const processedJson = convertSlashCommentsToHash(potentialJson);
            const parsedObj = yaml.load(processedJson, { json: true });

            if (typeof parsedObj === 'object' && parsedObj !== null) {
              jsonObjects.push(parsedObj);
              i = j - 1; // Move i to the end of the valid JSON object
              break;
            }
          } catch {
            // If not valid yet, continue only if braces haven't balanced
            if (openBraces === closeBraces) {
              break;
            }
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

/**
 * Type definition for a logging-safe summary of an EvaluateResult.
 */
export interface LoggableEvaluateResultSummary {
  id?: string;
  testIdx: number;
  promptIdx: number;
  success: boolean;
  score: number;
  error?: string | null;
  failureReason: ResultFailureReason;
  provider?: {
    id: string;
    label?: string;
  };
  response?: {
    output?: string;
    error?: string | null;
    cached?: boolean;
    cost?: number;
    tokenUsage?: any;
    metadata?: {
      keys: string[];
      keyCount: number;
    };
  };
  testCase?: {
    description?: string;
    vars?: string[];
  };
}

/**
 * Creates a summary of an EvaluateResult for logging purposes, avoiding RangeError
 * when stringifying large evaluation results.
 *
 * Extracts key information while truncating potentially large fields like response
 * outputs and metadata values.
 *
 * @param result - The evaluation result to summarize
 * @param maxOutputLength - Maximum length for response output before truncation. Default: 500
 * @param includeMetadataKeys - Whether to include metadata keys in the summary. Default: true
 * @returns A summarized version safe for JSON stringification
 * @throws {TypeError} If result is null or undefined
 */
export function summarizeEvaluateResultForLogging(
  result: EvaluateResult,
  maxOutputLength: number = 500,
  includeMetadataKeys: boolean = true,
): LoggableEvaluateResultSummary {
  if (!result) {
    throw new TypeError('EvaluateResult cannot be null or undefined');
  }

  const summary: LoggableEvaluateResultSummary = {
    id: result.id,
    testIdx: result.testIdx,
    promptIdx: result.promptIdx,
    success: result.success,
    score: result.score,
    error: result.error,
    failureReason: result.failureReason,
  };

  if (result.provider) {
    summary.provider = {
      id: result.provider.id || '',
      label: result.provider.label,
    };
  }

  if (result.response) {
    summary.response = {
      error: result.response.error,
      cached: result.response.cached,
      cost: result.response.cost,
      tokenUsage: result.response.tokenUsage,
    };

    if (result.response.output != null) {
      const output = String(result.response.output);
      summary.response.output =
        output.length > maxOutputLength
          ? output.substring(0, maxOutputLength) + '...[truncated]'
          : output;
    }

    if (result.response.metadata && includeMetadataKeys) {
      summary.response.metadata = {
        keys: Object.keys(result.response.metadata),
        keyCount: Object.keys(result.response.metadata).length,
      };
    }
  }

  if (result.testCase) {
    summary.testCase = {
      description: result.testCase.description,
      vars: result.testCase.vars ? Object.keys(result.testCase.vars) : undefined,
    };
  }

  return summary;
}
