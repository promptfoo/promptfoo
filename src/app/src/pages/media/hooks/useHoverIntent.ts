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
 * Detects whether the user has a hover-capable device.
 * Returns false for touch-only devices.
 */
function hasHoverCapability(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(hover: hover)').matches;
}

/**
 * Checks if the user prefers reduced motion.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    enabled && hasHoverCapability() && !(respectReducedMotion && prefersReducedMotion());

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const onMouseEnter = useCallback(() => {
    if (!isEffectivelyEnabled) {
      return;
    }

    setIsHovering(true);
    timeoutRef.current = window.setTimeout(() => {
      setIsIntentional(true);
    }, delay);
  }, [isEffectivelyEnabled, delay]);

  const onMouseLeave = useCallback(() => {
    setIsHovering(false);
    setIsIntentional(false);

    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  // Support keyboard focus for accessibility
  const onFocus = useCallback(() => {
    if (!isEffectivelyEnabled) {
      return;
    }

    setIsHovering(true);
    // For keyboard users, we can be more immediate
    timeoutRef.current = window.setTimeout(() => {
      setIsIntentional(true);
    }, delay / 2);
  }, [isEffectivelyEnabled, delay]);

  const onBlur = useCallback(() => {
    setIsHovering(false);
    setIsIntentional(false);

    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  return {
    isHovering,
    isIntentional: isEffectivelyEnabled && isIntentional,
    hoverProps: {
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
    },
  };
}
