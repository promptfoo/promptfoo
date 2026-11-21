import { diffLines } from 'diff';

export interface JsonDiff {
  path: string;
  expected: unknown;
  actual: unknown;
  type: 'changed' | 'added' | 'removed';
}

function appendObjectPath(path: string, key: string): string {
  const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
  return path ? (segment.startsWith('[') ? `${path}${segment}` : `${path}.${segment}`) : segment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getOwnValue(value: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
}

export function computeJsonDiff(expected: unknown, actual: unknown, path = ''): JsonDiff[] {
  const diffs: JsonDiff[] = [];
  let nodes = 0;
  const visit = (expected: unknown, actual: unknown, path: string, depth: number) => {
    if (++nodes > 1_000 || depth > 20) {
      throw new Error('JSON comparison exceeds display limits');
    }
    if (Object.is(expected, actual)) {
      return;
    }
    if (Array.isArray(expected) && Array.isArray(actual)) {
      for (let index = 0; index < Math.max(expected.length, actual.length); index++) {
        visit(expected[index], actual[index], `${path}[${index}]`, depth + 1);
      }
      return;
    }
    if (isRecord(expected) && isRecord(actual)) {
      const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
      if (keys.size > 1_000) {
        throw new Error('JSON comparison exceeds display limits');
      }
      for (const key of keys) {
        visit(
          getOwnValue(expected, key),
          getOwnValue(actual, key),
          appendObjectPath(path, key),
          depth + 1,
        );
      }
      return;
    }
    diffs.push({
      path: path || '(root)',
      expected,
      actual,
      type: expected === undefined ? 'added' : actual === undefined ? 'removed' : 'changed',
    });
  };
  visit(expected, actual, path, 0);
  return diffs;
}

export function formatDiffValue(value: unknown): string {
  if (Object.is(value, -0)) {
    return '-0';
  }
  try {
    const text =
      typeof value === 'string'
        ? JSON.stringify(value.slice(0, 50)) + (value.length > 50 ? '…' : '')
        : (JSON.stringify(value) ?? String(value));
    return text.length > 60 ? text.slice(0, 57) + '…' : text;
  } catch {
    return '[unserializable value]';
  }
}

export function buildUnifiedJsonTextDiff(expectedJson: string, actualJson: string) {
  if (expectedJson.length > 20_000 || actualJson.length > 20_000) {
    return undefined;
  }
  // The abortable diff caps work even for unrelated arrays with thousands of lines.
  return diffLines(expectedJson, actualJson, { maxEditLength: 200, timeout: 50 })?.flatMap(
    (change) => {
      const type = change.added ? 'added' : change.removed ? 'removed' : 'same';
      return change.value
        .replace(/\n$/, '')
        .split('\n')
        .map((content) => ({ type, content }));
    },
  );
}
