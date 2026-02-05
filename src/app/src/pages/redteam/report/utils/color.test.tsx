import { Severity } from '@promptfoo/redteam/constants';
import { describe, expect, it } from 'vitest';
import { getProgressColor, getSeverityColor } from './color';

describe('getSeverityColor', () => {
  it.each([
    { severity: Severity.Critical, expected: 'hsl(var(--severity-critical))' },
    { severity: Severity.High, expected: 'hsl(var(--severity-high))' },
    { severity: Severity.Medium, expected: 'hsl(var(--severity-medium))' },
    { severity: Severity.Low, expected: 'hsl(var(--severity-low))' },
    { severity: Severity.Informational, expected: 'hsl(var(--severity-informational))' },
  ])('should return CSS variable for $severity', ({ severity, expected }) => {
    const result = getSeverityColor(severity);
    expect(result).toBe(expected);
  });

  it('should return fallback color for unknown severity', () => {
    const result = getSeverityColor('invalid-severity' as Severity);
    expect(result).toBe('hsl(var(--muted-foreground))');
  });
});

describe('getProgressColor', () => {
  describe('when highIsBad is false (pass rate)', () => {
    it('should return critical color for very low pass rate (< 10%)', () => {
      const result = getProgressColor(5, false);
      expect(result).toBe('hsl(var(--severity-critical))');
    });

    it('should return high color for low pass rate (10-25%)', () => {
      const result = getProgressColor(20, false);
      expect(result).toBe('hsl(var(--severity-high))');
    });

    it('should return warning-dark color for medium-low pass rate (25-50%)', () => {
      const result = getProgressColor(40, false);
      expect(result).toBe('hsl(25 95% 45%)');
    });

    it('should return warning-light color for medium-high pass rate (50-75%)', () => {
      const result = getProgressColor(60, false);
      expect(result).toBe('hsl(25 95% 60%)');
    });

    it('should return low/success color for high pass rate (>75%)', () => {
      const result = getProgressColor(90, false);
      expect(result).toBe('hsl(var(--severity-low))');
    });
  });

  describe('when highIsBad is true (attack success rate)', () => {
    // When highIsBad is true, evalPercentage = percentage directly
    // So high percentages = bad = critical/high colors

    it('should return low/success color for very low attack rate (< 25%)', () => {
      const result = getProgressColor(20, true);
      expect(result).toBe('hsl(var(--severity-low))');
    });

    it('should return warning-light color for low-medium attack rate (25-50%)', () => {
      const result = getProgressColor(40, true);
      expect(result).toBe('hsl(25 95% 60%)');
    });

    it('should return warning-dark color for medium attack rate (50-75%)', () => {
      const result = getProgressColor(60, true);
      expect(result).toBe('hsl(25 95% 45%)');
    });

    it('should return high color for high attack rate (75-90%)', () => {
      const result = getProgressColor(80, true);
      expect(result).toBe('hsl(var(--severity-high))');
    });

    it('should return critical color for very high attack rate (>90%)', () => {
      const result = getProgressColor(95, true);
      expect(result).toBe('hsl(var(--severity-critical))');
    });
  });
});
