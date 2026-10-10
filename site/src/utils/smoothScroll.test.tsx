import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSmoothScroll } from './smoothScroll';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('event section links', () => {
  it.each([
    [false, true, 'smooth'],
    [true, true, 'auto'],
    [true, false, 'smooth'],
    [true, undefined, 'smooth'],
  ] as const)(
    'preserves the page motion policy (respect=%s, reduced=%s)',
    (respectReducedMotion, reducedMotion, behavior) => {
      const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      vi.stubGlobal('scrollY', 120);
      vi.stubGlobal('pageYOffset', 120);
      vi.stubGlobal(
        'matchMedia',
        reducedMotion === undefined ? undefined : vi.fn(() => ({ matches: reducedMotion })),
      );
      render(
        <>
          <a
            href="#event-details"
            onClick={(event) =>
              handleSmoothScroll(event, '#event-details', { respectReducedMotion })
            }
          >
            Event details
          </a>
          <section id="event-details">Registration</section>
        </>,
      );
      vi.spyOn(screen.getByText('Registration'), 'getBoundingClientRect').mockReturnValue({
        top: 320,
      } as DOMRect);
      const beforeHash = window.location.hash;
      expect(fireEvent.click(screen.getByRole('link', { name: 'Event details' }))).toBe(false);
      expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 360, behavior });
      expect(window.location.hash).toBe(beforeHash);
    },
  );

  it('cancels navigation without scrolling when the target is absent', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(
      <a href="#missing" onClick={(event) => handleSmoothScroll(event, '#missing')}>
        Missing section
      </a>,
    );
    expect(fireEvent.click(screen.getByRole('link', { name: 'Missing section' }))).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });
});
