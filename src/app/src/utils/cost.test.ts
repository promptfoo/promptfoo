import { calculateRunsPerCostUnit, formatRunsPerCostUnit, formatUsdCost } from '@app/utils/cost';
import { describe, expect, it } from 'vitest';

describe('cost utilities', () => {
  it('formats USD cost in dollars and cents', () => {
    expect(formatUsdCost(0.01234, 'dollars')).toBe('$0.012');
    expect(formatUsdCost(0.01234, 'cents')).toBe('1.2¢');
  });

  it('keeps fractional cents visible', () => {
    expect(formatUsdCost(0.00012, 'cents')).toBe('0.012¢');
  });

  it('calculates runs per dollar and cent from USD cost', () => {
    expect(calculateRunsPerCostUnit(0.00012, 'dollars')).toBeCloseTo(8333.3333, 4);
    expect(calculateRunsPerCostUnit(0.00012, 'cents')).toBeCloseTo(83.3333, 4);
  });

  it.each([
    undefined,
    0,
    -0.1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('omits runs for invalid cost %s', (cost) => {
    expect(calculateRunsPerCostUnit(cost, 'dollars')).toBeUndefined();
  });

  it('formats readable runs rates without flooring fractional values', () => {
    expect(formatRunsPerCostUnit(8333.3333, 'dollars')).toBe('8,330 runs/$1');
    expect(formatRunsPerCostUnit(83.3333, 'cents')).toBe('83.3 runs/1¢');
    expect(formatRunsPerCostUnit(0.5, 'dollars')).toBe('0.5 runs/$1');
  });
});
