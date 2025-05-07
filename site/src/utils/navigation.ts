/**
 * Scrolls the window to the top (0, 0) position.
 * This is useful for internal navigation to ensure pages always start at the top.
 */
export const scrollToTop = (): void => {
  window.scrollTo(0, 0);
};
