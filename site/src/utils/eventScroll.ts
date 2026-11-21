import type React from 'react';

const createEventScrollHandler =
  (getScrollOffset: () => number, getBehavior: () => ScrollBehavior) =>
  (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.querySelector(targetId);
    if (!element) {
      return;
    }
    const offset = 80; // Offset for fixed header
    const offsetPosition = element.getBoundingClientRect().top + getScrollOffset() - offset;
    // CSS scroll-behavior does not govern an explicit JS behavior, so choose it here.
    const behavior = getBehavior();
    window.scrollTo({ top: offsetPosition, behavior });
  };

export const scrollToEventSection = createEventScrollHandler(
  () => window.pageYOffset,
  () => 'smooth',
);

export const scrollToEventSectionWithReducedMotion = createEventScrollHandler(
  () => window.scrollY,
  () =>
    (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false) ? 'auto' : 'smooth',
);

export const scrollToEventRecap = createEventScrollHandler(
  () => window.scrollY,
  () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'),
);
