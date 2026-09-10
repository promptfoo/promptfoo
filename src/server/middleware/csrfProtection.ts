import { getEnvString } from '../../envars';
import logger from '../../logger';
import type { CorsOptionsDelegate } from 'cors';
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

function isSameHostname(origin: string, host: string): boolean {
  try {
    const originHostname = new URL(origin).hostname;
    const targetHostname = stripPort(host);
    return originHostname === targetHostname;
  } catch {
    return false;
  }
}

export function isAllowedBrowserOrigin(origin: string, host: string): boolean {
  return isSameHostname(origin, host) || isAllowedCrossSite(origin, host);
}

export function isAllowedCorsOrigin(origin: string, host: string): boolean {
  return isAllowedCrossSite(origin, host);
}

export const corsOptionsDelegate: CorsOptionsDelegate<Request> = (req, callback): void => {
  const origin = req.headers.origin;
  if (!origin) {
    callback(null, { origin: false });
    return;
  }

  const host = req.headers.host || '';
  const allowed = isAllowedCorsOrigin(origin, host);
  if (!allowed) {
    logger.warn('[CORS] Cross-origin browser access was not allowlisted', {
      method: req.method,
      path: req.path,
      origin,
      host,
      help: 'Set PROMPTFOO_CSRF_ALLOWED_ORIGINS to the exact trusted browser origin if this cross-origin deployment is intentional.',
    });
  }

  callback(null, {
    origin: allowed ? origin : false,
  });
};

export function isAllowedSocketIoCorsOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }
  if (getAllowedOrigins().has(origin)) {
    return true;
  }

  try {
    return isLocalHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function socketIoCorsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  const allowed = isAllowedSocketIoCorsOrigin(origin);
  if (origin && !allowed) {
    logger.warn('[CORS] Socket.IO browser origin was not allowlisted', {
      origin,
      help: 'Set PROMPTFOO_CSRF_ALLOWED_ORIGINS to the exact trusted browser origin if this cross-origin deployment is intentional.',
    });
  }
  callback(null, allowed);
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
    if (isAllowedBrowserOrigin(origin, host)) {
      return next();
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
