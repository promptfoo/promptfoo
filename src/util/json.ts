import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { getEnvBool, getEnvString } from '../envars';
import invariant from '../util/invariant';
import { loadYaml } from './yamlLoad';

import type { EvaluateResult, ResultFailureReason } from '../types/index';

const ajvInstances = new Map<boolean, Ajv>();

export function resetAjv(): void {
  if (getEnvString('NODE_ENV') !== 'test') {
    throw new Error('resetAjv can only be called in test environment');
  }
  ajvInstances.clear();
}

export function getAjv(): Ajv {
  const strictSchema = !getEnvBool('PROMPTFOO_DISABLE_AJV_STRICT_MODE');
  let ajvInstance = ajvInstances.get(strictSchema);
  if (!ajvInstance) {
    ajvInstance = new Ajv({ strictSchema });
    addFormats(ajvInstance);
    // Gemini schemas can reuse this annotation in tool and JSON assertions.
    ajvInstance.addKeyword({ keyword: ['property_ordering', 'propertyOrdering'], valid: true });
    ajvInstances.set(strictSchema, ajvInstance);
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

function isEscapedQuote(line: string, quoteIndex: number): boolean {
  let backslashCount = 0;
  for (let i = quoteIndex - 1; i >= 0 && line[i] === '\\'; i--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
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
              // Avoid treating URL schemes as comments (e.g., http://, https://).
              let tokenStart = 0;
              for (let j = i - 1; j >= 0; j--) {
                if (/\s/.test(line[j])) {
                  tokenStart = j + 1;
                  break;
                }
              }
              const tokenPrefix = line.slice(tokenStart, i + 2);
              if (tokenPrefix.includes('://')) {
                result += char;
                break;
              }

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
            if (char === "'" && !isEscapedQuote(line, i) && !/[a-zA-Z]/.test(nextChar)) {
              state = 'normal';
            }
            break;

          case 'doubleQuote':
            result += char;
            if (char === '"' && !isEscapedQuote(line, i)) {
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

function findJsonStringEnd(str: string, start: number): number {
  for (let index = start; index < str.length; index++) {
    const char = str[index];
    if (char === '"') {
      return index + 1;
    }
    if (char === '\\') {
      index++;
      const escape = str[index];
      if (escape === 'u') {
        if (!/^[\da-fA-F]{4}$/.test(str.slice(index + 1, index + 5))) {
          return -1;
        }
        index += 4;
      } else if (!'"\\/bfnrt'.includes(escape)) {
        return -1;
      }
    } else if (char.charCodeAt(0) < 0x20) {
      return -1;
    }
  }
  return -1;
}

type JsonContainer = {
  start: number;
  close: '}' | ']';
  state: 'keyOrEnd' | 'key' | 'colon' | 'valueOrEnd' | 'value' | 'separator';
};

// Cache syntax outcomes, independently of candidate size, so malformed prefixes
// cannot repeatedly scan nested objects or hide a later valid object.
function findJsonObjectEnd(str: string, start: number, objectEnds: Map<number, number>): number {
  const cachedEnd = objectEnds.get(start);
  if (cachedEnd !== undefined) {
    return cachedEnd;
  }

  const tokens =
    /[ \t\r\n]*("|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:])/y;
  const stack: JsonContainer[] = [{ start, close: '}', state: 'keyOrEnd' }];
  let index = start + 1;

  while (stack.length > 0) {
    tokens.lastIndex = index;
    const match = tokens.exec(str);
    if (!match) {
      break;
    }
    const token = match[1];
    index = tokens.lastIndex;
    if (token === '"') {
      index = findJsonStringEnd(str, index);
      if (index === -1) {
        break;
      }
    }
    const container = stack[stack.length - 1];

    if (
      token === container.close &&
      (container.state === 'keyOrEnd' ||
        container.state === 'valueOrEnd' ||
        container.state === 'separator')
    ) {
      if (container.close === '}') {
        objectEnds.set(container.start, index);
      }
      stack.pop();
      if (stack.length === 0) {
        return index;
      }
    } else if (container.state === 'keyOrEnd' || container.state === 'key') {
      if (!token.startsWith('"')) {
        break;
      }
      container.state = 'colon';
    } else if (container.state === 'colon') {
      if (token !== ':') {
        break;
      }
      container.state = 'value';
    } else if (container.state === 'separator') {
      if (token !== ',') {
        break;
      }
      container.state = container.close === '}' ? 'key' : 'value';
    } else {
      if (token === ':' || token === ',' || token === '}' || token === ']') {
        break;
      }
      container.state = 'separator';
      if (token === '{') {
        const nestedStart = index - 1;
        const nestedEnd = objectEnds.get(nestedStart);
        if (nestedEnd === -1) {
          break;
        }
        if (nestedEnd === undefined) {
          stack.push({ start: nestedStart, close: '}', state: 'keyOrEnd' });
        } else {
          index = nestedEnd;
        }
      } else if (token === '[') {
        stack.push({ start: index - 1, close: ']', state: 'valueOrEnd' });
      }
    }
  }

  for (const container of stack) {
    if (container.close === '}') {
      objectEnds.set(container.start, -1);
    }
  }
  return -1;
}

/**
 * An object extracted from LLM output, plus provenance.
 *
 * `autoClosed` is true when the object only parsed because extractJsonObjects
 * appended synthetic `}` characters to balance braces (i.e. the span was an
 * UNTERMINATED fragment that ran to the end of the response). Security: such a
 * fragment is never something the author deliberately emitted as complete JSON;
 * it is either a truncated verdict, trailing prose with stray braces, or an
 * attacker fragment the author echoed. Callers that pick a verdict object
 * should prefer complete objects (see selectVerdictObject).
 */
export type ExtractedJsonObject = {
  object: object;
  autoClosed: boolean;
};

export function extractJsonObjectsWithMeta(str: string): ExtractedJsonObject[] {
  const jsonObjects: ExtractedJsonObject[] = [];
  const maxJsonLength = 100000; // Prevent processing extremely large invalid JSON

  if (str.length <= maxJsonLength) {
    try {
      const parsed = JSON.parse(str);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return [{ object: parsed, autoClosed: false }];
      }
    } catch {
      // Keep the original input for tolerant extraction below.
    }
  }

  const objectEnds = new Map<number, number>();
  let windowStart = -1;
  let scanWindow = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      const blockStart = Math.floor(i / maxJsonLength) * maxJsonLength;
      if (blockStart !== windowStart) {
        windowStart = blockStart;
        // Every eligible candidate in this block fits within the two-block window.
        scanWindow = str.slice(windowStart, windowStart + 2 * maxJsonLength);
        objectEnds.clear();
      }
      const localEnd = findJsonObjectEnd(scanWindow, i - windowStart, objectEnds);
      const end = localEnd === -1 ? -1 : windowStart + localEnd;
      if (end > i && end - i <= maxJsonLength) {
        try {
          jsonObjects.push({ object: JSON.parse(str.slice(i, end)), autoClosed: false });
          i = end - 1;
          continue;
        } catch {
          // Preserve tolerant extraction if parsing fails.
        }
      }

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
            const autoClosed = openBraces > closeBraces;
            if (autoClosed) {
              potentialJson += '}'.repeat(openBraces - closeBraces);
            }

            const processedJson = convertSlashCommentsToHash(potentialJson);
            const parsedObj = loadYaml(processedJson, { json: true });

            if (typeof parsedObj === 'object' && parsedObj !== null) {
              jsonObjects.push({ object: parsedObj, autoClosed });
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

export function extractJsonObjects(str: string): object[] {
  return extractJsonObjectsWithMeta(str).map((entry) => entry.object);
}

export function extractFirstJsonObject<T>(str: string): T {
  const jsonObjects = extractJsonObjects(str);
  invariant(jsonObjects.length >= 1, `Expected a JSON object, but got ${JSON.stringify(str)}`);
  return jsonObjects[0] as T;
}

function isVerdictShaped(value: unknown, verdictKeys: string[]): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    verdictKeys.some((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function* walkVerdictObjects(root: object, verdictKeys: string[]) {
  const pending: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const { value, depth } = pending.pop()!;
    if (typeof value !== 'object' || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      // Multiple verdicts in a rubric breakdown are ambiguous.
      const verdicts = value.filter((entry) => isVerdictShaped(entry, verdictKeys));
      if (verdicts.length === 1) {
        pending.push({ value: verdicts[0], depth: depth + 1 });
      }
      continue;
    }
    if (isVerdictShaped(value, verdictKeys)) {
      yield { value, depth };
    }
    const children = Object.values(value);
    for (let i = children.length - 1; i >= 0; i--) {
      pending.push({ value: children[i], depth: depth + 1 });
    }
  }
}

/**
 * Security: unwrap verdict shells produced by merged JSON fragments.
 *
 * When an LLM judge echoes an UNTERMINATED JSON fragment from the
 * model-under-test (e.g. `{pass: true, score: 1` with no closing brace),
 * extractJsonObjects balances braces across the whole span and parses the
 * result leniently, merging the fragment with the judge's later verdict into
 * ONE object whose top-level keys come from the attacker, while the judge's
 * real verdict survives only as a nested value — possibly buried under
 * non-verdict-shaped intermediate objects or inside a single-element array.
 * That bypasses last-object verdict selection.
 *
 * The judge emits its own verdict LAST in the response, and both JSON and
 * YAML-flow key order follow text order, so the RIGHTMOST (then deepest)
 * verdict-shaped object in the tree is the judge's real verdict and is
 * returned. Content the judge echoed from the model-under-test appears
 * earlier in the prose and therefore earlier in traversal order. Arrays
 * holding MULTIPLE verdict-shaped elements are ambiguous (e.g. per-criterion
 * rubric breakdowns) and are never descended into.
 */
export function unwrapNestedVerdict<T extends object>(obj: T, verdictKeys: string[]): T {
  let best: object = obj;
  for (const { value } of walkVerdictObjects(obj, verdictKeys)) {
    best = value;
  }
  return best as T;
}

/**
 * Normalizes a verdict value for conflict comparison. Booleans and
 * boolean-like strings collapse to 'true'/'false'; other strings are compared
 * case-insensitively. Numbers compare EXACTLY (as `number:<value>`), so a
 * score-only verdict like {score: 0.25} is not treated as agreeing with an
 * injected {score: 1} merely because both are truthy.
 */
function normalizeVerdictValue(value: unknown): string | undefined {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `number:${value}` : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^(true|yes|pass|y)$/i.test(trimmed)) {
      return 'true';
    }
    if (/^(false|no|fail|n)$/i.test(trimmed)) {
      return 'false';
    }
    return trimmed.toLowerCase();
  }
  return undefined;
}

/**
 * True when two verdict-shaped objects disagree on a verdict key they share.
 */
function verdictsConflict(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  verdictKeys: string[],
): boolean {
  for (const key of verdictKeys) {
    if (key in a && key in b) {
      const na = normalizeVerdictValue(a[key]);
      const nb = normalizeVerdictValue(b[key]);
      if (na !== undefined && nb !== undefined && na !== nb) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Security: detects a verdict-shaped object nested inside `obj` (excluding
 * `obj` itself) that CONFLICTS with `obj`'s own top-level verdict values.
 *
 * A merged shell — an attacker fragment the judge echoed, fused with the
 * judge's later verdict by lenient brace balancing — has exactly this shape:
 * attacker keys at the top, conflicting judge verdict nested inside. A
 * genuine verdict carrying metadata that merely repeats a verdict key with
 * the SAME value does not trip this.
 */
function containsConflictingNestedVerdict(
  obj: Record<string, unknown>,
  verdictKeys: string[],
): boolean {
  for (const { value, depth } of walkVerdictObjects(obj, verdictKeys)) {
    if (depth > 0 && verdictsConflict(obj, value, verdictKeys)) {
      return true;
    }
  }
  return false;
}

/**
 * Security: pick the verdict object from everything extracted out of an
 * LLM-judge response.
 *
 * Selection rules, in order:
 * 1. If several COMPLETE verdict-shaped objects disagree on a verdict key,
 *    the response contains conflicting verdict JSON — injected content from
 *    the model-under-test (echoed by the judge) rather than a self-contradicting
 *    judge. Return undefined so callers fail closed instead of guessing.
 * 2. If the LAST object is complete and verdict-shaped, it is the judge's own
 *    verdict — the standard last-object rule — returned as-is (its nested
 *    metadata is NOT unwrapped). The one exception: if it nests a verdict-
 *    shaped object that CONFLICTS with its own top-level values (a merged
 *    shell that happened to balance), the response is ambiguous — return
 *    undefined so callers fail closed.
 * 3. Otherwise (the last object was auto-closed / is not verdict-shaped — an
 *    UNTERMINATED fragment, trailing prose with stray braces, or trailing
 *    non-verdict JSON), prefer the last COMPLETE verdict-shaped object. The
 *    judge emits exactly one complete verdict-shaped object; a trailing
 *    fragment or junk object is never trustworthy. If that complete verdict
 *    conflicts with the verdict recoverable from the trailing merged shell,
 *    the response is ambiguous — return undefined.
 * 4. Otherwise fall back to the last object (truncation salvage / merged
 *    shell) and let unwrapNestedVerdict recover the rightmost nested verdict.
 */
export function selectVerdictObject<T extends object>(
  entries: ExtractedJsonObject[],
  verdictKeys: string[],
): T | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const completeVerdicts = entries
    .filter((entry) => !entry.autoClosed)
    .map((entry) => entry.object as Record<string, unknown>)
    .filter((obj) => isVerdictShaped(obj, verdictKeys));
  if (completeVerdicts.length >= 2) {
    for (const key of verdictKeys) {
      const values = new Set<string>();
      for (const obj of completeVerdicts) {
        if (key in obj) {
          const normalized = normalizeVerdictValue(obj[key]);
          if (normalized !== undefined) {
            values.add(normalized);
          }
        }
      }
      if (values.size > 1) {
        return undefined; // conflicting verdicts: ambiguous, fail closed
      }
    }
  }

  const last = entries[entries.length - 1];
  const lastIsCompleteVerdict = !last.autoClosed && isVerdictShaped(last.object, verdictKeys);

  if (lastIsCompleteVerdict) {
    const lastRecord = last.object as Record<string, unknown>;
    if (containsConflictingNestedVerdict(lastRecord, verdictKeys)) {
      return undefined; // balanced merged shell / self-conflicting: fail closed
    }
    return last.object as T;
  }

  // The last object is not a complete verdict (auto-closed trailer, trailing
  // non-verdict JSON, ...). Prefer the last COMPLETE verdict-shaped object.
  for (let k = entries.length - 2; k >= 0; k--) {
    const entry = entries[k];
    if (entry.autoClosed || !isVerdictShaped(entry.object, verdictKeys)) {
      continue;
    }
    const chosen = entry.object as Record<string, unknown>;
    const lastVerdict = unwrapNestedVerdict(last.object as Record<string, unknown>, verdictKeys);
    if (
      isVerdictShaped(lastVerdict, verdictKeys) &&
      verdictsConflict(chosen, lastVerdict, verdictKeys)
    ) {
      return undefined; // echoed verdict conflicts with merged shell: fail closed
    }
    return chosen as T;
  }

  // No complete verdict-shaped object anywhere: truncation salvage / merged
  // shell. Unwrap to the rightmost verdict.
  return unwrapNestedVerdict(last.object as T, verdictKeys);
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
  // Avoid inherited keys and setters while collecting arbitrary source keys.
  const result: T = Object.create(null);

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

  // Return an ordinary object while preserving __proto__ as an own data property.
  return { ...result };
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
