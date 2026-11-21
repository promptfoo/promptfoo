import vm from 'node:vm';

import { describe, expect, it } from 'vitest';
import { isPlainObject, removeEmpty } from '../../src/util/objectUtils';

describe('objectUtils', () => {
  describe('removeEmpty', () => {
    it('removes empty arrays from the top level', () => {
      const input = {
        name: 'test',
        emptyArray: [],
        nonEmptyArray: [1, 2, 3],
      };

      const result = removeEmpty(input);

      expect(result).toEqual({
        name: 'test',
        nonEmptyArray: [1, 2, 3],
      });
      expect(result.emptyArray).toBeUndefined();
    });

    it('removes empty objects from the top level', () => {
      const input = {
        name: 'test',
        emptyObj: {},
        nonEmptyObj: { key: 'value' },
      };

      const result = removeEmpty(input);

      expect(result).toEqual({
        name: 'test',
        nonEmptyObj: { key: 'value' },
      });
      expect(result.emptyObj).toBeUndefined();
    });

    it('does not remove empty arrays or objects in nested objects', () => {
      const input = {
        level1: {
          emptyArr: [],
          emptyObj: {},
          validKey: 'value',
        },
      };

      const result = removeEmpty(input);

      expect(result).toEqual({
        level1: {
          emptyArr: [],
          emptyObj: {},
          validKey: 'value',
        },
      });
    });

    it('does not modify the original object', () => {
      const original = {
        name: 'test',
        emptyArray: [],
        nested: { empty: {} },
      };

      const originalCopy = JSON.parse(JSON.stringify(original));
      removeEmpty(original);

      expect(original).toEqual(originalCopy);
    });
  });

  describe('isPlainObject', () => {
    class Point {
      x = 1;
    }

    it.each([
      ['an object literal', { a: 1 }],
      ['an empty object', {}],
      ['a null-prototype object', Object.create(null)],
      ['an object from another realm', vm.runInNewContext('({ a: 1 })')],
    ])('returns true for %s', (_name, value) => {
      expect(isPlainObject(value)).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'text'],
      ['a number', 1],
      ['an array', [1]],
      ['a function', () => {}],
      ['a Date', new Date('2024-01-02T00:00:00Z')],
      ['a Buffer', Buffer.from('a')],
      ['a Uint8Array', new Uint8Array([1])],
      ['a Map', new Map()],
      ['a Set', new Set()],
      ['a RegExp', /a/],
      ['a class instance', new Point()],
    ])('returns false for %s', (_name, value) => {
      expect(isPlainObject(value)).toBe(false);
    });
  });
});
