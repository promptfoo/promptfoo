import fs from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isVegasBannerLive, VEGAS_BANNER_EXPIRY } from '../../data/announcementBar';
import { events, formatEventDate, getEventBySlug } from '../../data/events';
import BlackHat2026 from './blackhat-2026';
import Defcon2026 from './defcon-2026';

const SITE_ROOT = path.resolve(__dirname, '../../..');

/**
 * These assertions cover *facts and promises*, not design devices. Booth numbers, dates,
 * and the OpenAI/Promptfoo relationship are the things that send a real person walking
 * across a convention centre or that misstate a corporate relationship, so they get
 * asserted. Headings, section names, and ASCII art are free to change without a test
 * edit.
 */
const BLACKHAT_BOOTH = 'Booth #2967';
const DEFCON_BOOTH = 'Booth #1412';

/**
 * Promptfoo is part of OpenAI and demos at OpenAI's booth — OpenAI is the exhibitor of
 * record in the Black Hat directory. Every one of these framings inverts or muddies that
 * hierarchy, so none of them may appear in rendered copy, `<Head>` metadata, alt text, or
 * aria labels. (`@docusaurus/Head` is stubbed as a fragment in `vitest.config.ts`, so its
 * children land in the container and `innerHTML` sees meta/alt/aria values too.)
 */
const BANNED_BRAND_STRINGS = [
  /with OpenAI/i,
  /OpenAI presence/i,
  /OpenAI crew/i,
  /Promptfoo x DEF CON/i,
];

