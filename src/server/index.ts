import { getDefaultPort } from '../constants';
import logger from '../logger';
import { formatNativeAddonVersionMismatchMessage } from '../util/nativeAddonErrors';
import { BrowserBehavior, checkServerRunning } from '../util/server';
import { ServerError } from './errors';
import { startServer } from './server';

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
  const nativeAddonVersionMismatchMessage = formatNativeAddonVersionMismatchMessage(err);
  if (nativeAddonVersionMismatchMessage) {
    console.error(nativeAddonVersionMismatchMessage);
  } else if (!(err instanceof ServerError)) {
    logger.error(`Failed to start server: ${String(err)}`);
  }
  process.exitCode = 1;
});
