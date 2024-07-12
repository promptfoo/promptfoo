/**
 * Starts the standalone API server.
 */
import { startServer, BrowserBehavior } from './server';

(async () => {
  await startServer(15500, '', BrowserBehavior.SKIP, '', false);
})();
