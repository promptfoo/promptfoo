import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook to automatically reset scroll position when navigating to specific routes
 * This prevents layout issues when moving between different page structures
 */
export function useScrollReset(options?: {
  /**
   * Routes that should trigger a scroll reset
   * If not provided, resets on all route changes
   */
  resetOnRoutes?: string[];

  /**
   * Whether to reset scroll position immediately or with a slight delay
   * Delay can help with complex layouts that need time to render
   */
  useDelay?: boolean;

  /**
   * Custom delay in milliseconds (default: 100ms)
   */
  delayMs?: number;
}) {
  const location = useLocation();
  const { resetOnRoutes, useDelay = true, delayMs = 100 } = options || {};

  useEffect(() => {
    // Check if we should reset scroll for this route
    const shouldReset = !resetOnRoutes || resetOnRoutes.includes(location.pathname);

    if (!shouldReset) {
      return;
    }

    const resetScroll = () => {
      // Reset main window scroll
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });

      // Reset any other scroll containers that might be present
      const scrollContainers = document.querySelectorAll('[data-scroll-container]');
      scrollContainers.forEach((container) => {
        if (container.scrollTo) {
          container.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        }
      });

      // Reset results table container specifically if it exists
      const resultsTableContainer = document.getElementById('results-table-container');
      if (resultsTableContainer) {
        resultsTableContainer.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      }
    };

    if (useDelay) {
      // Use a small delay to allow the new page to render before resetting scroll
      const timeoutId = setTimeout(resetScroll, delayMs);
      return () => clearTimeout(timeoutId);
    } else {
      resetScroll();
    }
  }, [location.pathname, resetOnRoutes, useDelay, delayMs]);
}

/**
 * Hook specifically for edit and re-run navigation
 * Resets scroll when navigating from results to setup page
 */
export function useEditAndRerunScrollReset() {
  return useScrollReset({
    resetOnRoutes: ['/setup'],
    useDelay: true,
    delayMs: 150, // Slightly longer delay for setup page complexity
  });
}

/**
 * Utility function to mark scroll containers for automatic reset
 * Add data-scroll-container attribute to containers that should be reset
 */
export function markAsScrollContainer(element: HTMLElement | null) {
  if (element) {
    element.setAttribute('data-scroll-container', 'true');
  }
}
