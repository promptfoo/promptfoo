import { describe, expect, it } from 'vitest';
import { formatDataGridDate, formatDuration, isValidDuration } from './date';

describe('isValidDuration', () => {
  it('should return true for valid positive numbers', () => {
    expect(isValidDuration(0)).toBe(true);
    expect(isValidDuration(1)).toBe(true);
    expect(isValidDuration(1000)).toBe(true);
    expect(isValidDuration(0.5)).toBe(true);
  });

  it('should return false for NaN', () => {
    expect(isValidDuration(NaN)).toBe(false);
  });

  it('should return false for Infinity', () => {
    expect(isValidDuration(Infinity)).toBe(false);
    expect(isValidDuration(-Infinity)).toBe(false);
  });

  it('should return false for negative numbers', () => {
    expect(isValidDuration(-1)).toBe(false);
    expect(isValidDuration(-1000)).toBe(false);
  });

  it('should return false for non-number types', () => {
    expect(isValidDuration('1000')).toBe(false);
    expect(isValidDuration(null)).toBe(false);
    expect(isValidDuration(undefined)).toBe(false);
    expect(isValidDuration({})).toBe(false);
    expect(isValidDuration([])).toBe(false);
  });
});

describe('formatDuration', () => {
  describe('milliseconds (< 1000ms)', () => {
    it('should format values under 1 second as milliseconds', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(1)).toBe('1ms');
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should round milliseconds to nearest integer', () => {
      expect(formatDuration(500.4)).toBe('500ms');
      expect(formatDuration(500.6)).toBe('501ms');
    });
  });

  describe('seconds (1s - 59.9s)', () => {
    it('should format values under 1 minute as seconds with one decimal', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(45000)).toBe('45.0s');
      expect(formatDuration(59999)).toBe('60.0s');
    });
  });

  describe('minutes (1m - 59m)', () => {
    it('should format values under 1 hour as minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('should handle edge case where seconds round to 60', () => {
      // 119500ms = 1m 59.5s, which rounds to 60s, should display as 2m
      expect(formatDuration(119500)).toBe('2m');
    });

    it('should omit seconds when they are 0', () => {
      expect(formatDuration(120000)).toBe('2m');
      expect(formatDuration(180000)).toBe('3m');
    });
  });

  describe('hours (1h+)', () => {
    it('should format values over 1 hour as hours and minutes', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(3660000)).toBe('1h 1m');
      expect(formatDuration(3661000)).toBe('1h 1m');
      expect(formatDuration(7200000)).toBe('2h');
      expect(formatDuration(7260000)).toBe('2h 1m');
    });

    it('should omit minutes when they are 0', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(7200000)).toBe('2h');
    });
  });

  describe('invalid inputs', () => {
    it('should return null for NaN', () => {
      expect(formatDuration(NaN)).toBe(null);
    });

    it('should return null for Infinity', () => {
      expect(formatDuration(Infinity)).toBe(null);
      expect(formatDuration(-Infinity)).toBe(null);
    });

    it('should return null for negative numbers', () => {
      expect(formatDuration(-1)).toBe(null);
      expect(formatDuration(-1000)).toBe(null);
    });
  });
});

describe('formatDataGridDate', () => {
  it('should return empty string for null/undefined values', () => {
    expect(formatDataGridDate(null)).toBe('');
    expect(formatDataGridDate(undefined)).toBe('');
  });

  it('should return empty string for invalid date strings', () => {
    expect(formatDataGridDate('invalid')).toBe('');
    expect(formatDataGridDate('not a date')).toBe('');
  });

  it('should format valid date strings', () => {
    const result = formatDataGridDate('2024-01-15T10:30:00Z');
    expect(result).toContain('2024');
    expect(result).toContain('January');
    expect(result).toContain('15');
  });

  it('should format Date objects', () => {
    const date = new Date('2024-06-20T14:45:00Z');
    const result = formatDataGridDate(date);
    expect(result).toContain('2024');
    expect(result).toContain('June');
    expect(result).toContain('20');
  });

  it('should format timestamps (numbers)', () => {
    const timestamp = new Date('2024-03-10T08:00:00Z').getTime();
    const result = formatDataGridDate(timestamp);
    expect(result).toContain('2024');
    expect(result).toContain('March');
    expect(result).toContain('10');
  });
});
