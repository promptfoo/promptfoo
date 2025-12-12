import { describe, expect, it } from 'vitest';
import {
  formatAvgLatency,
  formatCost,
  formatDuration,
  formatLatency,
  formatPercent,
  formatRate,
  formatTokens,
  truncate,
  calculateETA,
  formatETA,
} from '../../src/ui/utils/format';

describe('Format Utilities', () => {
  describe('formatTokens', () => {
    it('should return 0 for zero tokens', () => {
      expect(formatTokens(0)).toBe('0');
    });

    it('should return raw number for tokens under 1000', () => {
      expect(formatTokens(500)).toBe('500');
      expect(formatTokens(999)).toBe('999');
    });

    it('should format thousands with k suffix', () => {
      expect(formatTokens(1000)).toBe('1k');
      expect(formatTokens(1500)).toBe('1.5k');
      expect(formatTokens(12450)).toBe('12k');
      expect(formatTokens(99999)).toBe('100k');
    });

    it('should format millions with M suffix', () => {
      expect(formatTokens(1_000_000)).toBe('1M');
      expect(formatTokens(1_500_000)).toBe('1.5M');
      expect(formatTokens(12_500_000)).toBe('13M');
    });
  });

  describe('formatCost', () => {
    it('should return $0.00 for zero cost', () => {
      expect(formatCost(0)).toBe('$0.00');
    });

    it('should format very small costs with 4 decimal places', () => {
      expect(formatCost(0.001)).toBe('$0.0010');
      expect(formatCost(0.0023)).toBe('$0.0023');
    });

    it('should format small costs with 2 decimal places', () => {
      expect(formatCost(0.05)).toBe('$0.05');
      expect(formatCost(0.35)).toBe('$0.35');
      expect(formatCost(0.99)).toBe('$0.99');
    });

    it('should format costs over $1 with 2 decimal places', () => {
      expect(formatCost(1.23)).toBe('$1.23');
      expect(formatCost(5.0)).toBe('$5.00');
      expect(formatCost(9.99)).toBe('$9.99');
    });

    it('should format large costs with no decimal places', () => {
      expect(formatCost(10)).toBe('$10');
      expect(formatCost(123.45)).toBe('$123');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(10000)).toBe('10s');
      expect(formatDuration(59999)).toBe('60s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(5400000)).toBe('1h 30m');
      expect(formatDuration(7200000)).toBe('2h');
    });
  });

  describe('formatLatency', () => {
    it('should return dash for zero or invalid latency', () => {
      expect(formatLatency(0)).toBe('-');
      expect(formatLatency(Infinity)).toBe('-');
      expect(formatLatency(NaN)).toBe('-');
    });

    it('should format milliseconds', () => {
      expect(formatLatency(234)).toBe('234ms');
      expect(formatLatency(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatLatency(1200)).toBe('1.2s');
      expect(formatLatency(10000)).toBe('10s');
    });
  });

  describe('formatPercent', () => {
    it('should return 0% for zero total', () => {
      expect(formatPercent(5, 0)).toBe('0%');
    });

    it('should calculate and format percentage', () => {
      expect(formatPercent(50, 100)).toBe('50%');
      expect(formatPercent(1, 3)).toBe('33%');
      expect(formatPercent(87, 100)).toBe('87%');
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate long strings with ellipsis', () => {
      expect(truncate('hello world', 8)).toBe('hello w…');
      expect(truncate('this is a long string', 10)).toBe('this is a…');
    });
  });

  describe('formatRate', () => {
    it('should return 0 for zero total', () => {
      expect(formatRate(5, 0)).toBe('0');
    });

    it('should format rate with percentage', () => {
      expect(formatRate(23, 100)).toBe('23 (23%)');
      expect(formatRate(66, 200)).toBe('66 (33%)');
    });
  });

  describe('formatAvgLatency', () => {
    it('should return dash for zero count', () => {
      expect(formatAvgLatency(1000, 0)).toBe('-');
    });

    it('should calculate and format average', () => {
      expect(formatAvgLatency(1000, 2)).toBe('500ms');
      expect(formatAvgLatency(5000, 5)).toBe('1.0s');
    });
  });

  describe('calculateETA', () => {
    it('should return null when completed is 0', () => {
      expect(calculateETA(0, 100, 5000)).toBeNull();
    });

    it('should return null when total is 0', () => {
      expect(calculateETA(50, 0, 5000)).toBeNull();
    });

    it('should return null when elapsed is 0', () => {
      expect(calculateETA(50, 100, 0)).toBeNull();
    });

    it('should return 0 when completed equals total', () => {
      expect(calculateETA(100, 100, 5000)).toBe(0);
    });

    it('should return 0 when completed exceeds total', () => {
      expect(calculateETA(150, 100, 5000)).toBe(0);
    });

    it('should calculate ETA based on throughput', () => {
      // 50 completed in 5000ms = 10ms per item
      // 50 remaining = 500ms expected
      const eta = calculateETA(50, 100, 5000);
      expect(eta).toBe(5000); // 50 remaining at same rate
    });

    it('should calculate ETA for different progress rates', () => {
      // 25 completed in 1000ms = 40ms per item
      // 75 remaining = 3000ms expected
      const eta = calculateETA(25, 100, 1000);
      expect(eta).toBe(3000);
    });

    it('should return null for extremely long ETAs (over 24 hours)', () => {
      // 1 completed in 1 hour = 24 hours for 24 more
      // But 100 total would be 99 hours remaining - should return null
      const eta = calculateETA(1, 100, 3600000); // 1 hour elapsed
      expect(eta).toBeNull();
    });
  });

  describe('formatETA', () => {
    it('should return empty string for null', () => {
      expect(formatETA(null)).toBe('');
    });

    it('should return empty string for 0', () => {
      expect(formatETA(0)).toBe('');
    });

    it('should format seconds remaining', () => {
      expect(formatETA(5000)).toBe('~5.0s left');
      expect(formatETA(30000)).toBe('~30s left');
    });

    it('should format minutes remaining', () => {
      expect(formatETA(90000)).toBe('~1m 30s left');
      expect(formatETA(300000)).toBe('~5m left');
    });

    it('should format hours remaining', () => {
      expect(formatETA(3660000)).toBe('~1h 1m left');
    });
  });
});
