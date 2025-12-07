import chalk from 'chalk';
import { isCI } from '../envars';
import { getLogLevel, setLogLevel } from '../logger';

let isVerboseToggleEnabled = false;
let cleanupFn: (() => void) | null = null;

/**
 * Shows a brief status message that doesn't interfere with progress bars
 */
function showToggleStatus(isVerbose: boolean): void {
  const status = isVerbose
    ? chalk.green.bold('● DEBUG ON') + chalk.dim('  │  press v to hide')
    : chalk.dim('○ DEBUG OFF  │  press v to show');

  // Clear current line and print status with spacing for visual clarity
  if (process.stderr.isTTY) {
    process.stderr.write(`\n\r\x1b[K${status}\n\n`);
  }
}

/**
 * Initializes live verbose toggle functionality.
 * When enabled, pressing 'v' will toggle between debug and info log levels.
 *
 * Only works in interactive TTY mode (not CI, not piped).
 *
 * @returns cleanup function to disable the toggle, or null if not enabled
 */
export function initVerboseToggle(): (() => void) | null {
  // Don't enable in CI or non-interactive environments
  if (isCI() || !process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  // Already enabled
  if (isVerboseToggleEnabled) {
    return cleanupFn;
  }

  try {
    // Put stdin in raw mode to capture individual keypresses
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const handleKeypress = (key: string): void => {
      // Handle Ctrl+C to exit gracefully
      if (key === '\u0003') {
        disableVerboseToggle();
        process.exit();
      }

      // Toggle verbose on 'v' or 'V'
      if (key === 'v' || key === 'V') {
        const currentLevel = getLogLevel();
        const newLevel = currentLevel === 'debug' ? 'info' : 'debug';
        setLogLevel(newLevel);
        showToggleStatus(newLevel === 'debug');
      }
    };

    process.stdin.on('data', handleKeypress);

    isVerboseToggleEnabled = true;

    cleanupFn = () => {
      process.stdin.removeListener('data', handleKeypress);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      isVerboseToggleEnabled = false;
      cleanupFn = null;
    };

    // Auto-cleanup on process exit
    process.on('exit', () => {
      if (cleanupFn) {
        cleanupFn();
      }
    });

    // Show initial hint
    const initialVerbose = getLogLevel() === 'debug';
    process.stderr.write(
      chalk.dim(
        `\n  Tip: Press v to toggle debug output${initialVerbose ? ' (currently ON)' : ''}\n\n`,
      ),
    );

    return cleanupFn;
  } catch {
    // If anything fails, don't break the CLI
    return null;
  }
}

/**
 * Disables the verbose toggle and cleans up resources
 */
export function disableVerboseToggle(): void {
  if (cleanupFn) {
    cleanupFn();
  }
}

/**
 * Returns whether verbose toggle is currently enabled
 */
export function isVerboseToggleActive(): boolean {
  return isVerboseToggleEnabled;
}
