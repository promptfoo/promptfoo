import type { WorkBudget } from './limits';
import type { AnalysisLimits, JsonValue } from './types';

/**
 * Detach selected values from caller-owned objects without invoking accessors or
 * toJSON. Object keys such as __proto__ remain ordinary own data properties.
 */
export function captureJson(value: unknown, limits: AnalysisLimits, work: WorkBudget): JsonValue {
  const ancestors = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  function charge(text: string): void {
    const size = Buffer.byteLength(text, 'utf8');
    work.spend(size);
    bytes += size;
    if (bytes > limits.maxValueBytes) {
      throw new Error('Selected JSON value exceeds the byte limit');
    }
  }
  function captureArray(items: unknown[], depth: number): JsonValue[] {
    if (items.length > limits.maxArrayLength) {
      throw new Error('Selected JSON array exceeds the length limit');
    }
    const keys = Object.keys(items);
    if (keys.length !== items.length) {
      throw new Error('Selected JSON arrays must be dense without extra properties');
    }
    return Array.from({ length: items.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(items, String(index));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new Error('Selected JSON arrays must contain own data elements');
      }
      charge(',');
      return visit(descriptor.value, depth + 1);
    });
  }
  function captureObject(items: object, depth: number): JsonValue {
    const output: Record<string, JsonValue> = Object.create(null);
    for (const key of Object.getOwnPropertyNames(items)) {
      const descriptor = Object.getOwnPropertyDescriptor(items, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new Error('Selected JSON objects must contain enumerable data properties');
      }
      charge(`${JSON.stringify(key)}:,`);
      output[key] = visit(descriptor.value, depth + 1);
    }
    return output;
  }
  function visit(current: unknown, depth: number): JsonValue {
    work.spend();
    nodes += 1;
    if (nodes > limits.maxValueNodes || depth > limits.maxDepth) {
      throw new Error('Selected JSON value exceeds the node or depth limit');
    }
    if (current === null || typeof current === 'boolean') {
      charge(String(current));
      return current;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new Error('Selected JSON values must contain only finite numbers');
      }
      charge(String(current));
      return Object.is(current, -0) ? 0 : current;
    }
    if (typeof current === 'string') {
      charge(JSON.stringify(current));
      return current;
    }
    if (typeof current !== 'object') {
      throw new Error('Selected values must be plain JSON');
    }
    if (ancestors.has(current)) {
      throw new Error('Selected JSON value contains a cycle');
    }
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (!array && prototype !== Object.prototype && prototype !== null) {
      throw new Error('Selected JSON value must not contain custom object prototypes');
    }
    if (Object.getOwnPropertySymbols(current).length > 0) {
      throw new Error('Selected JSON value must not contain symbol keys');
    }
    ancestors.add(current);
    try {
      charge(array ? '[]' : '{}');
      if (array) {
        return captureArray(current, depth);
      }
      return captureObject(current, depth);
    } finally {
      ancestors.delete(current);
    }
  }
  return visit(value, 0);
}

/** Type-preserving, object-key-order-independent JSON with -0 normalized to 0. */
export function canonicalJson(value: JsonValue, work: WorkBudget): string {
  work.spend();
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    work.spend(encoded.length);
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item, work)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  work.spend(keys.reduce((sum, key) => sum + key.length + 1, 0));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], work)}`).join(',')}}`;
}

/** Access only an own data field; native projections must never run user code. */
export function own(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    return undefined;
  }
  if (!('value' in descriptor)) {
    throw new Error('Native export fields must be data properties');
  }
  return descriptor.value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
