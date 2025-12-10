/**
 * Hook for animating spinner frames.
 *
 * Provides a rotating spinner frame character that updates at a specified interval.
 */

import { useEffect, useState } from 'react';

// Common spinner frame sets
export const SPINNER_FRAMES = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['-', '\\', '|', '/'],
  arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
  circle: ['◐', '◓', '◑', '◒'],
  square: ['◰', '◳', '◲', '◱'],
  bounce: ['⠁', '⠂', '⠄', '⠂'],
  clock: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
} as const;

export type SpinnerType = keyof typeof SPINNER_FRAMES;

export interface UseSpinnerFrameOptions {
  /** The type of spinner to use */
  type?: SpinnerType;
  /** Custom frames to use instead of predefined types */
  frames?: readonly string[];
  /** Interval between frame changes in ms (default: 80) */
  interval?: number;
  /** Whether the spinner is active (default: true) */
  active?: boolean;
}

/**
 * Hook that returns the current spinner frame.
 *
 * @param options - Configuration options
 * @returns The current spinner frame character
 *
 * @example
 * ```tsx
 * function Loading() {
 *   const frame = useSpinnerFrame({ type: 'dots' });
 *   return <Text>{frame} Loading...</Text>;
 * }
 * ```
 */
export function useSpinnerFrame(options: UseSpinnerFrameOptions = {}): string {
  const { type = 'dots', frames: customFrames, interval = 80, active = true } = options;

  const frames = customFrames || SPINNER_FRAMES[type];
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [frames.length, interval, active]);

  return frames[frameIndex];
}

/**
 * Hook that returns spinner state with more control.
 */
export function useSpinner(options: UseSpinnerFrameOptions = {}) {
  const frame = useSpinnerFrame(options);
  const [isSpinning, setIsSpinning] = useState(options.active ?? true);

  return {
    frame: isSpinning ? frame : '',
    isSpinning,
    start: () => setIsSpinning(true),
    stop: () => setIsSpinning(false),
  };
}
