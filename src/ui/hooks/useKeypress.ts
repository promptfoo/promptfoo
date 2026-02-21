/**
 * Hook for handling keyboard input in Ink components.
 *
 * Provides a clean interface for responding to key presses with
 * support for common key combinations.
 */

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
 * Mapping from Ink key boolean properties to human-readable names.
 */
const KEY_NAME_MAP: ReadonlyArray<[keyof Parameters<typeof getKeyName>[1], string]> = [
  ['upArrow', 'up'],
  ['downArrow', 'down'],
  ['leftArrow', 'left'],
  ['rightArrow', 'right'],
  ['return', 'return'],
  ['escape', 'escape'],
  ['tab', 'tab'],
  ['backspace', 'backspace'],
  ['delete', 'delete'],
  ['pageUp', 'pageup'],
  ['pageDown', 'pagedown'],
  ['home', 'home'],
  ['end', 'end'],
];

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
    home: boolean;
    end: boolean;
  },
): string | undefined {
  for (const [prop, name] of KEY_NAME_MAP) {
    if (key[prop]) {
      return name;
    }
  }
  if (input === ' ') {
    return 'space';
  }
  return undefined;
}
