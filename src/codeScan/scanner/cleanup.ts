/**
 * Cleanup and Signal Handling
 *
 * Manages graceful shutdown and resource cleanup for scan operations.
 */

import logger from '../../logger';

/**
 * Register cleanup handlers for process signals
 *
 * Handles SIGINT (Ctrl+C), SIGTERM, and SIGQUIT signals by aborting the scan.
 * The scanner's catch/finally blocks perform resource cleanup.
 *
 * @param abortController - Controller for the in-flight scan
 */
export function registerCleanupHandlers(abortController: AbortController): void {
  const cleanup = (signal: string) => {
    logger.debug(`Received ${signal}, aborting scan...`);

    // Abort the scan Promise - this will trigger the catch/finally blocks
    // which handle all the actual resource cleanup
    abortController.abort();

    // Exit code will be set in the catch block after output is flushed
    // This prevents output from appearing after the shell prompt
  };

  // Register handlers for common termination signals
  // Use process.once() to prevent duplicate registrations
  process.once('SIGINT', () => cleanup('SIGINT')); // Ctrl+C
  process.once('SIGTERM', () => cleanup('SIGTERM')); // Termination signal
  process.once('SIGQUIT', () => cleanup('SIGQUIT')); // Quit signal
}
