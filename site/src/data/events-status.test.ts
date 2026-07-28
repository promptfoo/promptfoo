import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `events.ts` derives every `Event.status` at MODULE SCOPE, from a single reference
 * instant (`__SITE_BUILD_TIMESTAMP__`, falling back to `Date.now()` outside webpack — i.e.
 * here). Statuses are therefore frozen the first time the module is evaluated, so the only
 * way to exercise the rollover is to re-evaluate the module at a controlled instant:
 * `vi.setSystemTime()` + `vi.resetModules()` + a dynamic `await import('./events')`.
 *
 * This lives in its own file so the fake timers and module resets cannot leak into the
 * other suites (vitest shuffles test order).
 */

// Anchor assertions on a real entry rather than a fixture, so a regression back to a
// hardcoded `status: 'upcoming'` literal fails here.
const BSIDES_SEATTLE_2026_END = '2026-02-28T18:00:00-08:00';
const BSIDES_SEATTLE_2026_END_MS = Date.parse(BSIDES_SEATTLE_2026_END);

/** Re-imports `./events` with the system clock pinned to `instant`. */
async function loadEventsAt(instant: string | number) {
  vi.setSystemTime(typeof instant === 'string' ? Date.parse(instant) : instant);
  vi.resetModules();
  return await import('./events');
}

const ids = (list: { id: string }[]) => list.map((event) => event.id);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe('event status rollover', () => {
  it('reports an event as upcoming immediately before its end date', async () => {
    const { events, getUpcomingEvents, getPastEvents } = await loadEventsAt(
      BSIDES_SEATTLE_2026_END_MS - 1000,
    );

    const bsidesSeattle = events.find((event) => event.id === 'bsides-seattle-2026');
    expect(bsidesSeattle?.status).toBe('upcoming');
    expect(ids(getUpcomingEvents())).toContain('bsides-seattle-2026');
    expect(ids(getPastEvents())).not.toContain('bsides-seattle-2026');
  });

  it('still reports upcoming at the exact end instant (cutoff is exclusive)', async () => {
    const { events } = await loadEventsAt(BSIDES_SEATTLE_2026_END_MS);

    const bsidesSeattle = events.find((event) => event.id === 'bsides-seattle-2026');
    expect(bsidesSeattle?.status).toBe('upcoming');
  });

  it('flips to past one millisecond after the end date', async () => {
    const { events, getUpcomingEvents, getPastEvents } = await loadEventsAt(
      BSIDES_SEATTLE_2026_END_MS + 1,
    );

    const bsidesSeattle = events.find((event) => event.id === 'bsides-seattle-2026');
    expect(bsidesSeattle?.status).toBe('past');
    expect(ids(getPastEvents())).toContain('bsides-seattle-2026');
    expect(ids(getUpcomingEvents())).not.toContain('bsides-seattle-2026');
  });

  it('derives every status from the end date, not from a hardcoded literal', async () => {
    // Late enough that every currently-listed event has finished. A regression that pins
    // any entry back to `status: 'upcoming'` fails here.
    const { events, getUpcomingEvents, getFeaturedEvent } =
      await loadEventsAt('2027-01-01T00:00:00Z');

    const stillUpcoming = events.filter((event) => event.status !== 'past');
    expect(ids(stillUpcoming)).toEqual([]);
    expect(getUpcomingEvents()).toEqual([]);
    expect(getFeaturedEvent()).toBeUndefined();
  });

  // The mid-season instant sits before both Vegas events, so on its own it never exercises
  // a Black Hat / DEF CON rollover — mutating either entry to a literal tripped only the
  // 2027 sweep. The August instant falls between Black Hat's end (Aug 6) and DEF CON's
  // (Aug 9), so the two newest entries are guarded on both sides of the cutoff.
  it.each([
    ['before the 2026 season', BSIDES_SEATTLE_2026_END_MS - 1000],
    ['mid-2026 season', Date.parse('2026-07-01T00:00:00Z')],
    ['between Black Hat and DEF CON', Date.parse('2026-08-07T12:00:00-07:00')],
    ['after the Vegas run', Date.parse('2026-08-10T12:00:00-07:00')],
  ])('keeps status consistent with the end date (%s)', async (_label, instant) => {
    const { events } = await loadEventsAt(instant);

    for (const event of events) {
      expect({ id: event.id, status: event.status }).toEqual({
        id: event.id,
        status: Date.parse(event.endDate) < instant ? 'past' : 'upcoming',
      });
    }
  });
});

describe('getFeaturedEvent', () => {
  it('features the earliest upcoming event', async () => {
    const { getFeaturedEvent, getUpcomingEvents } = await loadEventsAt(
      BSIDES_SEATTLE_2026_END_MS - 1000,
    );

    expect(getFeaturedEvent()?.id).toBe('bsides-seattle-2026');
    expect(getFeaturedEvent()).toBe(getUpcomingEvents()[0]);
  });

  it('moves on to the next upcoming event once the featured one ends', async () => {
    const { getFeaturedEvent } = await loadEventsAt(BSIDES_SEATTLE_2026_END_MS + 1);

    // BSides SF 2026 (Mar 21) starts before RSA 2026 (Mar 23).
    expect(getFeaturedEvent()?.id).toBe('bsides-sf-2026');
  });

  it('never features an event whose end date has already passed', async () => {
    // The shipped bug: /events/ featured a conference that had ended months earlier.
    const now = Date.parse('2026-07-01T00:00:00Z');
    const { getFeaturedEvent } = await loadEventsAt(now);

    const featured = getFeaturedEvent();
    expect(featured?.id).toBe('blackhat-2026');
    expect(featured?.status).toBe('upcoming');
    expect(Date.parse(featured?.endDate ?? '')).toBeGreaterThanOrEqual(now);
  });
});

describe('event list ordering', () => {
  it('sorts upcoming events ascending by start date', async () => {
    const { getUpcomingEvents } = await loadEventsAt(BSIDES_SEATTLE_2026_END_MS - 1000);

    const upcoming = getUpcomingEvents();
    expect(upcoming.length).toBeGreaterThan(1);

    const starts = upcoming.map((event) => Date.parse(event.startDate));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('sorts past events descending by start date', async () => {
    const { getPastEvents } = await loadEventsAt(BSIDES_SEATTLE_2026_END_MS - 1000);

    const past = getPastEvents();
    expect(past.length).toBeGreaterThan(1);

    const starts = past.map((event) => Date.parse(event.startDate));
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
  });
});