describe('Vegas 2026 event data', () => {
  // The 2026 entries all end at 18:00 PDT, which is past midnight UTC. Reading that back
  // through `new Date(...).getDate()` on a UTC build host rendered the end date a day
  // late, so the events index disagreed with every string on the event page itself.
  // (Generic date-helper coverage lives in `src/data/events.test.ts`; this only pins the
  // two Vegas ranges, which are the ones printed on the pages below.)
  const zones = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Tokyo'];

  // vi.stubEnv/unstubAllEnvs rather than assigning process.env.TZ directly: it is the
  // pattern the repo's Biome plugin enforces, and it restores an originally unset TZ by
  // deleting it. (`process.env.TZ = undefined` would store the literal string "undefined",
  // which resolves to UTC — and vitest shuffles test order, so that would leak into the
  // render assertions below.)
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  // Sweeps every event, not just the two Vegas ones: the helper is shared, and a
  // regression in it would surface on the index page for any entry whose end time
  // crosses midnight UTC.
  it('does not shift any event date across timezones', () => {
    const renderAll = (zone: string) => {
      vi.stubEnv('TZ', zone);
      return events.map((e) => formatEventDate(e.startDate, e.endDate));
    };

    const baseline = renderAll(zones[0]);
    for (const zone of zones.slice(1)) {
      expect(renderAll(zone)).toEqual(baseline);
    }
  });

  it('carries the confirmed booth numbers for the Vegas run', () => {
    expect(getEventBySlug('blackhat-2026')?.booth).toBe(BLACKHAT_BOOTH);
    expect(getEventBySlug('defcon-2026')?.booth).toBe(DEFCON_BOOTH);
  });

  it.each(['blackhat-2026', 'defcon-2026'])('%s card copy names the OpenAI booth', (slug) => {
    const event = getEventBySlug(slug);
    expect(event).toBeDefined();

    const copy = `${event!.description} ${event!.fullDescription ?? ''}`;
    expect(copy).toMatch(/OpenAI booth/);
    for (const banned of BANNED_BRAND_STRINGS) {
      expect(copy).not.toMatch(banned);
    }
  });

  // The Business Hall runs Tue Aug 4 – Thu Aug 6 (Welcome Reception Tue 4-7pm). The card
  // used to say "Aug 5-6", which are the Briefings dates, and would have sent people to a
  // closed hall on the busiest day.
  it('dates the Black Hat Business Hall Aug 4-6, not the Briefings window', () => {
    const event = getEventBySlug('blackhat-2026');
    const copy = `${event!.description} ${event!.fullDescription ?? ''}`;

    expect(copy).toMatch(/Aug(?:ust)?\.?\s*4\s*[–-]\s*6/i);
    expect(copy).not.toMatch(/Aug(?:ust)?\.?\s*5\s*[–-]\s*6/i);
  });

  // `Event.highlights` is rendered by nothing in src/components or src/pages/events —
  // every event page hardcodes its own highlight markup. Carrying the field on the two
  // newest entries created a copy surface that could drift from the live pages without
  // anyone noticing, so the Vegas entries deliberately omit it. (The older entries still
  // carry theirs; removing those is a separate cleanup.)
  it.each(['blackhat-2026', 'defcon-2026'])('%s carries no unrendered highlights', (slug) => {
    expect(getEventBySlug(slug)?.highlights).toBeUndefined();
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

describe('events data references resolve', () => {
  // A dead cardImage path renders a broken tile on /events/ and a 404 og:image on share —
  // EventCard only falls back to its placeholder when the field is absent, and the
  // Docusaurus build does not validate static asset paths.
  it.each(events.map((e) => [e.id, e] as const))(
    '%s resolves its assets and page',
    (_id, event) => {
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
    },
  );
});

describe.each([
  {
    name: 'Black Hat USA 2026',
    Component: BlackHat2026,
    boothNumber: '2967',
    dates: /August 1\s*[–-]\s*6, 2026/,
    venue: /Mandalay Bay/,
    crossLink: /DEF CON 34/,
  },
  {
    name: 'DEF CON 34',
    Component: Defcon2026,
    boothNumber: '1412',
    dates: /August 6\s*[–-]\s*9, 2026/,
    venue: /West Hall/,
    crossLink: /Black Hat/,
  },
])('$name page', ({ Component, boothNumber, dates, venue, crossLink }) => {
  it('shows the booth number, dates, and venue', () => {
    const { container } = render(<Component />);
    const text = container.textContent ?? '';

    expect(text).toMatch(new RegExp(`booth\\s*#?${boothNumber}`, 'i'));
    expect(text).toMatch(dates);
    expect(text).toMatch(venue);
  });

  // The exhibitor of record is OpenAI. The pages must say whose booth it is, and must say
  // what Promptfoo's relationship to OpenAI actually is, rather than implying two
  // companies sharing a stand.
  it('identifies the booth as an OpenAI booth', () => {
    const { container } = render(<Component />);
    expect(container.textContent ?? '').toMatch(/OpenAI booth/);
  });

  it('states that Promptfoo is part of OpenAI', () => {
    const { container } = render(<Component />);
    expect(container.textContent ?? '').toMatch(/Promptfoo is part of OpenAI/);
  });

  it.each(BANNED_BRAND_STRINGS)('never says %s', (banned) => {
    const { container } = render(<Component />);
    // innerHTML rather than textContent so meta descriptions, alt text, and aria labels
    // are covered too.
    expect(container.innerHTML).not.toMatch(banned);
  });

  it('links to the other half of the Vegas run', () => {
    render(<Component />);
    expect(screen.getAllByText(crossLink).length).toBeGreaterThan(0);
  });

  it('has exactly one h1', () => {
    const { container } = render(<Component />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  // There is no Promptfoo party in 2026. The pages are allowed to mention the 2025 one in
  // prose, so this asserts the absence of an actual invitation, not of the words. The
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

describe('Black Hat USA 2026 page specifics', () => {
  // Business Hall: Tue Aug 4 – Thu Aug 6, with the Welcome Reception on Tue Aug 4.
  // "Aug 5-6" is the Briefings window and was the wrong hall date.
  it('dates the Business Hall Aug 4-6', () => {
    const { container } = render(<BlackHat2026 />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/Business Hall/);
    expect(text).toMatch(/Aug(?:ust)?\.?\s*4\s*(?:[–-]|through(?:\s+\w+)?)\s*(?:August\s*)?6/i);
    expect(text).not.toMatch(/Business Hall,?\s*Aug(?:ust)?\.?\s*5\s*[–-]\s*6/i);
  });
});

describe('DEF CON 34 page specifics', () => {
  it('leans on the official "Agency" theme', () => {
    const { container } = render(<Defcon2026 />);
    expect(container.textContent ?? '').toMatch(/Agency/);
  });

  // The booth demo is the pitch, and the way to keep using it afterwards is the open
  // source project. `@docusaurus/Link` is stubbed as a fragment in vitest.config.ts, so a
  // `to=` target never reaches the DOM — hence the label fallback alongside the href
  // check for raw anchors.
  it('offers a route into the open-source project', () => {
    const { container } = render(<Defcon2026 />);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');

    const linkedCta = hrefs.some((href) => /github\.com|^\/docs\//.test(href));
    const labelledCta = /github|red team docs/i.test(container.textContent ?? '');

    expect(linkedCta || labelledCta).toBe(true);
  });

  // Daybreak is OpenAI's cyber defense initiative, not a parent product line that
  // Promptfoo sits under. No public source establishes that hierarchy.
  it('does not present Daybreak as an umbrella over Promptfoo', () => {
    const { container } = render(<Defcon2026 />);
    expect(container.innerHTML).not.toMatch(/umbrella/i);
  });
});

describe('announcement bar', () => {
  // The banner is the highest-traffic copy surface on the site and it is plain config, so
  // the brand-hierarchy rules are checked against the file itself.
  const configSource = fs.readFileSync(path.join(SITE_ROOT, 'docusaurus.config.ts'), 'utf-8');

  it.each(BANNED_BRAND_STRINGS)('never says %s', (banned) => {
    expect(configSource).not.toMatch(banned);
  });

  // Aug 1-9 spans both conference windows and implies a continuous booth presence across
  // a week we do not staff continuously.
  it('does not advertise a continuous Aug 1-9 presence', () => {
    expect(configSource).not.toMatch(/Aug(?:ust)?\.?\s*1\s*[–-]\s*9/i);
  });

  // The expiry date itself no longer lives in the config: `src/data/announcementBar.ts`
  // owns it, so the Node-side build decision and the client-side `src/theme/AnnouncementBar`
  // wrapper (which retires the bar on the visitor's clock, since nothing rebuilds this site
  // on a schedule) cannot drift apart. Assert the config still consults it, and that the
  // date it consults actually clears both conference windows.
  it('is closeable and expires after the conferences', () => {
    expect(configSource).toMatch(/isCloseable:\s*true/);
    expect(configSource).toMatch(/isVegasBannerLive\(/);

    const defcon = getEventBySlug('defcon-2026');
    expect(defcon).toBeDefined();
    expect(Date.parse(defcon?.endDate ?? '')).toBeLessThan(VEGAS_BANNER_EXPIRY);

    expect(isVegasBannerLive(VEGAS_BANNER_EXPIRY - 1)).toBe(true);
    expect(isVegasBannerLive(VEGAS_BANNER_EXPIRY)).toBe(false);
  });
});
