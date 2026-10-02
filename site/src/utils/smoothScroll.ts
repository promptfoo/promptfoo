import type React from 'react';

export function handleSmoothScroll(
  event: React.MouseEvent<HTMLAnchorElement>,
  targetId: string,
  { respectReducedMotion = false }: { respectReducedMotion?: boolean } = {},
) {
  event.preventDefault();
  const element = document.querySelector(targetId);
  if (!element) {
    return;
  }
  const offset = 80;
  const top = element.getBoundingClientRect().top + window.scrollY - offset;
  const prefersReducedMotion =
    respectReducedMotion &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);
  window.scrollTo({ top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
}
