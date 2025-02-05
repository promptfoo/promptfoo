import { addHexEncoding } from '../../../src/redteam/strategies/hex';
import type { TestCase } from '../../../src/types';

describe('addHexEncoding', () => {
  it('should encode variable value as hex and append /Hex to metrics', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          input: 'hello',
        },
        assert: [
          {
            type: 'contains',
            metric: 'accuracy',
          },
        ],
      },
    ];

    const result = addHexEncoding(testCases, 'input');

    expect(result[0].vars!.input).toBe('68 65 6C 6C 6F');
    expect(result[0].assert![0].metric).toBe('accuracy/Hex');
  });

  it('should handle empty string', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          input: '',
        },
        assert: [
          {
            type: 'contains',
            metric: 'accuracy',
          },
        ],
      },
    ];

    const result = addHexEncoding(testCases, 'input');

    expect(result[0].vars!.input).toBe('');
    expect(result[0].assert![0].metric).toBe('accuracy/Hex');
  });

  it('should handle special characters', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          input: '!@#$',
        },
        assert: [
          {
            type: 'contains',
            metric: 'accuracy',
          },
        ],
      },
    ];

    const result = addHexEncoding(testCases, 'input');

    expect(result[0].vars!.input).toBe('21 40 23 24');
    expect(result[0].assert![0].metric).toBe('accuracy/Hex');
  });

  it('should handle numbers', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          input: 123,
        },
        assert: [
          {
            type: 'contains',
            metric: 'accuracy',
          },
        ],
      },
    ];

    const result = addHexEncoding(testCases, 'input');

    expect(result[0].vars!.input).toBe('31 32 33');
    expect(result[0].assert![0].metric).toBe('accuracy/Hex');
  });

  it('should handle test case without assertions', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          input: 'test',
        },
      },
    ];

    const result = addHexEncoding(testCases, 'input');

    expect(result[0].vars!.input).toBe('74 65 73 74');
    expect(result[0].assert).toBeUndefined();
  });
});
