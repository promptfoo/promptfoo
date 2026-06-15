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
    it('should describe default no-threshold behavior', () => {
      expect(getThresholdLabel(undefined)).toBe('All assertions must pass');
    });

    it('should state full aggregate-score requirements', () => {
      expect(getThresholdLabel(1)).toBe('Required score: 100%');
      expect(getThresholdLabel(THRESHOLD.ALL)).toBe('Required score: 100%');
    });

    it('should not interpret weighted half scores as either-or child counts', () => {
      expect(getThresholdLabel(0.5)).toBe('Required score: 50%');
      expect(getThresholdLabel(THRESHOLD.HALF)).toBe('Required score: 50%');
    });

    it('should state low aggregate-score thresholds explicitly', () => {
      expect(getThresholdLabel(0.25)).toBe('Required score: 25%');
      expect(getThresholdLabel(0.1)).toBe('Required score: 10%');
      expect(getThresholdLabel(0.01)).toBe('Required score: 1%');
    });

    it('should state high aggregate-score thresholds explicitly', () => {
      expect(getThresholdLabel(0.75)).toBe('Required score: 75%');
      expect(getThresholdLabel(0.9)).toBe('Required score: 90%');
      expect(getThresholdLabel(0.51)).toBe('Required score: 51%');
      expect(getThresholdLabel(0.99)).toBe('Required score: 99%');
    });

    it('should retain an explicit zero aggregate-score threshold', () => {
      expect(getThresholdLabel(0)).toBe('Required score: 0%');
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
