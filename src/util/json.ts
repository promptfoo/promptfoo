import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';
import { getEnvBool, getEnvString } from '../envars';
import invariant from '../util/invariant';

import type { EvaluateResult, ResultFailureReason } from '../types/index';

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
      cache.delete(val);
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
  const ancestors: any[] = [];
  const space = prettyPrint ? 2 : undefined;

  try {
    return (
      JSON.stringify(
        value,
        function (this: any, _key, val) {
          if (typeof val === 'object' && val !== null) {
            while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
              ancestors.pop();
            }
            if (ancestors.includes(val)) {
              return;
            }
            ancestors.push(val);
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

type CommentConversionState = 'normal' | 'singleQuote' | 'doubleQuote';

function findTokenStart(line: string, index: number): number {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    if (/\s/.test(line[cursor])) {
      return cursor + 1;
    }
  }
  return 0;
}

function countConsecutiveSlashes(line: string, index: number): number {
  let slashCount = 2;
  while (index + slashCount < line.length && line[index + slashCount] === '/') {
    slashCount++;
  }
  return slashCount;
}

function convertLineSlashCommentsToHash(line: string): string {
  let state: CommentConversionState = 'normal';
  let result = '';
  let index = 0;

  while (index < line.length) {
    const char = line[index];
    const nextChar = line[index + 1];
    const prevChar = index > 0 ? line[index - 1] : '';

    if (state === 'singleQuote') {
      result += char;
      if (char === "'" && prevChar !== '\\' && !/[a-zA-Z]/.test(nextChar)) {
        state = 'normal';
      }
      index++;
      continue;
    }

    if (state === 'doubleQuote') {
      result += char;
      if (char === '"' && prevChar !== '\\') {
        state = 'normal';
      }
      index++;
      continue;
    }

    if (char === "'" && !/[a-zA-Z]/.test(prevChar)) {
      state = 'singleQuote';
      result += char;
      index++;
      continue;
    }
    if (char === '"') {
      state = 'doubleQuote';
      result += char;
      index++;
      continue;
    }
    if (char !== '/' || nextChar !== '/') {
      result += char;
      index++;
      continue;
    }

    const tokenStart = findTokenStart(line, index);
    const tokenPrefix = line.slice(tokenStart, index + 2);
    if (tokenPrefix.includes('://')) {
      result += char;
      index++;
      continue;
    }

    const slashCount = countConsecutiveSlashes(line, index);
    const hashes = '#'.repeat(Math.floor(slashCount / 2));
    return result + hashes + line.slice(index + slashCount);
  }

  return result;
}

export function convertSlashCommentsToHash(str: string): string {
  return str.split('\n').map(convertLineSlashCommentsToHash).join('\n');
}

const MAX_JSON_LENGTH = 100000;

function tryParseJsonCandidate(
  str: string,
  startIndex: number,
  endIndex: number,
  openBraces: number,
  closeBraces: number,
): object | undefined {
  let potentialJson = str.slice(startIndex, endIndex);
  if (openBraces > closeBraces) {
    potentialJson += '}'.repeat(openBraces - closeBraces);
  }

  try {
    const parsedObj = yaml.load(convertSlashCommentsToHash(potentialJson), { json: true });
    return typeof parsedObj === 'object' && parsedObj !== null ? parsedObj : undefined;
  } catch {
    return undefined;
  }
}

function scanJsonObjectFrom(
  str: string,
  startIndex: number,
): { parsed: object; endIndex: number } | undefined {
  let openBraces = 1;
  let closeBraces = 0;
  let cursor = startIndex + 1;
  const scanLimit = Math.min(startIndex + MAX_JSON_LENGTH, str.length);

  while (cursor < scanLimit && openBraces > closeBraces) {
    if (str[cursor] === '{') {
      openBraces++;
    } else if (str[cursor] === '}') {
      closeBraces++;
    }
    cursor++;

    const isCandidateBoundary =
      openBraces === closeBraces || cursor === str.length || cursor === scanLimit;
    if (!isCandidateBoundary) {
      continue;
    }

    const parsed = tryParseJsonCandidate(str, startIndex, cursor, openBraces, closeBraces);
    if (parsed) {
      return { parsed, endIndex: cursor };
    }
    if (openBraces === closeBraces) {
      return undefined;
    }
  }

  return undefined;
}

export function extractJsonObjects(str: string): object[] {
  const jsonObjects: object[] = [];

  for (let index = 0; index < str.length; index++) {
    if (str[index] !== '{') {
      continue;
    }

    const scanned = scanJsonObjectFrom(str, index);
    if (!scanned) {
      continue;
    }

    jsonObjects.push(scanned.parsed);
    index = scanned.endIndex - 1;
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
interface LoggableEvaluateResultSummary {
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
