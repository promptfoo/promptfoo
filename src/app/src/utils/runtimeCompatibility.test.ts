import { describe, expect, it } from 'vitest';
import {
  getRuntimeNoticeReminderIntervalDays,
  hasRuntimeSupportEnded,
  parseUtcMidnight,
} from './runtimeCompatibility';

describe('runtimeCompatibility', () => {
  it('parses only canonical calendar dates at UTC midnight', () => {
    expect(parseUtcMidnight('2026-07-30')).toBe(Date.parse('2026-07-30T00:00:00.000Z'));
    expect(parseUtcMidnight('2026-02-29')).toBeNull();
    expect(parseUtcMidnight('2026-02-30')).toBeNull();
    expect(parseUtcMidnight('2026-07-30junk')).toBeNull();
    expect(parseUtcMidnight('07/30/2026')).toBeNull();
  });

  it('uses a timezone-independent UTC cutoff', () => {
    expect(hasRuntimeSupportEnded('2026-07-30', Date.parse('2026-07-29T23:59:59.999Z'))).toBe(
      false,
    );
    expect(hasRuntimeSupportEnded('2026-07-30', Date.parse('2026-07-30T00:00:00.000Z'))).toBe(true);
    expect(hasRuntimeSupportEnded('2026-02-30', Date.parse('2026-03-01T00:00:00.000Z'))).toBe(
      false,
    );
  });

  it('switches from weekly to daily reminders exactly 14 days before cutoff', () => {
    expect(
      getRuntimeNoticeReminderIntervalDays('2026-07-30', Date.parse('2026-07-15T23:59:59.999Z')),
    ).toBe(7);
    expect(
      getRuntimeNoticeReminderIntervalDays('2026-07-30', Date.parse('2026-07-16T00:00:00.000Z')),
    ).toBe(1);
    expect(
      getRuntimeNoticeReminderIntervalDays('invalid', Date.parse('2026-07-16T00:00:00.000Z')),
    ).toBe(7);
  });
});
