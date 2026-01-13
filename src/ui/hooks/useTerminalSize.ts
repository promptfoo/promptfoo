/**
 * useTerminalSize - Hook for getting and tracking terminal dimensions.
 *
 * Features:
 * - Returns current terminal width and height
 * - Updates on terminal resize
 * - Provides sensible defaults for non-TTY environments
 */

import { useEffect, useState } from 'react';

import { useStdout } from 'ink';

/**
 * Terminal size dimensions.
 */
export interface TerminalSize {
  /** Terminal width in columns */
  width: number;
  /** Terminal height in rows */
  height: number;
}

/**
 * Default terminal size for non-TTY environments.
 */
const DEFAULT_SIZE: TerminalSize = {
  width: 80,
  height: 24,
};

/**
 * Get current terminal size from stdout.
 */
function getTerminalSize(stdout: NodeJS.WriteStream): TerminalSize {
  return {
    width: stdout.columns || DEFAULT_SIZE.width,
    height: stdout.rows || DEFAULT_SIZE.height,
  };
}

/**
 * Hook to get current terminal size with resize tracking.
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => getTerminalSize(stdout));

  useEffect(() => {
    // Update size on resize
    const handleResize = () => {
      setSize(getTerminalSize(stdout));
    };

    // Listen for resize events
    stdout.on('resize', handleResize);

    // Initial update in case size changed since initial state
    handleResize();

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return size;
}

/**
 * Non-hook version for use outside React components.
 */
export function getStaticTerminalSize(): TerminalSize {
  return {
    width: process.stdout.columns || DEFAULT_SIZE.width,
    height: process.stdout.rows || DEFAULT_SIZE.height,
  };
}
