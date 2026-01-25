/**
 * Server module - exports the Hono-based server implementation.
 *
 * This module provides backwards compatibility by re-exporting from the Hono implementation.
 * The actual server implementation is in ./hono/
 */

// Re-export Hono server implementation
export {
  createHonoApp as createApp,
  findStaticDir,
  handleServerError,
  MAX_BODY_SIZE,
  resetPromptsCache,
  startHonoServer as startServer,
} from './hono';
// Re-export for backwards compatibility with tests
export { setJavaScriptMimeType } from './hono/middleware/mimeType';
