import { describe, it, expect } from 'vitest';
import { formatDuration, formatTimestamp, getSpanStatus } from './utils';

describe('getSpanStatus', () => {
  it('returns OK for numeric code 1', () => {
    const status = getSpanStatus(1);
    expect(status.label).toBe('OK');
    expect(status.bgClass).toBe('bg-emerald-500');
  });

  it('returns OK for string "1"', () => {
    const status = getSpanStatus('1');
    expect(status.label).toBe('OK');
  });

  it('returns OK for string "ok" (case insensitive)', () => {
    expect(getSpanStatus('ok').label).toBe('OK');
    expect(getSpanStatus('OK').label).toBe('OK');
    expect(getSpanStatus('Ok').label).toBe('OK');
  });

  it('returns ERROR for numeric code 2', () => {
    const status = getSpanStatus(2);
    expect(status.label).toBe('ERROR');
    expect(status.bgClass).toBe('bg-red-500');
  });

  it('returns ERROR for string "2"', () => {
    const status = getSpanStatus('2');
    expect(status.label).toBe('ERROR');
  });

  it('returns ERROR for string "error" (case insensitive)', () => {
    expect(getSpanStatus('error').label).toBe('ERROR');
    expect(getSpanStatus('ERROR').label).toBe('ERROR');
    expect(getSpanStatus('Error').label).toBe('ERROR');
  });

  it('returns UNSET for numeric code 0', () => {
    const status = getSpanStatus(0);
    expect(status.label).toBe('UNSET');
    expect(status.bgClass).toBe('bg-primary');
  });

  it('returns UNSET for null', () => {
    expect(getSpanStatus(null).label).toBe('UNSET');
  });

  it('returns UNSET for undefined', () => {
    expect(getSpanStatus(undefined).label).toBe('UNSET');
    expect(getSpanStatus().label).toBe('UNSET');
  });

  it('returns UNSET for unknown values', () => {
    expect(getSpanStatus(99).label).toBe('UNSET');
    expect(getSpanStatus('unknown').label).toBe('UNSET');
  });
});

describe('formatDuration', () => {
  it('returns "<1ms" for sub-millisecond durations', () => {
    expect(formatDuration(0)).toBe('<1ms');
    expect(formatDuration(0.5)).toBe('<1ms');
    expect(formatDuration(0.99)).toBe('<1ms');
  });

  it('returns milliseconds for durations under 1 second', () => {
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(50)).toBe('50ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('rounds milliseconds to nearest integer', () => {
    expect(formatDuration(1.4)).toBe('1ms');
    expect(formatDuration(1.6)).toBe('2ms');
  });

  it('returns seconds with 2 decimal places for durations >= 1 second', () => {
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(12345)).toBe('12.35s');
  });
});

describe('formatTimestamp', () => {
  it('formats Unix timestamp as ISO string', () => {
    const timestamp = 1704067200000; // 2024-01-01T00:00:00.000Z
    expect(formatTimestamp(timestamp)).toBe('2024-01-01T00:00:00.000Z');
  });

  it('handles timestamps with millisecond precision', () => {
    const timestamp = 1704067200123;
    expect(formatTimestamp(timestamp)).toBe('2024-01-01T00:00:00.123Z');
  });
});
