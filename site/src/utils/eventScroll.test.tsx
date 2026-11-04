import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  scrollToEventRecap,
  scrollToEventSection,
  scrollToEventSectionWithReducedMotion,
} from './eventScroll';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ['legacy section', scrollToEventSection, 220],
  ['accessible section', scrollToEventSectionWithReducedMotion, 320],
  ['recap', scrollToEventRecap, 320],
] as const)(
  '%s cancels navigation and preserves its header offset and motion policy',
  (_name, handler, top) => {
    const scroll = vi.fn();
    vi.stubGlobal('scrollTo', scroll);
    vi.stubGlobal('pageYOffset', 200);
    vi.stubGlobal('scrollY', 300);
    render(
      <a href="#recap" onClick={(event) => handler(event, '#recap')}>
        Read recap
      </a>,
    );
    const link = screen.getByRole('link');
    expect(fireEvent.click(link)).toBe(false);
    expect(scroll).not.toHaveBeenCalled();

    const target = document.createElement('section');
    target.id = 'recap';
    document.body.appendChild(target);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 200, 80));
    try {
      for (const reducedMotion of [true, false, undefined]) {
        vi.stubGlobal(
          'matchMedia',
          reducedMotion === undefined ? undefined : vi.fn(() => ({ matches: reducedMotion })),
        );
        expect(fireEvent.click(link)).toBe(false);
        expect(scroll).toHaveBeenLastCalledWith({
          top,
          behavior: handler !== scrollToEventSection && reducedMotion ? 'auto' : 'smooth',
        });
      }
    } finally {
      target.remove();
    }
  },
);
