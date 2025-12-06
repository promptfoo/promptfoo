import { describe, it, expect } from 'vitest';
import { formatElapsedTime, formatNumber } from './utils';

describe('formatElapsedTime', () => {
  it('should format seconds only when less than a minute', () => {
    expect(formatElapsedTime(0)).toBe('0s');
    expect(formatElapsedTime(1000)).toBe('1s');
    expect(formatElapsedTime(30000)).toBe('30s');
    expect(formatElapsedTime(59000)).toBe('59s');
  });

  it('should format minutes and seconds', () => {
    expect(formatElapsedTime(60000)).toBe('1m 0s');
    expect(formatElapsedTime(61000)).toBe('1m 1s');
    expect(formatElapsedTime(90000)).toBe('1m 30s');
    expect(formatElapsedTime(120000)).toBe('2m 0s');
    expect(formatElapsedTime(125000)).toBe('2m 5s');
  });

  it('should handle large values', () => {
    expect(formatElapsedTime(3600000)).toBe('60m 0s'); // 1 hour
    expect(formatElapsedTime(3661000)).toBe('61m 1s'); // 1 hour 1 min 1 sec
  });

  it('should truncate milliseconds', () => {
    expect(formatElapsedTime(1500)).toBe('1s'); // 1.5 seconds rounds down to 1s
    expect(formatElapsedTime(1999)).toBe('1s'); // 1.999 seconds rounds down to 1s
  });
});

describe('formatNumber', () => {
  describe('small numbers (< 1000)', () => {
    it('should return number as string', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(1)).toBe('1');
      expect(formatNumber(100)).toBe('100');
      expect(formatNumber(999)).toBe('999');
    });
  });

  describe('thousands (1k - 999k)', () => {
    it('should format with k suffix', () => {
      expect(formatNumber(1000)).toBe('1.0k');
      expect(formatNumber(1500)).toBe('1.5k');
      expect(formatNumber(5000)).toBe('5.0k');
      expect(formatNumber(10000)).toBe('10.0k');
      expect(formatNumber(999999)).toBe('1000.0k');
    });

    it('should round to one decimal place', () => {
      expect(formatNumber(1234)).toBe('1.2k');
      expect(formatNumber(1256)).toBe('1.3k');
      expect(formatNumber(9999)).toBe('10.0k');
    });
  });

  describe('millions (>= 1M)', () => {
    it('should format with M suffix', () => {
      expect(formatNumber(1000000)).toBe('1.0M');
      expect(formatNumber(1500000)).toBe('1.5M');
      expect(formatNumber(10000000)).toBe('10.0M');
    });

    it('should round to one decimal place', () => {
      expect(formatNumber(1234567)).toBe('1.2M');
      expect(formatNumber(9999999)).toBe('10.0M');
    });
  });
});
