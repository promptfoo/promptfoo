/**
 * Hook for setting terminal window/tab title using Ink's stdout reference.
 *
 * Uses Ink's useStdout hook to properly integrate with Ink's rendering
 * and ensure correct cleanup when the component unmounts.
 */

import { useEffect } from 'react';

import { useStdout } from 'ink';

/**
 * Set the terminal window/tab title.
 *
 * The title is automatically cleared when the component unmounts.
 * Passing null or an empty string clears the title.
 *
 * @param title - The title to display, or null to clear
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const progress = 50;
 *   useTerminalTitle(`Processing: ${progress}%`);
 *   return <Text>Working...</Text>;
 * }
 * ```
 */
export function useTerminalTitle(title: string | null): void {
  const { stdout } = useStdout();

  useEffect(() => {
    // Only set title if we have a TTY stdout
    if (!stdout?.isTTY) {
      return;
    }

    if (title) {
      // \x1b]0; sets both icon name and window title
      // \x07 is the bell character that terminates the sequence
      stdout.write(`\x1b]0;${title}\x07`);
    } else {
      // Clear the title
      stdout.write('\x1b]0;\x07');
    }

    // Clear title on unmount
    return () => {
      if (stdout?.isTTY) {
        stdout.write('\x1b]0;\x07');
      }
    };
  }, [stdout, title]);
}
