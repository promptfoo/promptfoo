import fs from 'node:fs';
import path from 'node:path';

import type { MiddlewareHandler } from 'hono';

/**
 * SPA fallback middleware for client-side routing.
 * Returns index.html for non-API routes that don't match static files.
 */
export function createSpaFallback(staticDir: string): MiddlewareHandler {
  const indexPath = path.join(staticDir, 'index.html');

  return async (c, next) => {
    await next();

    // Only handle 404s for non-API routes
    if (c.res.status === 404 && !c.req.path.startsWith('/api/')) {
      // Check if index.html exists
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf-8');
        return c.html(html);
      }
    }
  };
}
