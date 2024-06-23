/**
 * Starts the server for development usage.
 */
import { startServer, BrowserBehavior } from './server';

(async () => {
  await startServer(15500, '', BrowserBehavior.SKIP, '', false);
})();
