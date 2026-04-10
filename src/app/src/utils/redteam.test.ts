import { describe, expect, it } from 'vitest';
import { formatASRForDisplay, getASRColor, getPassRateColor } from './redteam';

describe('redteam utils', () => {
  describe('getASRColor', () => {
    it('should return dark red for ASR >= 75%', () => {
      expect(getASRColor(75)).toBe('#d32f2f');
      expect(getASRColor(80)).toBe('#d32f2f');
      expect(getASRColor(100)).toBe('#d32f2f');
    });

    it('should return red for ASR >= 50% and < 75%', () => {
      expect(getASRColor(50)).toBe('#f44336');
      expect(getASRColor(60)).toBe('#f44336');
      expect(getASRColor(74)).toBe('#f44336');
    });

    it('should return orange for ASR >= 25% and < 50%', () => {
      expect(getASRColor(25)).toBe('#ff9800');
      expect(getASRColor(30)).toBe('#ff9800');
      expect(getASRColor(49)).toBe('#ff9800');
    });

    it('should return amber for ASR >= 10% and < 25%', () => {
      expect(getASRColor(10)).toBe('#ffc107');
      expect(getASRColor(15)).toBe('#ffc107');
      expect(getASRColor(24)).toBe('#ffc107');
    });

    it('should return green for ASR < 10%', () => {
      expect(getASRColor(0)).toBe('#4caf50');
      expect(getASRColor(5)).toBe('#4caf50');
      expect(getASRColor(9)).toBe('#4caf50');
    });

    it('should handle boundary values correctly', () => {
      expect(getASRColor(75)).toBe('#d32f2f'); // exactly 75
      expect(getASRColor(50)).toBe('#f44336'); // exactly 50
      expect(getASRColor(25)).toBe('#ff9800'); // exactly 25
      expect(getASRColor(10)).toBe('#ffc107'); // exactly 10
    });

    it('should handle edge cases', () => {
      expect(getASRColor(0)).toBe('#4caf50');
      expect(getASRColor(100)).toBe('#d32f2f');
    });

    it('should handle decimal values', () => {
      expect(getASRColor(74.9)).toBe('#f44336');
      expect(getASRColor(75.1)).toBe('#d32f2f');
      expect(getASRColor(9.9)).toBe('#4caf50');
      expect(getASRColor(10.1)).toBe('#ffc107');
    });
  });

  describe('getPassRateColor', () => {
    it('should return green for pass rate >= 90%', () => {
      expect(getPassRateColor(90)).toBe('#4caf50');
      expect(getPassRateColor(95)).toBe('#4caf50');
      expect(getPassRateColor(100)).toBe('#4caf50');
    });

    it('should return light green for pass rate >= 75% and < 90%', () => {
      expect(getPassRateColor(75)).toBe('#8bc34a');
      expect(getPassRateColor(80)).toBe('#8bc34a');
      expect(getPassRateColor(89)).toBe('#8bc34a');
    });

    it('should return yellow for pass rate >= 50% and < 75%', () => {
      expect(getPassRateColor(50)).toBe('#ffeb3b');
      expect(getPassRateColor(60)).toBe('#ffeb3b');
      expect(getPassRateColor(74)).toBe('#ffeb3b');
    });

    it('should return orange for pass rate >= 25% and < 50%', () => {
      expect(getPassRateColor(25)).toBe('#ff9800');
      expect(getPassRateColor(30)).toBe('#ff9800');
      expect(getPassRateColor(49)).toBe('#ff9800');
    });

    it('should return red for pass rate < 25%', () => {
      expect(getPassRateColor(0)).toBe('#f44336');
      expect(getPassRateColor(10)).toBe('#f44336');
      expect(getPassRateColor(24)).toBe('#f44336');
    });

    it('should handle boundary values correctly', () => {
      expect(getPassRateColor(90)).toBe('#4caf50'); // exactly 90
      expect(getPassRateColor(75)).toBe('#8bc34a'); // exactly 75
      expect(getPassRateColor(50)).toBe('#ffeb3b'); // exactly 50
      expect(getPassRateColor(25)).toBe('#ff9800'); // exactly 25
    });

    it('should handle edge cases', () => {
      expect(getPassRateColor(0)).toBe('#f44336');
      expect(getPassRateColor(100)).toBe('#4caf50');
    });

    it('should handle decimal values', () => {
      expect(getPassRateColor(89.9)).toBe('#8bc34a');
      expect(getPassRateColor(90.1)).toBe('#4caf50');
      expect(getPassRateColor(24.9)).toBe('#f44336');
      expect(getPassRateColor(25.1)).toBe('#ff9800');
    });
  });

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
