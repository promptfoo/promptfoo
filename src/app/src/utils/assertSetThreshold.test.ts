import { describe, expect, it } from 'vitest';

import { formatScoreThreshold, getThresholdLabel, THRESHOLD } from './assertSetThreshold';

describe('assertSetThreshold', () => {
  describe('THRESHOLD constants', () => {
    it('should have correct values', () => {
      expect(THRESHOLD.ALL).toBe(1);
      expect(THRESHOLD.HALF).toBe(0.5);
    });
  });

  describe('getThresholdLabel', () => {
    it('should return "ALL must pass" for undefined threshold', () => {
      expect(getThresholdLabel(undefined)).toBe('ALL must pass');
    });

    it('should return "ALL must pass" for threshold of 1', () => {
      expect(getThresholdLabel(1)).toBe('ALL must pass');
      expect(getThresholdLabel(THRESHOLD.ALL)).toBe('ALL must pass');
    });

    it('should return "Either/Or" for threshold of 0.5', () => {
      expect(getThresholdLabel(0.5)).toBe('Either/Or');
      expect(getThresholdLabel(THRESHOLD.HALF)).toBe('Either/Or');
    });

    it('should return "At least one" for threshold less than 0.5', () => {
      expect(getThresholdLabel(0.25)).toBe('At least one');
      expect(getThresholdLabel(0.1)).toBe('At least one');
      expect(getThresholdLabel(0.01)).toBe('At least one');
    });

    it('should return "Most must pass" for threshold between 0.5 and 1', () => {
      expect(getThresholdLabel(0.75)).toBe('Most must pass');
      expect(getThresholdLabel(0.9)).toBe('Most must pass');
      expect(getThresholdLabel(0.51)).toBe('Most must pass');
      expect(getThresholdLabel(0.99)).toBe('Most must pass');
    });

    it('should include child count in "Most must pass" label when provided', () => {
      expect(getThresholdLabel(0.75, 4)).toBe('Most must pass (3/4)');
      expect(getThresholdLabel(0.8, 5)).toBe('Most must pass (4/5)');
      expect(getThresholdLabel(0.6, 10)).toBe('Most must pass (6/10)');
    });

    it('should return empty string for threshold of 0', () => {
      expect(getThresholdLabel(0)).toBe('');
    });
  });

  describe('formatScoreThreshold', () => {
    it('should format score as percentage when no threshold', () => {
      expect(formatScoreThreshold(0.75)).toBe('75%');
      expect(formatScoreThreshold(0.5)).toBe('50%');
      expect(formatScoreThreshold(1)).toBe('100%');
      expect(formatScoreThreshold(0)).toBe('0%');
    });

    it('should show >= when score meets threshold', () => {
      expect(formatScoreThreshold(0.75, 0.5)).toBe('75% ≥ 50%');
      expect(formatScoreThreshold(0.5, 0.5)).toBe('50% ≥ 50%');
      expect(formatScoreThreshold(1, 0.75)).toBe('100% ≥ 75%');
    });

    it('should show < when score is below threshold', () => {
      expect(formatScoreThreshold(0.25, 0.5)).toBe('25% < 50%');
      expect(formatScoreThreshold(0.49, 0.5)).toBe('49% < 50%');
      expect(formatScoreThreshold(0, 0.1)).toBe('0% < 10%');
    });

    it('should round percentages to nearest integer', () => {
      expect(formatScoreThreshold(0.333)).toBe('33%');
      expect(formatScoreThreshold(0.666)).toBe('67%');
      expect(formatScoreThreshold(0.999, 0.5)).toBe('100% ≥ 50%');
    });
  });
});
