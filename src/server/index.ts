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
    logger.info(`Server running check result: ${isRunning}`);
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
