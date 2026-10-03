import { useCallback, useEffect, useRef, useState } from 'react';

interface UseHoverIntentOptions {
  /** Delay in milliseconds before hover is considered intentional */
  delay?: number;
  /** Whether to respect prefers-reduced-motion media query */
  respectReducedMotion?: boolean;
  /** Whether hover preview is enabled (for desktop detection) */
  enabled?: boolean;
}

interface UseHoverIntentResult {
  /** Whether the element is currently being hovered */
  isHovering: boolean;
  /** Whether the hover is intentional (after delay) */
  isIntentional: boolean;
  /** Props to spread on the target element */
  hoverProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
}

/**
 * Hook for detecting intentional hover with configurable delay.
 * Useful for triggering actions only when user deliberately hovers.
 *
 * Features:
 * - Configurable delay before hover is considered "intentional"
 * - Respects prefers-reduced-motion preference
 * - Only activates on hover-capable devices
 * - Supports keyboard focus for accessibility
 */
export function useHoverIntent({
  delay = 300,
  respectReducedMotion = true,
  enabled = true,
}: UseHoverIntentOptions = {}): UseHoverIntentResult {
  const [isHovering, setIsHovering] = useState(false);
  const [isIntentional, setIsIntentional] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  // Check device capabilities and user preferences
  const isEffectivelyEnabled =
    enabled &&
    /**
     * Detects whether the user has a hover-capable device.
     * Returns false for touch-only devices.
     */
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover)').matches &&
    !(
      respectReducedMotion &&
      /**
       * Checks if the user prefers reduced motion.
       */
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

  const markIntentional = useCallback(() => {
    timeoutRef.current = undefined;

    // Test environments can tear down jsdom between scheduling and execution.
    // Avoid dispatching a React update once the browser global is already gone.
    if (typeof window === 'undefined') {
      return;
    }

    setIsIntentional(true);
  }, []);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const startHover = useCallback(
    (keyboard: boolean) => {
      if (!isEffectivelyEnabled) {
        return;
      }

      setIsHovering(true);
      // For keyboard users, we can be more immediate
      timeoutRef.current = window.setTimeout(markIntentional, keyboard ? delay / 2 : delay);
    },
    [isEffectivelyEnabled, delay, markIntentional],
  );

  const onMouseLeave = useCallback(() => {
    setIsHovering(false);
    setIsIntentional(false);

    clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
  }, []);

  return {
    isHovering,
    isIntentional: isEffectivelyEnabled && isIntentional,
    hoverProps: {
      onMouseEnter: useCallback(() => startHover(false), [startHover]),
      onMouseLeave,
      // Support keyboard focus for accessibility
      onFocus: useCallback(() => startHover(true), [startHover]),
      onBlur: onMouseLeave,
    },
  };
}
