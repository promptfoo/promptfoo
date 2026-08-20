import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { events, formatEventDate, getEventBySlug } from '../../data/events';
import BlackHat2026 from './blackhat-2026';
import Defcon2026 from './defcon-2026';

const SITE_ROOT = path.resolve(__dirname, '../../..');

// Preserve historical dates, booth identity, and public promises as the pages become recaps.
const BLACKHAT_BOOTH = 'Booth #2967';
const DEFCON_BOOTH = 'Booth #1412';
const EVENT_REFERENCE_CASES = events.map((event) => [event.id, event] as const);
const LIVE_EVENT_INVITE =
  /\b(?:find (?:us|the team|promptfoo)|where to find us|visit (?:us|openai booth)|see promptfoo test|stop by|attending black hat|our booth (?:opens|is open)|what we're demoing|wait for the conference|register now|rsvp)\b/i;

// OpenAI was the exhibitor. Promptfoo is part of OpenAI, not a second company sharing a stand.
const BANNED_BRAND_STRINGS = [
  /with OpenAI/i,
  /OpenAI presence/i,
  /OpenAI crew/i,
  /Promptfoo x DEF CON/i,
];

describe('Vegas 2026 event data', () => {
  // Vegas event dates carry explicit Pacific offsets. Reinterpreting them in the build
  // host's timezone can shift the displayed conference dates, so the events index must
  // agree with the dates printed on each page. Generic date-helper coverage lives in
  // `site/src/data/events.test.ts`; this pins the two Vegas ranges.
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

  it.each(['blackhat-2026', 'defcon-2026'])('%s card reads as a recap', (slug) => {
    const event = getEventBySlug(slug);
    expect(event).toBeDefined();

    const copy = `${event!.description} ${event!.fullDescription ?? ''}`;
    expect(copy).not.toMatch(LIVE_EVENT_INVITE);
    expect(copy).not.toMatch(/\b(?:runs Aug|is open)\b/i);
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

  it('dates DEF CON booth demos Aug 7-9, not the full conference window', () => {
    const event = getEventBySlug('defcon-2026');
    const copy = `${event!.description} ${event!.fullDescription ?? ''}`;

    expect(copy).toMatch(/Aug(?:ust)?\.?\s*7\s*[–-]\s*9/i);
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
  it.each(EVENT_REFERENCE_CASES)('%s resolves its assets and page', (_id, event) => {
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
});

describe.each([
  {
    name: 'Black Hat USA 2026',
    Component: BlackHat2026,
    boothNumber: '2967',
    dates: /August 1\s*[–-]\s*6, 2026/,
    venue: /Mandalay Bay/,
    crossLink: /DEF CON 34/,
    boothDates: /Business Hall and booth:\s*Aug 4-6/i,
    metadataDates: 'August 4-6, 2026',
  },
  {
    name: 'DEF CON 34',
    Component: Defcon2026,
    boothNumber: '1412',
    dates: /August 6\s*[–-]\s*9, 2026/,
    venue: /West Hall/,
    crossLink: /Black Hat/,
    boothDates: /Booth #1412:\s*Aug 7-9/i,
    metadataDates: 'August 7-9, 2026',
  },
])('$name page', (page) => {
  const { Component, boothNumber, dates, venue, crossLink, boothDates, metadataDates } = page;

  it('shows the booth number, dates, and venue', () => {
    const { container } = render(<Component />);
    const text = container.textContent ?? '';

    expect(text).toMatch(new RegExp(`booth\\s*#?${boothNumber}`, 'i'));
    expect(text).toMatch(dates);
    expect(text).toMatch(venue);
  });

  it('labels the conference dates separately from the public booth dates', () => {
    const { container } = render(<Component />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/Conference:\s*August/i);
    expect(text).toMatch(boothDates);
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
    // Include alt text and aria labels. Social metadata is checked separately below.
    expect(container.innerHTML).not.toMatch(banned);
  });

  it('links to the other half of the Vegas run', () => {
    render(<Component />);
    expect(screen.getAllByText(crossLink).length).toBeGreaterThan(0);
  });

  it('marks the event as finished and removes expired booth invitations', () => {
    const { container } = render(<Component />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/past event/i);
    expect(text).toMatch(/has ended/i);
    expect(text).toMatch(/request a demo/i);
    expect(container.innerHTML).not.toMatch(LIVE_EVENT_INVITE);
    expect(screen.queryByRole('list', { name: /booth hours/i })).not.toBeInTheDocument();
  });

  it('renders consistent archival social descriptions', () => {
    render(<Component />);
    const ogDescription = document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute('content');
    const twitterDescription = document
      .querySelector('meta[name="twitter:description"]')
      ?.getAttribute('content');

    expect(ogDescription).toContain(`OpenAI booth #${boothNumber}`);
    expect(ogDescription).toContain(metadataDates);
    expect(ogDescription).not.toMatch(LIVE_EVENT_INVITE);
    expect(twitterDescription).toBe(ogDescription);
    for (const banned of BANNED_BRAND_STRINGS) {
      expect(ogDescription).not.toMatch(banned);
    }
  });

  it('does not promise appearances by other OpenAI security teams', () => {
    const { container } = render(<Component />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/also at the booth/i);
    expect(text).not.toMatch(/meet the teams behind/i);
  });

  it('keeps visitor copy direct and free of speculative event claims', () => {
    const { container } = render(<Component />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/no party this year|very tired team|skip the line|draw a line/i);
  });

  it('does not publish internal booth shifts or handoffs', () => {
    const { container } = render(<Component />);

    expect(container.textContent ?? '').not.toMatch(/\b(?:shifts?|staffing|handoffs?)\b/i);
  });

  it('preserves the old section anchor and scrolls to the recap without matchMedia', () => {
    const mediaWindow: { matchMedia: typeof window.matchMedia | undefined } = window;
    const originalMatchMedia = mediaWindow.matchMedia;
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    mediaWindow.matchMedia = undefined;

    try {
      render(<Component />);
      expect(document.getElementById('find-us')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('link', { name: /event recap/i }));

      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    } finally {
      mediaWindow.matchMedia = originalMatchMedia;
      scrollTo.mockRestore();
    }
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

  it('describes Daybreak accurately without placing Promptfoo under the initiative', () => {
    const { container } = render(<Defcon2026 />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/Daybreak brings together OpenAI's cyber-defense work/i);
    expect(text).toMatch(/Codex Security/i);
    expect(text).toMatch(/Promptfoo tests deployed agents/i);
    expect(text).not.toMatch(/three adjacent efforts|not a hierarchy|Daybreak umbrella/i);
  });
});

describe('announcement bar', () => {
  const configSource = fs.readFileSync(path.join(SITE_ROOT, 'docusaurus.config.ts'), 'utf-8');

  it('does not configure the retired Vegas announcements', () => {
    expect(configSource).not.toMatch(/vegas-2026|events-evergreen|isVegasBannerLive/);
    expect(configSource).not.toMatch(/\/events\/(?:blackhat|defcon)-2026/);
  });
});
