import path from 'node:path';

import type { MiddlewareHandler } from 'hono';

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/**
 * Middleware to set proper MIME types for JavaScript files.
 * This is necessary because some browsers (especially Arc) enforce strict MIME type checking
 * and will refuse to execute scripts with incorrect MIME types for security reasons.
 */
export const setJavaScriptMimeType: MiddlewareHandler = async (c, next) => {
  await next();
  const ext = path.extname(c.req.path);
  if (JS_EXTENSIONS.has(ext) && c.res) {
    // Clone the response with updated headers
    const headers = new Headers(c.res.headers);
    headers.set('Content-Type', 'application/javascript');
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  }
};
