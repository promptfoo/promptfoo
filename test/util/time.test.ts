import { describe, expect, it } from 'vitest';
import { normalizeTimestamp } from '../../src/util/time';

describe('normalizeTimestamp', () => {
  it('should return numeric timestamps unchanged', () => {
    const timestamp = 1703671976000;
    expect(normalizeTimestamp(timestamp)).toBe(timestamp);
  });

  it('should convert SQLite CURRENT_TIMESTAMP format to epoch ms', () => {
    // SQLite CURRENT_TIMESTAMP returns UTC strings like "2024-12-27 12:52:56"
    const sqliteTimestamp = '2024-12-27 12:52:56';
    const result = normalizeTimestamp(sqliteTimestamp);

    // Should parse as UTC (appending 'Z')
    const expected = new Date('2024-12-27T12:52:56Z').getTime();
    expect(result).toBe(expected);
  });

  it('should handle timestamps that already have Z suffix', () => {
    const timestamp = '2024-12-27T12:52:56Z';
    const result = normalizeTimestamp(timestamp);

    const expected = new Date('2024-12-27T12:52:56Z').getTime();
    expect(result).toBe(expected);
  });

  it('should handle ISO format strings', () => {
    const timestamp = '2024-12-27T12:52:56.000Z';
    const result = normalizeTimestamp(timestamp);

    const expected = new Date('2024-12-27T12:52:56.000Z').getTime();
    expect(result).toBe(expected);
  });

  it('should throw error for invalid date strings', () => {
    expect(() => normalizeTimestamp('invalid-date')).toThrow('Invalid timestamp format: "invalid-date"');
    expect(() => normalizeTimestamp('not a date')).toThrow('Invalid timestamp format');
  });
});
