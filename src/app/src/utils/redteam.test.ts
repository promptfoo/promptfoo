import { describe, expect, it } from 'vitest';
import { formatASRForDisplay } from './redteam';

describe('redteam utils', () => {
  describe('formatASRForDisplay', () => {
    it('should format ASR with default 2 significant digits', () => {
      expect(formatASRForDisplay(12.345)).toBe('12.35');
      expect(formatASRForDisplay(67.891)).toBe('67.89');
      expect(formatASRForDisplay(99.999)).toBe('100.00');
    });

    it('should format ASR with custom significant digits', () => {
      expect(formatASRForDisplay(12.345, 0)).toBe('12');
      expect(formatASRForDisplay(12.345, 1)).toBe('12.3');
      expect(formatASRForDisplay(12.345, 3)).toBe('12.345');
      expect(formatASRForDisplay(12.345, 4)).toBe('12.3450');
    });

    it('should handle integer values', () => {
      expect(formatASRForDisplay(50)).toBe('50.00');
      expect(formatASRForDisplay(100)).toBe('100.00');
      expect(formatASRForDisplay(0)).toBe('0.00');
    });

    it('should handle values less than 1', () => {
      expect(formatASRForDisplay(0.5)).toBe('0.50');
      expect(formatASRForDisplay(0.12345)).toBe('0.12');
      expect(formatASRForDisplay(0.999)).toBe('1.00');
    });

    it('should handle zero', () => {
      expect(formatASRForDisplay(0)).toBe('0.00');
      expect(formatASRForDisplay(0, 0)).toBe('0');
      expect(formatASRForDisplay(0, 3)).toBe('0.000');
    });

    it('should handle large values', () => {
      expect(formatASRForDisplay(999.99)).toBe('999.99');
      expect(formatASRForDisplay(1234.5678, 1)).toBe('1234.6');
    });

    it('should handle negative values', () => {
      expect(formatASRForDisplay(-5.5)).toBe('-5.50');
      expect(formatASRForDisplay(-10.123, 3)).toBe('-10.123');
    });

    it('should round values correctly', () => {
      expect(formatASRForDisplay(12.344, 2)).toBe('12.34');
      expect(formatASRForDisplay(12.345, 2)).toBe('12.35');
      expect(formatASRForDisplay(12.346, 2)).toBe('12.35');
    });
  });
});
