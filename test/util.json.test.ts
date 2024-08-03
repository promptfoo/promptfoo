import dedent from 'dedent';
import { isValidJson, safeJsonStringify, orderKeys } from '../src/util/json';

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
      const expected = dedent`
      {
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

  describe('orderKeys', () => {
    it('orders keys according to specified order', () => {
      const obj = { c: 3, a: 1, b: 2 };
      const order: (keyof typeof obj)[] = ['a', 'b', 'c'];
      const result = orderKeys(obj, order);
      expect(Object.keys(result)).toEqual(['a', 'b', 'c']);
    });

    it('places unspecified keys at the end', () => {
      const obj = { d: 4, b: 2, a: 1, c: 3 };
      const order: (keyof typeof obj)[] = ['a', 'b'];
      const result = orderKeys(obj, order);
      expect(Object.keys(result)).toEqual(['a', 'b', 'd', 'c']);
    });

    it('ignores specified keys that do not exist in the object', () => {
      const obj = { a: 1, c: 3 };
      const order = ['a', 'b', 'c', 'd'] as (keyof typeof obj)[];
      const result = orderKeys(obj, order);
      expect(Object.keys(result)).toEqual(['a', 'c']);
    });

    it('returns an empty object when input is empty', () => {
      const obj = {};
      const order = ['a', 'b', 'c'] as (keyof typeof obj)[];
      const result = orderKeys(obj, order);
      expect(result).toEqual({});
    });

    it('returns the original object when order is empty', () => {
      const obj = { c: 3, a: 1, b: 2 };
      const order: (keyof typeof obj)[] = [];
      const result = orderKeys(obj, order);
      expect(result).toEqual(obj);
    });

    it('preserves nested object structures', () => {
      const obj = { c: { x: 1 }, a: [1, 2], b: 2 };
      const order: (keyof typeof obj)[] = ['a', 'b', 'c'];
      const result = orderKeys(obj, order);
      expect(result).toEqual({ a: [1, 2], b: 2, c: { x: 1 } });
    });

    it('handles objects with symbol keys', () => {
      const sym1 = Symbol('sym1');
      const sym2 = Symbol('sym2');
      const obj = { [sym1]: 1, b: 2, [sym2]: 3, a: 4 };
      const order: (keyof typeof obj)[] = ['a', 'b'];
      const result = orderKeys(obj, order);
      expect(Object.getOwnPropertySymbols(result)).toEqual([sym1, sym2]);
      expect(Object.keys(result)).toEqual(['a', 'b']);
    });

    it('maintains the correct types for keys and values', () => {
      const obj = { a: 'string', b: 42, c: true, d: null, e: undefined };
      const order: (keyof typeof obj)[] = ['b', 'a', 'c', 'd', 'e'];
      const result = orderKeys(obj, order);
      expect(result).toEqual({ b: 42, a: 'string', c: true, d: null, e: undefined });
    });
  });
});
