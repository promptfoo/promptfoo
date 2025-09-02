// Set a global flag to indicate we're in a bundled context
// This helps strategy files avoid executing their main functions
if (
  process.argv[1] &&
  (process.argv[1].includes('server/index.cjs') || process.argv[1].includes('server/index.js'))
) {
  (global as any).__PROMPTFOO_CLI_BUNDLE__ = true;
}

import { getDefaultPort } from '../constants';
import logger from '../logger';
import { BrowserBehavior } from '../util/server';
import { startServer } from './server';

// Add comprehensive error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  logger.error(`Stack: ${error.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

async function main() {
  const port = getDefaultPort();
  logger.info(`Starting server on port ${port}...`);

  try {
    // Skip health check for now to isolate the issue
    logger.info(`Skipping server health check, starting server directly...`);
    logger.info(`About to call startServer with port ${port}...`);
    await startServer(port, BrowserBehavior.SKIP);
    logger.info(`startServer call completed successfully!`);
    logger.info(`Server started successfully on port ${port}`);
  } catch (error) {
    logger.error(`Error during server startup: ${String(error)}`);
    logger.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    throw error;
  }
}

main().catch((err) => {
  logger.error(`Failed to start server: ${String(err)}`);
  process.exitCode = 1;
});
