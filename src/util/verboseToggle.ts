import chalk from 'chalk';
import { isCI } from '../envars';
import logger, { getLogLevel, setLogLevel } from '../logger';

let isVerboseToggleEnabled = false;
let cleanupFn: (() => void) | null = null;

export interface VerboseToggleOptions {
  /**
   * Called when the user presses Ctrl+C while the toggle owns stdin.
   * The terminal is already restored before this fires; the callback's job is
   * to re-enter the host's normal interruption pathway (e.g. `process.kill`).
   */
  onInterrupt: () => void;
}

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
export function initVerboseToggle(options: VerboseToggleOptions): (() => void) | null {
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
      // In raw mode Ctrl+C arrives as stdin data instead of SIGINT. Restore the
      // terminal first, then let the caller decide how interruption should work.
      if (key === '\u0003') {
        disableVerboseToggle();
        try {
          options.onInterrupt();
        } catch (err) {
          // A throwing onInterrupt would otherwise surface as an uncaughtException
          // out of an EventEmitter listener and leave Ctrl+C broken for the user.
          // Log the bug, then force-exit with the conventional SIGINT exit code so
          // the keypress still terminates the process.
          logger.error(
            `verboseToggle onInterrupt callback threw: ${err instanceof Error ? err.message : err}`,
          );
          process.exit(130);
        }
        return;
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

    // Stored so cleanupFn can deregister it; otherwise repeated init/teardown
    // cycles accumulate one 'exit' listener per cycle.
    const exitHandler = () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
    process.on('exit', exitHandler);

    isVerboseToggleEnabled = true;

    cleanupFn = () => {
      process.stdin.removeListener('data', handleKeypress);
      process.removeListener('exit', exitHandler);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      isVerboseToggleEnabled = false;
      cleanupFn = null;
    };

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
