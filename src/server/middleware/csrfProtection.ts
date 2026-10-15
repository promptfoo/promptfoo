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

function getAllowedRequestHosts(): Set<string> {
  const hosts = new Set<string>();
  // Operators who already allowlisted cross-site origins (e.g. a UI on one
  // origin talking to the API on another) should not also have to repeat the
  // hostnames here.
  for (const origin of getAllowedOrigins()) {
    try {
      hosts.add(new URL(origin).hostname.toLowerCase());
    } catch {
      hosts.add(stripPort(origin).toLowerCase());
    }
  }
  const envHosts = getEnvString('PROMPTFOO_CSRF_ALLOWED_HOSTS', '');
  for (const entry of envHosts.split(',')) {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed) {
      hosts.add(stripPort(trimmed));
    }
  }
  return hosts;
}

function isAllowedRequestHost(host: string): boolean {
  const hostname = stripPort(host).toLowerCase();
  if (!hostname) {
    return false;
  }
  return isLocalHost(hostname) || getAllowedRequestHosts().has(hostname);
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

  // Path 0: DNS-rebinding countermeasure. A page on a rebinding domain
  // (rebind.evil.com → 127.0.0.1) issues requests the browser considers
  // same-origin, so Paths 1 and 2 below pass them: Sec-Fetch-Site is
  // `same-origin` and the Origin matches the attacker-controlled Host.
  // Mutating requests must instead arrive on a local or explicitly
  // allowlisted Host. Non-browser clients that target localhost, and GET
  // health probes against container IPs, are unaffected.
  if (!isAllowedRequestHost(host)) {
    logger.warn('[CSRF] Blocked request with unexpected Host header (possible DNS rebinding)', {
      method: req.method,
      path: req.path,
      host,
    });
    res.status(403).json({ error: 'Requests must use a local or allowlisted host' });
    return;
  }

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
