import { getDefaultPort } from '../constants';
import { getEnvBool, getEnvString } from '../envars';
import logger from '../logger';
import { BrowserBehavior, checkServerRunning } from '../util/server';
import { startServer } from './server';

function getServerUrl(port: number): string {
  // Check if we're in self-hosted mode and have a custom URL configured
  const remoteApiBaseUrl = getEnvString('PROMPTFOO_REMOTE_API_BASE_URL');
  
  if (remoteApiBaseUrl) {
    // If a full URL is configured, use it (it might include a different hostname/port)
    try {
      const url = new URL(remoteApiBaseUrl);
      return url.origin;
    } catch {
      // If it's not a valid URL, fall back to localhost
    }
  }
  
  // Default to localhost with the actual port
  return `http://localhost:${port}`;
}

async function main() {
  const port = getDefaultPort();
  const isRunning = await checkServerRunning(port);
  if (isRunning) {
    const serverUrl = getServerUrl(port);
    logger.info(`Promptfoo server already running at ${serverUrl}`);
    return;
  }
  await startServer(port, BrowserBehavior.SKIP);
}

main().catch((err) => {
  logger.error(`Failed to start server: ${String(err)}`);
  process.exitCode = 1;
});
