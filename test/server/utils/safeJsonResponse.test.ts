import { describe, expect, it } from 'vitest';
import { stripOversizedStrings } from '../../../src/server/utils/safeJsonResponse';

describe('stripOversizedStrings', () => {
  it('replaces circular array references instead of recursing indefinitely', () => {
    const value: unknown[] = ['safe'];
    value.push(value);

    expect(stripOversizedStrings(value)).toEqual(['safe', '[Circular Reference]']);
  });

  it('handles objects whose toJSON returns the same object', () => {
    const value = {
      toJSON() {
        return value;
      },
    };

    expect(stripOversizedStrings(value)).toBe('[Circular Reference]');
  });

  it('returns a serializable placeholder for deeply nested eval data', () => {
    let value: object = { leaf: 'safe' };
    for (let depth = 0; depth < 4000; depth++) {
      value = { child: value };
    }

    expect(JSON.stringify(stripOversizedStrings(value))).toContain('excessive nesting');
  });

  it('bounds aggregate retained string content', () => {
    expect(
      stripOversizedStrings(['1234', '5678'], { maxStringLength: 10, maxTotalStringLength: 6 }),
    ).toEqual(['1234', '[content omitted: 4 characters]']);
  });
});
