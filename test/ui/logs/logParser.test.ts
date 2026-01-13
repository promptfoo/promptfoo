import { describe, expect, it } from 'vitest';
import {
  filterEntries,
  formatRelativeTime,
  formatTimestamp,
  getLevelCounts,
  getSourceCounts,
  groupDuplicateEntries,
  hasMeaningfulContinuation,
  isLogEntryStart,
  parseLogEntries,
} from '../../../src/ui/logs/logParser';

describe('logParser', () => {
  describe('isLogEntryStart', () => {
    it('should detect valid log entry lines', () => {
      expect(
        isLogEntryStart('2026-01-13T04:02:20.142Z [DEBUG] [logger.ts:1]: Some message'),
      ).toBe(true);
      expect(isLogEntryStart('2026-01-13T04:02:20.142Z [ERROR] [eval.ts:42]: Error occurred')).toBe(
        true,
      );
      expect(isLogEntryStart('2026-01-13T04:02:20.142Z [WARN]: Warning message')).toBe(true);
      expect(isLogEntryStart('2026-01-13T04:02:20.142Z [INFO]: Info message')).toBe(true);
    });

    it('should reject non-entry lines', () => {
      expect(isLogEntryStart('    at finalizeResolution (node:internal/modules:274:11)')).toBe(
        false,
      );
      expect(isLogEntryStart('Some random text')).toBe(false);
      expect(isLogEntryStart('')).toBe(false);
      expect(isLogEntryStart('   ')).toBe(false);
    });
  });

  describe('parseLogEntries', () => {
    it('should parse a simple log entry', () => {
      const lines = ['2026-01-13T04:02:20.142Z [DEBUG] [logger.ts:1]: Test message'];

      const entries = parseLogEntries(lines);

      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('debug');
      expect(entries[0].source).toBe('logger.ts:1');
      expect(entries[0].message).toBe('Test message');
      expect(entries[0].startLine).toBe(1);
      expect(entries[0].endLine).toBe(1);
      expect(entries[0].continuationLines).toHaveLength(0);
    });

    it('should parse entries without source', () => {
      const lines = ['2026-01-13T04:02:20.142Z [INFO]: No source here'];

      const entries = parseLogEntries(lines);

      expect(entries).toHaveLength(1);
      expect(entries[0].source).toBeNull();
      expect(entries[0].message).toBe('No source here');
    });

    it('should group continuation lines with their parent entry', () => {
      const lines = [
        '2026-01-13T04:02:20.142Z [ERROR] [logger.ts:1]: Error occurred',
        '    at finalizeResolution (node:internal/modules:274:11)',
        '    at moduleResolve (node:internal/modules:864:10)',
        '    at defaultResolve (node:internal/modules:990:11)',
      ];

      const entries = parseLogEntries(lines);

      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('error');
      expect(entries[0].message).toBe('Error occurred');
      expect(entries[0].continuationLines).toHaveLength(3);
      expect(entries[0].startLine).toBe(1);
      expect(entries[0].endLine).toBe(4);
    });

    it('should handle multiple entries with stack traces', () => {
      const lines = [
        '2026-01-13T04:02:20.142Z [ERROR] [a.ts:1]: First error',
        '    at stack1',
        '    at stack2',
        '2026-01-13T04:02:21.000Z [ERROR] [b.ts:2]: Second error',
        '    at stack3',
      ];

      const entries = parseLogEntries(lines);

      expect(entries).toHaveLength(2);
      expect(entries[0].message).toBe('First error');
      expect(entries[0].continuationLines).toHaveLength(2);
      expect(entries[1].message).toBe('Second error');
      expect(entries[1].continuationLines).toHaveLength(1);
    });

    it('should parse timestamps correctly', () => {
      const lines = ['2026-01-13T04:02:20.142Z [DEBUG] [test.ts:1]: Test'];

      const entries = parseLogEntries(lines);

      expect(entries[0].timestamp).toBeInstanceOf(Date);
      expect(entries[0].timestamp?.toISOString()).toBe('2026-01-13T04:02:20.142Z');
    });

    it('should handle orphan lines before any entry', () => {
      const lines = ['Some orphan line', '2026-01-13T04:02:20.142Z [DEBUG] [test.ts:1]: Test'];

      const entries = parseLogEntries(lines);

      expect(entries).toHaveLength(2);
      expect(entries[0].level).toBe('unknown');
      expect(entries[0].message).toBe('Some orphan line');
    });

    it('should generate content hashes for duplicate detection', () => {
      const lines = [
        '2026-01-13T04:02:20.142Z [ERROR] [test.ts:1]: Same message',
        '2026-01-13T04:02:21.142Z [ERROR] [test.ts:1]: Same message',
        '2026-01-13T04:02:22.142Z [ERROR] [test.ts:1]: Different message',
      ];

      const entries = parseLogEntries(lines);

      expect(entries[0].contentHash).toBe(entries[1].contentHash);
      expect(entries[0].contentHash).not.toBe(entries[2].contentHash);
    });
  });

  describe('groupDuplicateEntries', () => {
    it('should group consecutive duplicate entries', () => {
      const lines = [
        '2026-01-13T04:02:20.142Z [ERROR] [test.ts:1]: Repeated error',
        '2026-01-13T04:02:21.142Z [ERROR] [test.ts:1]: Repeated error',
        '2026-01-13T04:02:22.142Z [ERROR] [test.ts:1]: Repeated error',
        '2026-01-13T04:02:23.142Z [DEBUG] [test.ts:1]: Different message',
      ];

      const entries = parseLogEntries(lines);
      const groups = groupDuplicateEntries(entries);

      expect(groups).toHaveLength(2);
      expect(groups[0].count).toBe(3);
      expect(groups[0].entry.message).toBe('Repeated error');
      expect(groups[1].count).toBe(1);
      expect(groups[1].entry.message).toBe('Different message');
    });

    it('should not group non-consecutive duplicates', () => {
      const lines = [
        '2026-01-13T04:02:20.142Z [ERROR] [test.ts:1]: Error A',
        '2026-01-13T04:02:21.142Z [DEBUG] [test.ts:1]: Different',
        '2026-01-13T04:02:22.142Z [ERROR] [test.ts:1]: Error A',
      ];

      const entries = parseLogEntries(lines);
      const groups = groupDuplicateEntries(entries);

      expect(groups).toHaveLength(3);
      expect(groups.every((g) => g.count === 1)).toBe(true);
    });

    it('should handle empty input', () => {
      const groups = groupDuplicateEntries([]);
      expect(groups).toHaveLength(0);
    });
  });

  describe('formatRelativeTime', () => {
    const now = new Date('2026-01-13T12:00:00.000Z');

    it('should format recent times', () => {
      expect(formatRelativeTime(new Date('2026-01-13T11:59:58.000Z'), now)).toBe('now');
      expect(formatRelativeTime(new Date('2026-01-13T11:59:50.000Z'), now)).toBe('10s ago');
      expect(formatRelativeTime(new Date('2026-01-13T11:59:00.000Z'), now)).toBe('1m ago');
      expect(formatRelativeTime(new Date('2026-01-13T11:55:00.000Z'), now)).toBe('5m ago');
    });

    it('should format hours', () => {
      expect(formatRelativeTime(new Date('2026-01-13T11:00:00.000Z'), now)).toBe('1h ago');
      expect(formatRelativeTime(new Date('2026-01-13T06:00:00.000Z'), now)).toBe('6h ago');
    });

    it('should format days', () => {
      expect(formatRelativeTime(new Date('2026-01-12T12:00:00.000Z'), now)).toBe('1d ago');
      expect(formatRelativeTime(new Date('2026-01-10T12:00:00.000Z'), now)).toBe('3d ago');
    });

    it('should format weeks as dates', () => {
      const result = formatRelativeTime(new Date('2026-01-01T12:00:00.000Z'), now);
      expect(result).toMatch(/Jan\s+1/);
    });

    it('should handle future times', () => {
      expect(formatRelativeTime(new Date('2026-01-14T12:00:00.000Z'), now)).toBe('future');
    });
  });

  describe('formatTimestamp', () => {
    const now = new Date('2026-01-13T12:00:00.000Z');

    it('should format relative timestamps with padding', () => {
      const date = new Date('2026-01-13T11:59:50.000Z');
      const result = formatTimestamp(date, true, now);
      expect(result).toBe(' 10s ago');
      expect(result.length).toBe(8);
    });

    it('should format absolute timestamps', () => {
      const date = new Date('2026-01-13T14:30:45.000Z');
      const result = formatTimestamp(date, false, now);
      // Format depends on locale, but should be HH:MM:SS
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('should handle null dates', () => {
      const result = formatTimestamp(null, true, now);
      expect(result).toBe('        ');
      expect(result.length).toBe(8);
    });
  });

  describe('getSourceCounts', () => {
    it('should count entries by source', () => {
      const lines = [
        '2026-01-13T04:02:20.142Z [DEBUG] [logger.ts:1]: A',
        '2026-01-13T04:02:21.142Z [DEBUG] [logger.ts:1]: B',
        '2026-01-13T04:02:22.142Z [DEBUG] [eval.ts:42]: C',
        '2026-01-13T04:02:23.142Z [DEBUG]: No source',
      ];

      const entries = parseLogEntries(lines);
      const counts = getSourceCounts(entries);

      expect(counts.get('logger.ts:1')).toBe(2);
      expect(counts.get('eval.ts:42')).toBe(1);
      expect(counts.get('(no source)')).toBe(1);
    });
  });

  describe('getLevelCounts', () => {
    it('should count entries by level', () => {
      const lines = [
        '2026-01-13T04:02:20.142Z [ERROR] [a.ts:1]: E1',
        '2026-01-13T04:02:21.142Z [ERROR] [a.ts:1]: E2',
        '2026-01-13T04:02:22.142Z [WARN] [a.ts:1]: W1',
        '2026-01-13T04:02:23.142Z [DEBUG] [a.ts:1]: D1',
        '2026-01-13T04:02:24.142Z [INFO] [a.ts:1]: I1',
      ];

      const entries = parseLogEntries(lines);
      const counts = getLevelCounts(entries);

      expect(counts.error).toBe(2);
      expect(counts.warn).toBe(1);
      expect(counts.debug).toBe(1);
      expect(counts.info).toBe(1);
    });
  });

  describe('filterEntries', () => {
    const lines = [
      '2026-01-13T04:02:20.142Z [ERROR] [logger.ts:1]: Error message',
      '    at stack trace',
      '2026-01-13T04:02:21.142Z [DEBUG] [eval.ts:42]: Debug message',
      '2026-01-13T04:02:22.142Z [DEBUG] [logger.ts:1]: Another debug',
    ];
    const entries = parseLogEntries(lines);

    it('should filter by level', () => {
      const filtered = filterEntries(entries, { levelFilter: 'error' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].level).toBe('error');
    });

    it('should filter by source', () => {
      const filtered = filterEntries(entries, { sourceFilter: new Set(['logger.ts:1']) });
      expect(filtered).toHaveLength(2);
      expect(filtered.every((e) => e.source === 'logger.ts:1')).toBe(true);
    });

    it('should filter by search query in message', () => {
      const filtered = filterEntries(entries, { searchQuery: 'debug' });
      expect(filtered).toHaveLength(2);
    });

    it('should filter by search query in continuation lines', () => {
      const filtered = filterEntries(entries, { searchQuery: 'stack' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].level).toBe('error');
    });

    it('should combine filters', () => {
      const filtered = filterEntries(entries, {
        levelFilter: 'debug',
        sourceFilter: new Set(['logger.ts:1']),
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].message).toBe('Another debug');
    });
  });

  describe('hasMeaningfulContinuation', () => {
    it('should return true for entries with non-empty continuation', () => {
      const entry = parseLogEntries([
        '2026-01-13T04:02:20.142Z [ERROR] [a.ts:1]: Error',
        '    at stack trace',
      ])[0];
      expect(hasMeaningfulContinuation(entry)).toBe(true);
    });

    it('should return false for entries without continuation', () => {
      const entry = parseLogEntries(['2026-01-13T04:02:20.142Z [ERROR] [a.ts:1]: Error'])[0];
      expect(hasMeaningfulContinuation(entry)).toBe(false);
    });

    it('should return false for entries with only whitespace continuation', () => {
      const entry = parseLogEntries([
        '2026-01-13T04:02:20.142Z [ERROR] [a.ts:1]: Error',
        '   ',
        '',
      ])[0];
      expect(hasMeaningfulContinuation(entry)).toBe(false);
    });
  });
});
