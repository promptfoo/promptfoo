import { afterEach, describe, expect, it, vi } from 'vitest';
import { events, formatEventDate, getEventBySlug, getEventsByYear, getEventYear } from './events';

const ZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Tokyo'];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('formatEventDate', () => {
  // Regression: the single-day guard was `startDate === endDate`, comparing full ISO
  // timestamps. Every single-day event starts and ends at different times of day, so
  // it never matched and the range branch produced "Dec 3-3, 2025".
  it.each([
    ['scaleup-ai-2025', 'Dec 3, 2025'],
    ['telecom-talks-2025', 'Apr 9, 2025'],
    ['defcon-2025', 'Aug 9, 2025'],
  ])('renders the single-day event %s as a single date', (slug, expected) => {
    const event = getEventBySlug(slug);
    expect(event).toBeDefined();
    expect(event!.startDate.slice(0, 10)).toBe(event!.endDate.slice(0, 10));
    expect(formatEventDate(event!.startDate, event!.endDate)).toBe(expected);
  });

  it('never renders a degenerate same-day range', () => {
    for (const event of events) {
      expect(formatEventDate(event.startDate, event.endDate)).not.toMatch(/(\b\d{1,2})-\1,/);
    }
  });

  it('still renders genuine multi-day events as ranges', () => {
    const bh = getEventBySlug('blackhat-2026')!;
    expect(formatEventDate(bh.startDate, bh.endDate)).toBe('Aug 1-6, 2026');
  });

  it('is stable across timezones', () => {
    const render = (zone: string) => {
      vi.stubEnv('TZ', zone);
      return events.map((e) => formatEventDate(e.startDate, e.endDate));
    };
    const baseline = render(ZONES[0]);
    for (const zone of ZONES.slice(1)) {
      expect(render(zone)).toEqual(baseline);
    }
  });
});

describe('getEventYear', () => {
  // `new Date(iso).getFullYear()` reads in the host zone, so an event timestamped late
  // on Dec 31 lands in the following year on a UTC build host.
  it('reads the calendar year off the ISO string, not the host clock', () => {
    for (const zone of ZONES) {
      vi.stubEnv('TZ', zone);
      expect(getEventYear('2026-12-31T20:00:00-08:00')).toBe(2026);
      expect(getEventYear('2026-01-01T00:30:00+09:00')).toBe(2026);
    }
  });

  it('agrees with the ISO prefix for every event', () => {
    for (const event of events) {
      expect(getEventYear(event.startDate)).toBe(Number(event.startDate.slice(0, 4)));
    }
  });
});

describe('getEventsByYear', () => {
  it('buckets every event by its own start year', () => {
    const years = new Set(events.map((e) => getEventYear(e.startDate)));
    let total = 0;
    for (const year of years) {
      const bucket = getEventsByYear(year);
      total += bucket.length;
      for (const event of bucket) {
        expect(getEventYear(event.startDate)).toBe(year);
      }
    }
    expect(total).toBe(events.length);
  });

  it('returns identical buckets regardless of host timezone', () => {
    const ids = (zone: string) => {
      vi.stubEnv('TZ', zone);
      return getEventsByYear(2026).map((e) => e.id);
    };
    const baseline = ids(ZONES[0]);
    expect(baseline.length).toBeGreaterThan(0);
    for (const zone of ZONES.slice(1)) {
      expect(ids(zone)).toEqual(baseline);
    }
  });
});

describe('event copy is not stale', () => {
  // Every event in this file has already happened or is the Vegas run. Nothing should
  // read as a live invitation or advertise an offer that no longer stands.
  const LIVE_INVITE =
    /\b(meet us at|join us at|stop by|we'll be back|see you at|register now|rsvp|coming (january|february|march|april|may|june))\b/i;

  // Offers only, and only in prose. A highlight *title* like "Open Bar" is a label for
  // what the event had, which is fine on a recap — the bug was standing offers written
  // in the present tense ("Free drinks on us", "Get a complimentary assessment").
  const STANDING_OFFER = /\b(free drinks|drinks on us|get a complimentary|free scan)\b/i;

  it.each(events.map((e) => [e.id, e] as const))('%s reads as a recap, not an invite', (_id, e) => {
    if (e.status !== 'past') {
      return;
    }

    const prose = [
      e.description,
      e.fullDescription ?? '',
      ...(e.highlights ?? []).map((h) => h.description),
      ...(e.demos ?? []).flatMap((d) => [d.description, d.schedule ?? '']),
    ].join(' ');

    expect(prose).not.toMatch(LIVE_INVITE);
    expect(prose).not.toMatch(STANDING_OFFER);
  });
});
