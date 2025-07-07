import { testCaseFromCsvRow } from '../../../src/csv';

describe('Test Case Reader - CSV Row Conversion', () => {
  it('converts CSV row with special columns to TestCase format', () => {
    const csvRow = {
      var1: 'value1',
      var2: 'value2',
      __expected: 'foobar',
      __expected1: 'is-json',
      __prefix: 'test-prefix',
      __suffix: 'test-suffix',
    };
    const testCase = testCaseFromCsvRow(csvRow);
    expect(testCase).toEqual({
      vars: {
        var1: 'value1',
        var2: 'value2',
      },
      assert: [
        {
          type: 'equals',
          value: 'foobar',
        },
        {
          type: 'is-json',
        },
      ],
      options: {
        prefix: 'test-prefix',
        suffix: 'test-suffix',
      },
    });
  });
});
