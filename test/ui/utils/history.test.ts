/**
 * Tests for history utility functions.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  formatRelativeTime,
  formatShortId,
  getPassRateIndicator,
} from '../../../src/ui/utils/history';

describe('history utility', () => {
  describe('formatRelativeTime', () => {
    const NOW = 1702310400000; // Fixed timestamp: 2023-12-11T16:00:00Z

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "Just now" for recent timestamps', () => {
      expect(formatRelativeTime(NOW - 30 * 1000)).toBe('Just now');
    });

    it('should return "1 minute ago" for one minute', () => {
      expect(formatRelativeTime(NOW - 60 * 1000)).toBe('1 minute ago');
    });

    it('should return "X minutes ago" for multiple minutes', () => {
      expect(formatRelativeTime(NOW - 5 * 60 * 1000)).toBe('5 minutes ago');
      expect(formatRelativeTime(NOW - 30 * 60 * 1000)).toBe('30 minutes ago');
    });

    it('should return "1 hour ago" for one hour', () => {
      expect(formatRelativeTime(NOW - 60 * 60 * 1000)).toBe('1 hour ago');
    });

    it('should return "X hours ago" for multiple hours', () => {
      expect(formatRelativeTime(NOW - 2 * 60 * 60 * 1000)).toBe('2 hours ago');
      expect(formatRelativeTime(NOW - 12 * 60 * 60 * 1000)).toBe('12 hours ago');
    });

    it('should return "Yesterday" for one day ago', () => {
      expect(formatRelativeTime(NOW - 24 * 60 * 60 * 1000)).toBe('Yesterday');
    });

    it('should return "X days ago" for multiple days', () => {
      expect(formatRelativeTime(NOW - 2 * 24 * 60 * 60 * 1000)).toBe('2 days ago');
      expect(formatRelativeTime(NOW - 5 * 24 * 60 * 60 * 1000)).toBe('5 days ago');
    });

    it('should return formatted date for more than a week ago', () => {
      const tenDaysAgo = NOW - 10 * 24 * 60 * 60 * 1000;
      const result = formatRelativeTime(tenDaysAgo);
      // Should be a date string like "Dec 1"
      expect(result).toMatch(/[A-Z][a-z]{2} \d{1,2}/);
    });
  });

  describe('formatShortId', () => {
    it('should remove eval- prefix and truncate', () => {
      const evalId = 'eval-abc-2025-12-10T14-30-00';
      expect(formatShortId(evalId)).toBe('abc-2025-12-10');
    });

    it('should handle IDs without prefix', () => {
      const evalId = 'xyz-2025-12-10T14-30-00';
      expect(formatShortId(evalId)).toBe('xyz-2025-12-10');
    });

    it('should handle IDs with longer sequence', () => {
      const evalId = 'eval-abcdef-2025-12-10T14-30-00';
      expect(formatShortId(evalId)).toBe('abcdef-2025-12-10');
    });

    it('should fallback to truncation for non-standard format', () => {
      const evalId = 'some-custom-eval-id-format';
      // Fallback truncates to first 20 characters
      expect(formatShortId(evalId)).toBe('some-custom-eval-id-');
    });
  });

  describe('getPassRateIndicator', () => {
    it('should return green check for 90% and above', () => {
      expect(getPassRateIndicator(90)).toEqual({ symbol: '✓', color: 'green' });
      expect(getPassRateIndicator(95)).toEqual({ symbol: '✓', color: 'green' });
      expect(getPassRateIndicator(100)).toEqual({ symbol: '✓', color: 'green' });
    });

    it('should return yellow check for 70-89%', () => {
      expect(getPassRateIndicator(70)).toEqual({ symbol: '✓', color: 'yellow' });
      expect(getPassRateIndicator(75)).toEqual({ symbol: '✓', color: 'yellow' });
      expect(getPassRateIndicator(89)).toEqual({ symbol: '✓', color: 'yellow' });
    });

    it('should return red X for below 70%', () => {
      expect(getPassRateIndicator(0)).toEqual({ symbol: '✗', color: 'red' });
      expect(getPassRateIndicator(50)).toEqual({ symbol: '✗', color: 'red' });
      expect(getPassRateIndicator(69)).toEqual({ symbol: '✗', color: 'red' });
    });
  });
});
