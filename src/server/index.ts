import { getDefaultPort } from '../constants';
import logger from '../logger';
import { BrowserBehavior } from '../util/server';
import { startServer } from './server';

async function main() {
  const port = getDefaultPort();
  // Server will automatically find next available port if default is taken
  await startServer(port, BrowserBehavior.SKIP);
}

main().catch((err) => {
  logger.error(`Failed to start server: ${String(err)}`);
  process.exitCode = 1;
});
