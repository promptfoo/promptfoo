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
});
