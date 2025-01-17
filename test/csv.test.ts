import { assertionFromString, testCaseFromCsvRow, getAssertionRegex } from '../src/csv';

describe('csv utils', () => {
  describe('getAssertionRegex', () => {
    it('should return a regex for parsing assertions', () => {
      const regex = getAssertionRegex();
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.test('equals:test')).toBe(true);
      expect(regex.test('not-equals:test')).toBe(true);
      expect(regex.test('similar(0.8):test')).toBe(true);
    });
  });

  describe('assertionFromString', () => {
    it('should parse equals assertion', () => {
      const result = assertionFromString('equals:test');
      expect(result).toEqual({
        type: 'equals',
        value: 'test',
      });
    });

    it('should parse javascript assertion', () => {
      const result = assertionFromString('javascript:output.length > 10');
      expect(result).toEqual({
        type: 'javascript',
        value: 'output.length > 10',
      });
    });

    it('should parse python assertion', () => {
      const result = assertionFromString('python:len(output) > 10');
      expect(result).toEqual({
        type: 'python',
        value: 'len(output) > 10',
      });
    });

    it('should parse llm-rubric assertion', () => {
      const result = assertionFromString('grade:check if response is polite');
      expect(result).toEqual({
        type: 'llm-rubric',
        value: 'check if response is polite',
      });
    });

    it('should parse contains-all assertion', () => {
      const result = assertionFromString('contains-all:one,two,three');
      expect(result).toEqual({
        type: 'contains-all',
        value: ['one', 'two', 'three'],
      });
    });

    it('should parse similar assertion with threshold', () => {
      const result = assertionFromString('similar(0.9):test text');
      expect(result).toEqual({
        type: 'similar',
        value: 'test text',
        threshold: 0.9,
      });
    });

    it('should default to equals assertion', () => {
      const result = assertionFromString('plain text');
      expect(result).toEqual({
        type: 'equals',
        value: 'plain text',
      });
    });
  });

  describe('testCaseFromCsvRow', () => {
    it('should create test case with assertions', () => {
      const row = {
        var1: 'value1',
        var2: 'value2',
        __expected: 'equals:test',
        __prefix: 'prefix',
        __suffix: 'suffix',
      };

      const result = testCaseFromCsvRow(row);

      expect(result).toEqual({
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
        assert: [
          {
            type: 'equals',
            value: 'test',
          },
        ],
        options: {
          prefix: 'prefix',
          suffix: 'suffix',
        },
      });
    });

    it('should handle rows with only variables', () => {
      const row = {
        var1: 'value1',
        var2: 'value2',
      };

      const result = testCaseFromCsvRow(row);

      expect(result).toEqual({
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
        assert: [],
        options: {},
      });
    });

    it('should handle description and threshold', () => {
      const row = {
        var1: 'value1',
        __description: 'test description',
        __threshold: '0.8',
        __expected: 'equals:test',
      };

      const result = testCaseFromCsvRow(row);

      expect(result).toEqual({
        vars: {
          var1: 'value1',
        },
        assert: [
          {
            type: 'equals',
            value: 'test',
          },
        ],
        options: {},
        description: 'test description',
        threshold: 0.8,
      });
    });
  });
});
