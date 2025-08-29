import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface UseScrollResetOptions {
  /** Routes that should trigger scroll reset */
  resetOnRoutes?: string[];
  /** Whether to use a delay before scrolling */
  useDelay?: boolean;
  /** Delay in milliseconds (default: 100) */
  delayMs?: number;
}

/**
 * Custom hook to reset scroll position on route changes
 */
export function useScrollReset(options: UseScrollResetOptions = {}) {
  const location = useLocation();
  const { resetOnRoutes, useDelay = false, delayMs = 100 } = options;

  useEffect(() => {
    // If resetOnRoutes is specified, only reset on those routes
    if (resetOnRoutes && !resetOnRoutes.includes(location.pathname)) {
      return;
    }

    const scrollToTop = () => {
      window.scrollTo(0, 0);
    };

    if (useDelay) {
      // Use a small delay to ensure DOM is updated
      const timeoutId = setTimeout(scrollToTop, delayMs);
      return () => clearTimeout(timeoutId);
    } else {
      scrollToTop();
    }
  }, [location.pathname, resetOnRoutes, useDelay, delayMs]);
}

/**
 * Pre-configured hook for edit-and-rerun scroll reset
 */
export function useEditAndRerunScrollReset() {
  return useScrollReset({
    resetOnRoutes: ['/setup'],
    useDelay: true,
    delayMs: 150,
  });
}
