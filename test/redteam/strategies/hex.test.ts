import { describe, expect, it } from 'vitest';
import { addHexEncoding } from '../../../src/redteam/strategies/hex';

import type { TestCase } from '../../../src/types/index';

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
    expect(result[0].metadata).toEqual({
      strategyId: 'hex',
      originalText: 'hello',
    });
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

  it('should encode multibyte characters as UTF-8 bytes', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          input: '€100',
        },
      },
    ];

    const result = addHexEncoding(testCases, 'input');

    // € is 3 UTF-8 bytes (E2 82 AC), not its UTF-16 code unit (20AC)
    expect(result[0].vars!.input).toBe('E2 82 AC 31 30 30');
  });

  it('should encode 2-byte UTF-8 characters as bytes', () => {
    const result = addHexEncoding([{ vars: { input: 'café' } }], 'input');

    // é is 2 UTF-8 bytes (C3 A9), not its UTF-16 code unit (E9)
    expect(result[0].vars!.input).toBe('63 61 66 C3 A9');
  });

  it('should encode characters outside the BMP (emoji) as UTF-8 bytes', () => {
    const testCases: TestCase[] = [
      {
        vars: {
          input: '😊',
        },
      },
    ];

    const result = addHexEncoding(testCases, 'input');

    // Not the UTF-16 surrogate pair (D83D DE0A)
    expect(result[0].vars!.input).toBe('F0 9F 98 8A');
  });

  it('should round-trip multibyte payloads back to the original text', () => {
    const original = 'café ☕ 日本語 😊';
    const result = addHexEncoding([{ vars: { input: original } }], 'input');
    const bytes = (result[0].vars!.input as string).split(' ').map((h) => parseInt(h, 16));
    expect(Buffer.from(bytes).toString('utf8')).toBe(original);
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
