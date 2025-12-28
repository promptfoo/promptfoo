/**
 * Tests for table type utilities.
 */

import { describe, expect, it } from 'vitest';
import { ResultFailureReason } from '../../../../src/types';
import { getCellStatus } from '../../../../src/ui/components/table/types';

describe('getCellStatus', () => {
  it('returns "pass" when pass is true', () => {
    expect(getCellStatus(true, ResultFailureReason.NONE)).toBe('pass');
    expect(getCellStatus(true, ResultFailureReason.ASSERT)).toBe('pass');
    expect(getCellStatus(true, ResultFailureReason.ERROR)).toBe('pass');
  });

  it('returns "fail" when pass is false and failure reason is ASSERT', () => {
    expect(getCellStatus(false, ResultFailureReason.ASSERT)).toBe('fail');
  });

  it('returns "error" when pass is false and failure reason is ERROR', () => {
    expect(getCellStatus(false, ResultFailureReason.ERROR)).toBe('error');
  });

  it('returns "fail" when pass is false and failure reason is NONE', () => {
    // NONE means we don't know the reason, but the test still failed
    expect(getCellStatus(false, ResultFailureReason.NONE)).toBe('fail');
  });
});
