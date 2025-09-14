import { getDefaultPort } from '../constants.js';
import logger from '../logger.js';
import { BrowserBehavior, checkServerRunning } from '../util/server.js';
import { startServer } from './server.js';

async function main() {
  const port = getDefaultPort();
  const isRunning = await checkServerRunning(port);
  if (isRunning) {
    logger.info(`Promptfoo server already running at http://localhost:${port}`);
    process.exitCode = 1;
    return;
  }
  await startServer(port, BrowserBehavior.SKIP);
}

main().catch((err) => {
  logger.error(`Failed to start server: ${String(err)}`);
  process.exitCode = 1;
});
