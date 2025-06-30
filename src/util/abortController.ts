import { isCI } from '../envars';
import logger from '../logger';

// Global abort controller for handling Control+C
let globalAbortController: AbortController | null = null;
let signalHandled = false;

// Setup signal handlers for graceful cancellation
export function setupSignalHandlers() {
  const handleSignal = (signal: string) => {
    // Prevent handling multiple signals
    if (signalHandled) {
      return;
    }

    if (globalAbortController && !globalAbortController.signal.aborted) {
      signalHandled = true;
      logger.info(`\nReceived ${signal}. Cancelling evaluation and cleaning up...`);
      globalAbortController.abort();

      // In CI environments, exit quickly to avoid hanging builds
      // In interactive mode, let the evaluation finish and show results
      if (isCI()) {
        setTimeout(() => {
          logger.info('Evaluation cancelled. Exiting...');
          process.exit(0);
        }, 2000);
      }
      // Otherwise, let the evaluation complete its cleanup and show results naturally
      // Reset the flag after a delay to allow for another cancellation if needed
      setTimeout(() => {
        signalHandled = false;
      }, 5000);
    } else if (!signalHandled) {
      // If no evaluation is running or already cancelled, exit immediately
      process.exit(0);
    }
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}

// Function to create and get the global abort controller
export function getGlobalAbortController(): AbortController {
  if (!globalAbortController || globalAbortController.signal.aborted) {
    globalAbortController = new AbortController();
  }
  return globalAbortController;
}

// Function to clear the global abort controller
export function clearGlobalAbortController(): void {
  globalAbortController = null;
  signalHandled = false;
}
