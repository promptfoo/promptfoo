/**
 * Tests for table navigation utilities.
 */

import { describe, expect, it } from 'vitest';
import { getVisibleRowRange } from '../../../../src/ui/components/table/useTableNavigation';

describe('getVisibleRowRange', () => {
  it('returns correct range from start', () => {
    const { start, end } = getVisibleRowRange(0, 10, 100);
    expect(start).toBe(0);
    expect(end).toBe(10);
  });

  it('returns correct range when scrolled', () => {
    const { start, end } = getVisibleRowRange(5, 10, 100);
    expect(start).toBe(5);
    expect(end).toBe(15);
  });

  it('caps end at total rows', () => {
    const { start, end } = getVisibleRowRange(95, 10, 100);
    expect(start).toBe(95);
    expect(end).toBe(100);
  });

  it('handles small datasets', () => {
    const { start, end } = getVisibleRowRange(0, 10, 5);
    expect(start).toBe(0);
    expect(end).toBe(5);
  });

  it('handles zero visible rows', () => {
    const { start, end } = getVisibleRowRange(0, 0, 100);
    expect(start).toBe(0);
    expect(end).toBe(0);
  });

  it('handles empty dataset', () => {
    const { start, end } = getVisibleRowRange(0, 10, 0);
    expect(start).toBe(0);
    expect(end).toBe(0);
  });
});
