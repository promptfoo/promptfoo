import { removeEmpty } from '../../src/util/objectUtils';

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
});
