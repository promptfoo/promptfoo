/**
 * Starts the server for development usage.
 */
import { startServer } from './server';

(async () => {
  await startServer(15500, '', false, true);
})();
