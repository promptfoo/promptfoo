/**
 * Feature detection for CSS Scroll Timeline support
 */
export function supportsScrollTimeline(): boolean {
  // Check for both the standard API and the CSS property support
  if (typeof window === 'undefined') {
    return true; // Assume support during SSR
  }

  return (
    CSS.supports('animation-timeline: scroll()') ||
    CSS.supports('animation-timeline: --custom-timeline') ||
    // Also check for the global objects
    'ScrollTimeline' in window ||
    'ViewTimeline' in window
  );
}

/**
 * Asynchronously load the scroll-timeline polyfill if needed
 */
export async function loadScrollTimelinePolyfill(): Promise<void> {
  if (supportsScrollTimeline()) {
    console.debug('Browser supports scroll-timeline natively, skipping polyfill');
    return;
  }

  console.debug('Loading scroll-timeline polyfill...');

  try {
    // Dynamically import the polyfill only when needed
    // Vite will handle code splitting automatically
    // @ts-ignore - This is a third-party polyfill without types
    await import(
      /* @vite-ignore */
      '../polyfills/scroll-timeline.js'
    );
    console.debug('Scroll-timeline polyfill loaded successfully');
  } catch (error) {
    console.error('Failed to load scroll-timeline polyfill:', error);
  }
}

/**
 * Initialize scroll-timeline polyfill if needed
 * This should be called early in your app initialization
 */
export function initializeScrollTimelinePolyfill(): void {
  // Only load the polyfill if we're in a browser environment
  if (typeof window !== 'undefined') {
    // Load the polyfill asynchronously to avoid blocking the main thread
    loadScrollTimelinePolyfill().catch((error) => {
      console.error('Error initializing scroll-timeline polyfill:', error);
    });
  }
}
