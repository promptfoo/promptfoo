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
import { BrowserBehavior, checkServerRunning } from '../util/server';
import { startServer } from './server';

async function main() {
  const port = getDefaultPort();
  logger.info(`Starting server on port ${port}...`);
  
  try {
    logger.info(`About to check if server is running on port ${port}...`);
    const isRunning = await checkServerRunning(port);
    logger.info(`Server running check completed, result: ${isRunning}`);
    if (isRunning) {
      logger.info(`Promptfoo server already running at http://localhost:${port}`);
      process.exitCode = 1;
      return;
    }
    logger.info(`No existing server found. Starting server on port ${port}...`);
    await startServer(port, BrowserBehavior.SKIP);
    logger.info(`Server started successfully on port ${port}`);
  } catch (error) {
    logger.error(`Error during server startup: ${String(error)}`);
    throw error;
  }
}

main().catch((err) => {
  logger.error(`Failed to start server: ${String(err)}`);
  process.exitCode = 1;
});
