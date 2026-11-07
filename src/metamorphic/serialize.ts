/**
 * Serialize a bounded report without first allocating an unbounded JSON string.
 * Each token is charged before being appended. Only plain data is accepted;
 * getters, toJSON hooks, cycles and nonfinite numbers never execute/coerce.
 */
export function serializeReport(value: unknown, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('Report output byte limit must be a positive safe integer');
  }
  const chunks: string[] = [];
  const ancestors = new Set<object>();
  let remaining = maxBytes;
  let remainingNodes = 1_000_000;
  function append(token: string): void {
    const size = Buffer.byteLength(token, 'utf8');
    if (size > remaining) {
      throw new Error('Rendered report exceeds the output byte limit');
    }
    remaining -= size;
    chunks.push(token);
  }
  function string(text: string): void {
    // Check the unescaped lower bound before JSON.stringify allocates escaped
    // bytes. A source string can expand at most sixfold for JSON controls.
    if (Buffer.byteLength(text, 'utf8') + 2 > remaining) {
      throw new Error('Rendered report exceeds the output byte limit');
    }
    append(JSON.stringify(text));
  }
  function dataProperty(object: object, key: string): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new Error('Reports must contain enumerable data properties');
    }
    return descriptor.value;
  }
  function objectEntries(object: object): [string, unknown][] {
    if (Object.getOwnPropertySymbols(object).length > 0) {
      throw new Error('Reports must not contain symbol keys');
    }
    return Object.getOwnPropertyNames(object).flatMap((key) => {
      const item = dataProperty(object, key);
      // Optional report fields follow ordinary JSON object semantics.
      return item === undefined ? [] : [[key, item] as [string, unknown]];
    });
  }
  function array(items: unknown[], depth: number): void {
    if (
      Object.keys(items).length !== items.length ||
      Object.getOwnPropertySymbols(items).length > 0
    ) {
      throw new Error('Report arrays must be dense without extra properties');
    }
    if (items.length === 0) {
      append('[]');
      return;
    }
    append('[\n');
    for (let index = 0; index < items.length; index++) {
      append('  '.repeat(depth + 1));
      visit(dataProperty(items, String(index)), depth + 1);
      append(index === items.length - 1 ? '\n' : ',\n');
    }
    append(`${'  '.repeat(depth)}]`);
  }
  function object(items: object, depth: number): void {
    const prototype = Object.getPrototypeOf(items);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Reports must contain plain objects');
    }
    const entries = objectEntries(items);
    if (entries.length === 0) {
      append('{}');
      return;
    }
    append('{\n');
    for (let index = 0; index < entries.length; index++) {
      const [key, item] = entries[index];
      append('  '.repeat(depth + 1));
      string(key);
      append(': ');
      visit(item, depth + 1);
      append(index === entries.length - 1 ? '\n' : ',\n');
    }
    append(`${'  '.repeat(depth)}}`);
  }
  function visit(current: unknown, depth: number): void {
    remainingNodes -= 1;
    if (depth > 128 || remainingNodes < 0) {
      throw new Error('Report exceeds the serialization depth or node limit');
    }
    if (current === null || typeof current === 'boolean') {
      append(String(current));
    } else if (typeof current === 'string') {
      string(current);
    } else if (typeof current === 'number' && Number.isFinite(current)) {
      append(JSON.stringify(current));
    } else if (typeof current === 'object') {
      if (ancestors.has(current)) {
        throw new Error('Reports must not contain cycles');
      }
      ancestors.add(current);
      try {
        if (Array.isArray(current)) {
          array(current, depth);
        } else {
          object(current, depth);
        }
      } finally {
        ancestors.delete(current);
      }
    } else {
      throw new Error('Reports must contain only finite JSON data');
    }
  }
  visit(value, 0);
  append('\n');
  return chunks.join('');
}
