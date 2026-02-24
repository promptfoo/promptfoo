import { getEnvString } from '../../envars';
import logger from '../../logger';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Hostnames that all resolve to the local machine.
// Requests between these are treated as same-origin equivalent.
const KNOWN_LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  '::1',
  'local.promptfoo.app',
]);

function isLocalHost(hostname: string): boolean {
  return KNOWN_LOCAL_HOSTS.has(hostname);
}

function getAllowedOrigins(): Set<string> {
  const envOrigins = getEnvString('PROMPTFOO_CSRF_ALLOWED_ORIGINS', '');
  if (!envOrigins) {
    return new Set();
  }
  return new Set(
    envOrigins
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

function stripPort(host: string): string {
  return host.replace(/:\d+$/, '');
}

function isAllowedCrossSite(origin: string, host: string): boolean {
  // Check localhost equivalence
  try {
    const originHostname = new URL(origin).hostname;
    const targetHostname = stripPort(host);
    if (isLocalHost(originHostname) && isLocalHost(targetHostname)) {
      return true;
    }
  } catch {
    return false;
  }
  // Check env var allowlist
  return getAllowedOrigins().has(origin);
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const secFetchSite = req.headers['sec-fetch-site'] as string | undefined;
  const origin = req.headers['origin'] as string | undefined;
  // Only trust the Host header — X-Forwarded-Host is attacker-controllable
  // unless a trusted reverse proxy strips/overwrites it.
  const host = req.headers.host || '';

  // Path 1: Browser sent Sec-Fetch-Site (forbidden header, can't be spoofed by JS)
  if (secFetchSite) {
    if (secFetchSite !== 'cross-site') {
      // same-origin, same-site, none — all safe.
      // Note: same-site permits sibling subdomains (e.g., evil.example.com →
      // app.example.com). This is acceptable because same-site already shares
      // cookies, and non-localhost deployments should use a reverse proxy with
      // its own CSRF protection.
      return next();
    }
    // cross-site — check if it's a known-safe cross-site (localhost aliases)
    if (origin && isAllowedCrossSite(origin, host)) {
      return next();
    }
    logger.warn('[CSRF] Blocked cross-site request', {
      method: req.method,
      path: req.path,
      origin,
      host,
      secFetchSite,
    });
    res.status(403).json({ error: 'Cross-site requests are not allowed' });
    return;
  }

  // Path 2: No Sec-Fetch-Site but Origin present (older browser)
  if (origin) {
    try {
      const originHostname = new URL(origin).hostname;
      const targetHostname = stripPort(host);
      if (originHostname === targetHostname) {
        return next();
      }
      if (isAllowedCrossSite(origin, host)) {
        return next();
      }
    } catch {
      // Malformed Origin header — fall through to block
    }
    logger.warn('[CSRF] Blocked cross-origin request', {
      method: req.method,
      path: req.path,
      origin,
      host,
    });
    res.status(403).json({ error: 'Cross-origin requests are not allowed' });
    return;
  }

  // Path 3: No browser headers — non-browser client (curl, scripts, SDKs)
  return next();
}
