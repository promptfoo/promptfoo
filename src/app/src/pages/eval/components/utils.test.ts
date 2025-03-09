import { describe, it, expect } from 'vitest';
import { removeEmpty } from './utils';

describe('removeEmpty utility function', () => {
  it('removes empty arrays from objects', () => {
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

  it('removes empty objects from objects', () => {
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

  it('recursively removes nested empty objects and arrays', () => {
    const input = {
      level1: {
        emptyArr: [],
        level2: {
          emptyObj: {},
          level3: {
            validKey: 'value',
            emptyArr: [],
          },
        },
      },
    };

    const result = removeEmpty(input);

    expect(result).toEqual({
      level1: {
        level2: {
          level3: {
            validKey: 'value',
          },
        },
      },
    });
  });

  it('removes objects that become empty after cleaning', () => {
    const input = {
      level1: {
        onlyHasEmptyStuff: {
          emptyArr: [],
          emptyObj: {},
        },
        valid: 'data',
      },
    };

    const result = removeEmpty(input);

    expect(result).toEqual({
      level1: {
        valid: 'data',
      },
    });
    expect(result.level1.onlyHasEmptyStuff).toBeUndefined();
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
