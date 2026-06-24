import { describe, expect, it } from 'vitest';
import { getGeneratedTestCaseLengthViolation } from '../../../src/redteam/shared/promptLength';

describe('getGeneratedTestCaseLengthViolation', () => {
  it('checks each generated sequence prompt against the minimum', () => {
    expect(
      getGeneratedTestCaseLengthViolation({ prompt: ['a', 'b'] }, 'prompt', {
        minCharsPerMessage: 3,
      }),
    ).toEqual({ kind: 'min', length: 1, limit: 3, path: 'prompt' });
  });
});
