import { isValidJson, safeJsonStringify } from '../src/util/json';

describe('json utilities', () => {
  describe('isValidJson', () => {
    it('returns true for valid JSON', () => {
      expect(isValidJson('{"key": "value"}')).toBe(true);
      expect(isValidJson('[1, 2, 3]')).toBe(true);
      expect(isValidJson('"string"')).toBe(true);
      expect(isValidJson('123')).toBe(true);
      expect(isValidJson('true')).toBe(true);
      expect(isValidJson('null')).toBe(true);
    });

    it('returns false for invalid JSON', () => {
      expect(isValidJson('{')).toBe(false);
      expect(isValidJson('["unclosed array"')).toBe(false);
      expect(isValidJson('{"key": value}')).toBe(false);
      expect(isValidJson('undefined')).toBe(false);
    });
  });

  describe('safeJsonStringify', () => {
    it('stringifies simple objects', () => {
      const obj = { key: 'value', number: 123 };
      expect(safeJsonStringify(obj)).toBe('{"key":"value","number":123}');
    });

    it('handles circular references', () => {
      const obj: any = { key: 'value' };
      obj.circular = obj;
      expect(safeJsonStringify(obj)).toBe('{"key":"value"}');
    });

    it('pretty prints when specified', () => {
      const obj = { key: 'value', nested: { inner: 'content' } };
      const expected = `{
  "key": "value",
  "nested": {
    "inner": "content"
  }
}`;
      expect(safeJsonStringify(obj, true)).toBe(expected);
    });

    it('handles arrays with circular references', () => {
      const arr: any[] = [1, 2, 3];
      arr.push(arr);
      expect(safeJsonStringify(arr)).toBe('[1,2,3,null]');
    });

    it('handles null values', () => {
      expect(safeJsonStringify(null)).toBe('null');
    });

    it('handles undefined values', () => {
      expect(safeJsonStringify(undefined)).toBeUndefined();
    });

    it('handles complex nested structures', () => {
      const complex = {
        string: 'value',
        number: 123,
        boolean: true,
        null: null,
        array: [1, 'two', { three: 3 }],
        nested: {
          a: 1,
          b: [2, 3],
        },
      };
      const result = safeJsonStringify(complex);
      expect(JSON.parse(result)).toEqual(complex);
    });

    it('handles nested circular references', () => {
      const obj: any = { a: { b: {} } };
      obj.a.b.c = obj.a;
      expect(safeJsonStringify(obj)).toBe('{"a":{"b":{}}}');
    });

    it('preserves non-circular nested structures', () => {
      const nested = { a: { b: { c: 1 } }, d: [1, 2, { e: 3 }] };
      expect(JSON.parse(safeJsonStringify(nested))).toEqual(nested);
    });
  });
});
