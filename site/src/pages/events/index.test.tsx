import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BLACK_HAT_CLOSE = Date.parse('2026-08-06T16:00:00-07:00');
const DEF_CON_CLOSE = Date.parse('2026-08-09T16:00:00-07:00');

async function loadEventsPageAt(instant: number) {
  vi.setSystemTime(instant);
  vi.resetModules();

  const { default: EventsPage } = await import('./index');

  return EventsPage;
}

function getUpcomingFilterButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Upcoming\s*\d+$/i });
}

function getUpcomingCount(): number {
  const match = getUpcomingFilterButton().textContent?.match(/(\d+)\s*$/);

  if (!match) {
    throw new Error('Upcoming filter does not contain an event count');
  }

  return Number(match[1]);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe('event index live status', () => {
  it('moves Black Hat into past events and features DEF CON when the booth closes', async () => {
    const EventsPage = await loadEventsPageAt(BLACK_HAT_CLOSE - 1000);
    render(<EventsPage />);

    const initialUpcomingCount = getUpcomingCount();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Promptfoo at Black Hat USA 2026' }),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1001);
    });

    expect(getUpcomingCount()).toBe(initialUpcomingCount - 1);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Promptfoo at DEF CON 34' }),
    ).toBeInTheDocument();

    fireEvent.click(getUpcomingFilterButton());

    expect(screen.queryByRole('heading', { name: 'Black Hat 2026' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'DEF CON 34' })).toBeInTheDocument();
  });

  it('removes DEF CON from upcoming events when the final booth closes', async () => {
    const EventsPage = await loadEventsPageAt(DEF_CON_CLOSE - 1000);
    render(<EventsPage />);

    const initialUpcomingCount = getUpcomingCount();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Promptfoo at DEF CON 34' }),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1001);
    });

    expect(getUpcomingCount()).toBe(initialUpcomingCount - 1);
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Promptfoo at DEF CON 34' }),
    ).not.toBeInTheDocument();

    fireEvent.click(getUpcomingFilterButton());

    expect(screen.queryByRole('heading', { name: 'DEF CON 34' })).not.toBeInTheDocument();
  });

  it('hydrates stale event markup without a mismatch and then refreshes event status', async () => {
    const EventsPage = await loadEventsPageAt(BLACK_HAT_CLOSE - 1000);
    const serverHtml = renderToString(<EventsPage />);
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    vi.setSystemTime(BLACK_HAT_CLOSE + 1);

    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(container, <EventsPage />, {
          onRecoverableError: (error) => errors.push(error),
        });
      });

      expect(errors).toEqual([]);
      expect(
        screen.getByRole('heading', { level: 2, name: 'Promptfoo at DEF CON 34' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { level: 2, name: 'Promptfoo at Black Hat USA 2026' }),
      ).not.toBeInTheDocument();
    } finally {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
  });
});
