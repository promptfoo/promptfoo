import fs from 'node:fs';
import path from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { events, formatEventDate, getEventBySlug } from '../../data/events';
import BlackHat2026 from './blackhat-2026';
import Defcon2026 from './defcon-2026';

const SITE_ROOT = path.resolve(__dirname, '../../..');

/**
 * Booth numbers and dates are the two things on these pages that send a real
 * person walking across a convention centre, so they get asserted rather than
 * eyeballed.
 */
const BLACKHAT_BOOTH = 'Booth #2967';
const DEFCON_BOOTH = 'Booth #1412';

describe('formatEventDate is timezone-stable', () => {
  // vi.stubEnv/unstubAllEnvs rather than assigning process.env.TZ directly: it is
  // the pattern the repo's Biome plugin enforces, and it restores an originally
  // unset TZ by deleting it. (`process.env.TZ = undefined` would store the literal
  // string "undefined", which resolves to UTC — and vitest shuffles test order, so
  // that would leak into the render assertions below.)
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The 2026 entries all end at 18:00 PDT, which is past midnight UTC. Reading
  // that back through `new Date(...).getDate()` on a UTC build host rendered the
  // end date a day late, so the events index disagreed with every string on the
  // event page itself.
  const zones = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Tokyo'];

  it.each([
    ['blackhat-2026', 'Aug 1-6, 2026'],
    ['defcon-2026', 'Aug 6-9, 2026'],
  ])('renders %s as "%s" in every timezone', (slug, expected) => {
    const event = getEventBySlug(slug);
    expect(event).toBeDefined();

    for (const zone of zones) {
      vi.stubEnv('TZ', zone);
      expect(formatEventDate(event!.startDate, event!.endDate)).toBe(expected);
    }
  });

  it('does not shift any event date across timezones', () => {
    const render = (zone: string) => {
      vi.stubEnv('TZ', zone);
      return events.map((e) => formatEventDate(e.startDate, e.endDate));
    };

    const baseline = render('UTC');
    for (const zone of zones.slice(1)) {
      expect(render(zone)).toEqual(baseline);
    }
  });
});

describe('events data references resolve', () => {
  // A dead cardImage path renders a broken tile on /events/ and a 404 og:image
  // on share — EventCard only falls back to its placeholder when the field is
  // absent, and the Docusaurus build does not validate static asset paths.
  it.each(
    events.map((e) => [e.id, e] as const),
  )('%s resolves its assets and page', (_id, event) => {
    for (const key of ['cardImage', 'heroImage'] as const) {
      const assetPath = event[key];
      if (assetPath) {
        expect(
          fs.existsSync(path.join(SITE_ROOT, 'static', assetPath)),
          `${event.id}.${key} points at ${assetPath}, which does not exist in site/static`,
        ).toBe(true);
      }
    }

    if (event.customPageUrl) {
      const pagePath = path.join(SITE_ROOT, 'src/pages', `${event.customPageUrl}.tsx`);
      expect(
        fs.existsSync(pagePath),
        `${event.id}.customPageUrl points at ${event.customPageUrl}, which has no page component`,
      ).toBe(true);
    }
  });

  it('carries the confirmed booth numbers for the Vegas run', () => {
    expect(getEventBySlug('blackhat-2026')?.booth).toBe(BLACKHAT_BOOTH);
    expect(getEventBySlug('defcon-2026')?.booth).toBe(DEFCON_BOOTH);
  });

  it('keeps the DEF CON 33 party entry distinct from the 2026 conference entry', () => {
    expect(getEventBySlug('defcon-2025')?.type).toBe('party');
    expect(getEventBySlug('defcon-2025')?.registrationUrl).toBeDefined();

    // No party in 2026, so neither Vegas entry carries an invite link.
    for (const slug of ['blackhat-2026', 'defcon-2026']) {
      expect(getEventBySlug(slug)?.type).toBe('conference');
      expect(getEventBySlug(slug)?.registrationUrl).toBeUndefined();
    }
  });
});

describe.each([
  {
    name: 'Black Hat USA 2026',
    Component: BlackHat2026,
    booth: BLACKHAT_BOOTH,
    dates: 'August 1-6, 2026',
    venue: /Mandalay Bay/,
    crossLink: /DEF CON 34/,
  },
  {
    name: 'DEF CON 34',
    Component: Defcon2026,
    booth: DEFCON_BOOTH,
    dates: 'August 6-9, 2026',
    venue: /West Hall/,
    crossLink: /Black Hat/,
  },
])('$name page', ({ Component, booth, dates, venue, crossLink }) => {
  it('shows the booth number, dates, and venue', () => {
    render(<Component />);
    expect(screen.getAllByText(booth).length).toBeGreaterThan(0);
    expect(screen.getByText(dates)).toBeInTheDocument();
    expect(screen.getAllByText(venue).length).toBeGreaterThan(0);
  });

  it('says we are there with OpenAI', () => {
    const { container } = render(<Component />);
    expect(container.textContent).toMatch(/OpenAI/);
  });

  it('links to the other half of the Vegas run', () => {
    render(<Component />);
    expect(screen.getAllByText(crossLink).length).toBeGreaterThan(0);
  });

  it('has exactly one h1', () => {
    const { container } = render(<Component />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  // There is no Promptfoo party in 2026. The DEF CON page is allowed to mention
  // the 2025 one, and to say outright that there is "no RSVP link" this year —
  // so this asserts the absence of an actual invitation, not of the words. The
  // affordance check is the load-bearing half: prose can negate, a button cannot.
  it('offers no party affordance', () => {
    const { container } = render(<Component />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/open bar/i);
    expect(text).not.toMatch(/free drinks/i);
    expect(text).not.toMatch(/lu\.ma/i);

    const invites = [...container.querySelectorAll('a, button')].filter((el) =>
      /rsvp|party|claim your spot|save your seat/i.test(el.textContent ?? ''),
    );
    expect(invites.map((el) => el.textContent)).toEqual([]);
  });

  it('does not claim a talk, Arsenal slot, or giveaway', () => {
    const { container } = render(<Component />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/arsenal/i);
    expect(text).not.toMatch(/keynote/i);
    expect(text).not.toMatch(/giveaway/i);
  });
});

describe('DEF CON 34 page specifics', () => {
  it('leans on the official "Agency" theme', () => {
    const { container } = render(<Defcon2026 />);
    expect(container.textContent).toMatch(/Agency/);
    // The `man agency` panel is the section that earns the theme tie-in.
    expect(screen.getByText(/man agency/)).toBeInTheDocument();
  });

  it('states plainly that there is no party this year', () => {
    render(<Defcon2026 />);
    expect(screen.getByText(/No party this year/i)).toBeInTheDocument();
  });

  it('renders the redteam transcript as real text, not an image', () => {
    const { container } = render(<Defcon2026 />);
    const terminal = container.querySelector('pre');
    expect(terminal).toBeTruthy();
    expect(within(terminal as HTMLElement).getByText(/promptfoo redteam run/)).toBeInTheDocument();
  });
});
