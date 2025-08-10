import { getDefaultPort } from '../constants';
import logger from '../logger';
import { BrowserBehavior, checkServerRunning } from '../util/server';
import { startServer } from './server';
// Import fetch module to ensure global fetch override is applied
import '../util/fetch';

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
