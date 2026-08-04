import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EVERGREEN_ANNOUNCEMENT_BAR_ID,
  VEGAS_ANNOUNCEMENT_BAR_ID,
  VEGAS_BANNER_EXPIRY,
} from '../../data/announcementBar';
import AnnouncementBar from './index';

/**
 * `useThemeConfig` normally reads `themeConfig.announcementBar` out of the built site
 * config. Here it is a knob, because the whole point of the wrapper is to behave
 * differently for the time-limited bar than for the evergreen one.
 */
const themeConfig = vi.hoisted(() => ({
  current: { announcementBar: undefined } as {
    announcementBar?: { id: string };
  },
}));

vi.mock('@docusaurus/theme-common', () => ({
  useThemeConfig: () => themeConfig.current,
}));

const ORIGINAL_BAR_TEST_ID = 'original-announcement-bar';

vi.mock('@theme-original/AnnouncementBar', () => ({
  default: () => <div data-testid={ORIGINAL_BAR_TEST_ID}>Meet Promptfoo in Vegas</div>,
}));

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

describe('AnnouncementBar expiry wrapper', () => {
  beforeEach(() => {
    themeConfig.current = { announcementBar: { id: VEGAS_ANNOUNCEMENT_BAR_ID } };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the original bar before the expiry', () => {
    vi.setSystemTime(VEGAS_BANNER_EXPIRY - ONE_DAY_MS);

    render(<AnnouncementBar />);

    expect(screen.getByTestId(ORIGINAL_BAR_TEST_ID)).toBeInTheDocument();
  });

  it('renders nothing once the expiry has passed', () => {
    vi.setSystemTime(VEGAS_BANNER_EXPIRY);

    const { container } = render(<AnnouncementBar />);

    expect(screen.queryByTestId(ORIGINAL_BAR_TEST_ID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves the evergreen bar alone forever', () => {
    themeConfig.current = { announcementBar: { id: EVERGREEN_ANNOUNCEMENT_BAR_ID } };
    vi.setSystemTime(VEGAS_BANNER_EXPIRY + 365 * ONE_DAY_MS);

    render(<AnnouncementBar />);

    expect(screen.getByTestId(ORIGINAL_BAR_TEST_ID)).toBeInTheDocument();
  });

  /**
   * The regression this whole component is one `useEffect` away from causing: the build
   * host cannot know what time it is in the visitor's browser, so if the clock were read
   * during render the client's first render would disagree with the prerendered HTML and
   * React would throw the server markup away (and log a mismatch).
   *
   * Asserted the only way that is actually convincing, by replaying the exact production
   * scenario across two clocks: prerender with `renderToString` *before* the expiry, move
   * the clock *past* it (the visitor arriving at a stale deploy), hydrate that same markup,
   * and require React to stay quiet.
   */
  it('hydrates the prerendered bar without a mismatch, then hides it', async () => {
    // The build host, on the day the deploy was cut.
    vi.setSystemTime(VEGAS_BANNER_EXPIRY - ONE_DAY_MS);
    const serverHtml = renderToString(<AnnouncementBar />);
    expect(serverHtml).toContain(ORIGINAL_BAR_TEST_ID);

    // The visitor, after the conferences ended and with no redeploy in between.
    vi.setSystemTime(VEGAS_BANNER_EXPIRY + ONE_DAY_MS);

    // The render pass is clock-independent, which is precisely what makes hydration safe:
    // the client's first pass is byte-identical to what the build host prerendered, even
    // though the two ran on opposite sides of the expiry. Reading `Date.now()` during
    // render instead of in an effect breaks this line and nothing else.
    expect(renderToString(<AnnouncementBar />)).toBe(serverHtml);

    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <AnnouncementBar />);
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector(`[data-testid="${ORIGINAL_BAR_TEST_ID}"]`)).toBeNull();

    await act(async () => {
      root?.unmount();
    });
    container.remove();
    consoleError.mockRestore();
  });

  it('retires the bar in place in a tab left open across the expiry', () => {
    vi.setSystemTime(VEGAS_BANNER_EXPIRY - 5000);

    render(<AnnouncementBar />);
    expect(screen.getByTestId(ORIGINAL_BAR_TEST_ID)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByTestId(ORIGINAL_BAR_TEST_ID)).not.toBeInTheDocument();
  });

  it('retires the bar after an expiry beyond the maximum timeout delay', () => {
    const remainingAfterFirstTimeout = 5000;
    vi.setSystemTime(VEGAS_BANNER_EXPIRY - MAX_TIMEOUT_MS - remainingAfterFirstTimeout);

    render(<AnnouncementBar />);
    expect(screen.getByTestId(ORIGINAL_BAR_TEST_ID)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(MAX_TIMEOUT_MS);
    });
    expect(screen.getByTestId(ORIGINAL_BAR_TEST_ID)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(remainingAfterFirstTimeout);
    });

    expect(screen.queryByTestId(ORIGINAL_BAR_TEST_ID)).not.toBeInTheDocument();
  });
});
