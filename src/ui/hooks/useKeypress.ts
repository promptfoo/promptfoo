/**
 * Hook for handling keyboard input in Ink components.
 *
 * Provides a clean interface for responding to key presses with
 * support for common key combinations.
 */

import { useEffect, useState } from 'react';

import { useInput } from 'ink';

/**
 * Key information passed to keypress handlers.
 */
export interface KeyInfo {
  /** The key character (for printable keys) */
  key: string;
  /** Raw input string */
  raw: string;
  /** Whether Ctrl was held */
  ctrl: boolean;
  /** Whether Meta/Alt was held */
  meta: boolean;
  /** Whether Shift was held (implied by uppercase or special chars) */
  shift: boolean;
  /** Named key for special keys */
  name?: string;
}

export interface KeypressOptions {
  /** Whether to capture input (default: true) */
  isActive?: boolean;
}

/**
 * Check if raw mode input is supported.
 * Raw mode is required for capturing keystrokes.
 */
export function isRawModeSupported(): boolean {
  return process.stdin.isTTY === true && typeof process.stdin.setRawMode === 'function';
}

/**
 * Hook for handling keypress events.
 *
 * @param handler - Callback for key presses
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useKeypress((key) => {
 *     if (key.name === 'escape') {
 *       // Handle escape
 *     }
 *     if (key.ctrl && key.key === 'c') {
 *       // Handle Ctrl+C
 *     }
 *   });
 *
 *   return <Text>Press any key...</Text>;
 * }
 * ```
 */
export function useKeypress(handler: (key: KeyInfo) => void, options: KeypressOptions = {}): void {
  const { isActive = true } = options;

  // Only activate input handling if raw mode is supported
  const effectiveIsActive = isActive && isRawModeSupported();

  useInput(
    (input, key) => {
      const keyInfo: KeyInfo = {
        key: input,
        raw: input,
        ctrl: key.ctrl,
        meta: key.meta,
        shift: key.shift,
        name: getKeyName(input, key),
      };

      handler(keyInfo);
    },
    { isActive: effectiveIsActive },
  );
}

/**
 * Get a human-readable name for a key.
 */
function getKeyName(
  input: string,
  key: {
    upArrow: boolean;
    downArrow: boolean;
    leftArrow: boolean;
    rightArrow: boolean;
    return: boolean;
    escape: boolean;
    tab: boolean;
    backspace: boolean;
    delete: boolean;
    pageUp: boolean;
    pageDown: boolean;
  },
): string | undefined {
  if (key.upArrow) {
    return 'up';
  }
  if (key.downArrow) {
    return 'down';
  }
  if (key.leftArrow) {
    return 'left';
  }
  if (key.rightArrow) {
    return 'right';
  }
  if (key.return) {
    return 'return';
  }
  if (key.escape) {
    return 'escape';
  }
  if (key.tab) {
    return 'tab';
  }
  if (key.backspace) {
    return 'backspace';
  }
  if (key.delete) {
    return 'delete';
  }
  if (key.pageUp) {
    return 'pageUp';
  }
  if (key.pageDown) {
    return 'pageDown';
  }
  if (input === ' ') {
    return 'space';
  }
  return undefined;
}

/**
 * Hook for tracking whether a specific key is being held down.
 */
export function useKeyHeld(targetKey: string, options: KeypressOptions = {}): boolean {
  const [isHeld, setIsHeld] = useState(false);

  useKeypress((key) => {
    if (key.key === targetKey || key.name === targetKey) {
      setIsHeld(true);
    }
  }, options);

  // Reset on any key up (simplified - Ink doesn't provide key up events)
  // In practice, we just set it and let it be managed by the component
  useEffect(() => {
    if (isHeld) {
      const timer = setTimeout(() => setIsHeld(false), 100);
      return () => clearTimeout(timer);
    }
  }, [isHeld]);

  return isHeld;
}

/**
 * Hook for handling navigation keys (up, down, enter, escape).
 */
export function useNavigationKeys(
  callbacks: {
    onUp?: () => void;
    onDown?: () => void;
    onLeft?: () => void;
    onRight?: () => void;
    onEnter?: () => void;
    onEscape?: () => void;
    onTab?: () => void;
    onSpace?: () => void;
  },
  options: KeypressOptions = {},
): void {
  useKeypress((key) => {
    switch (key.name) {
      case 'up':
        callbacks.onUp?.();
        break;
      case 'down':
        callbacks.onDown?.();
        break;
      case 'left':
        callbacks.onLeft?.();
        break;
      case 'right':
        callbacks.onRight?.();
        break;
      case 'return':
        callbacks.onEnter?.();
        break;
      case 'escape':
        callbacks.onEscape?.();
        break;
      case 'tab':
        callbacks.onTab?.();
        break;
      case 'space':
        callbacks.onSpace?.();
        break;
    }
  }, options);
}

/**
 * Hook for yes/no confirmation.
 * Returns true when 'y' is pressed, false when 'n' is pressed.
 */
export function useConfirmKey(
  onConfirm: (confirmed: boolean) => void,
  options: KeypressOptions = {},
): void {
  useKeypress((key) => {
    const lower = key.key.toLowerCase();
    if (lower === 'y') {
      onConfirm(true);
    } else if (lower === 'n') {
      onConfirm(false);
    }
  }, options);
}
