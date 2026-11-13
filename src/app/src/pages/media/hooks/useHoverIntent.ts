import { useCallback, useEffect, useRef, useState } from 'react';

/** Start a video preview after a deliberate hover or a shorter keyboard focus. */
export function useHoverIntent() {
  const [isIntentional, setIsIntentional] = useState(false);
  const pending = useRef<{ timer: number; deadline: number } | null>(null);
  const enabled =
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cancelPending = useCallback(() => {
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  function schedule(delay: number) {
    if (!enabled) {
      return;
    }

    // Hover and focus can overlap. Keep whichever activates the preview first.
    const deadline = performance.now() + delay;
    if (pending.current && pending.current.deadline <= deadline) {
      return;
    }
    cancelPending();
    const timer = window.setTimeout(() => {
      pending.current = null;
      // The browser global can disappear while a test tears down its window.
      if (typeof window !== 'undefined') {
        setIsIntentional(true);
      }
    }, delay);
    pending.current = { timer, deadline };
  }

  function stop() {
    cancelPending();
    setIsIntentional(false);
  }

  return {
    isIntentional: enabled && isIntentional,
    hoverProps: {
      onMouseEnter: () => schedule(300),
      onMouseLeave: stop,
      onFocus: () => schedule(150),
      onBlur: stop,
    },
  };
}
