import { describe, expect, it } from 'vitest';
import { parseOtlpAttributes, parseOtlpAttributeValue } from '../../src/tracing/otlpAttributes';

describe('OTLP attribute decoding', () => {
  it.each([false, true])('preserves scalar and empty values (decoded: %s)', (decoded) => {
    const attributes = parseOtlpAttributes(
      [
        { key: 'unknown', value: {} },
        { key: 'false', value: { boolValue: false } },
        { key: 'zero', value: { doubleValue: 0 } },
        { key: 'empty', value: { stringValue: '' } },
        { key: 'integer', value: { intValue: '-42' } },
        { key: 'largeInteger', value: { intValue: '-9223372036854775808' } },
        { key: 'bytes', value: { bytesValue: decoded ? Uint8Array.of(0, 255) : 'AP8=' } },
        { key: 'array', value: { arrayValue: { values: [{}, { boolValue: false }] } } },
        { key: 'record', value: { kvlistValue: { values: [{ key: 'unknown', value: {} }] } } },
        { key: 'emptyArray', value: { arrayValue: {} } },
        { key: 'emptyRecord', value: { kvlistValue: {} } },
      ],
      decoded,
    );
    expect(JSON.parse(JSON.stringify(attributes))).toEqual({
      unknown: null,
      false: false,
      zero: 0,
      empty: '',
      integer: -42,
      largeInteger: '-9223372036854775808',
      bytes: 'AP8=',
      array: [null, false],
      record: { unknown: null },
      emptyArray: [],
      emptyRecord: {},
    });
  });

  it('accepts Long values only from the protobuf decoder', () => {
    const value = { intValue: { toString: () => '-9223372036854775808' } };
    expect(parseOtlpAttributeValue(value, true)).toBe('-9223372036854775808');
    expect(() => parseOtlpAttributeValue(value)).toThrow(SyntaxError);
  });

  it.each([
    undefined,
    null,
    false,
    [],
    { stringValue: false },
    { boolValue: 'false' },
    { doubleValue: '0' },
    { doubleValue: Number.NaN },
    { doubleValue: Infinity },
    { intValue: [] },
    { intValue: [1] },
    { intValue: {} },
    { intValue: 1.5 },
    { boolValue: false, stringValue: 'allowed' },
    { unsupportedValue: 'allowed' },
    { arrayValue: null },
    { arrayValue: { values: null } },
    { arrayValue: { values: {} } },
    { arrayValue: { values: [null] } },
    { kvlistValue: { values: [null] } },
    { kvlistValue: { values: [{ key: 'x' }] } },
    {
      kvlistValue: {
        values: [
          { key: 'x', value: {} },
          { key: 'x', value: {} },
        ],
      },
    },
  ])('rejects malformed AnyValue %j', (value) => {
    expect(() => parseOtlpAttributes([{ key: 'evidence', value }])).toThrow(SyntaxError);
  });
});
