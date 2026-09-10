import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import {
  corsOptionsDelegate,
  csrfProtection,
  isAllowedBrowserOrigin,
  isAllowedCorsOrigin,
  isAllowedSocketIoCorsOrigin,
  socketIoCorsOrigin,
} from '../../../src/server/middleware/csrfProtection';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../../../src/logger', () => ({
  default: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/envars', () => ({
  getEnvString: vi.fn((_key: string, defaultValue?: string) => defaultValue ?? ''),
}));

import { getEnvString } from '../../../src/envars';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    path: '/api/eval',
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('csrfProtection', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    vi.mocked(getEnvString).mockImplementation(
      (_key: string, defaultValue?: string) => defaultValue ?? '',
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // Safe methods always pass
  describe('safe methods', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('%s requests pass through', (method) => {
      const req = mockReq({
        method,
        headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.com' },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  // Path 1: Sec-Fetch-Site present
  describe('with Sec-Fetch-Site header', () => {
    it.each(['same-origin', 'same-site', 'none'])('allows POST with sec-fetch-site=%s', (value) => {
      const req = mockReq({ headers: { 'sec-fetch-site': value, host: 'localhost:15500' } });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('blocks cross-site POST from evil.com', () => {
      const req = mockReq({
        headers: {
          'sec-fetch-site': 'cross-site',
          origin: 'http://evil.com',
          host: 'localhost:15500',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows cross-site from local.promptfoo.app to localhost (localhost equiv)', () => {
      const req = mockReq({
        headers: {
          'sec-fetch-site': 'cross-site',
          origin: 'http://local.promptfoo.app:5173',
          host: 'localhost:15500',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('allows cross-site from 127.0.0.1 to localhost (localhost equiv)', () => {
      const req = mockReq({
        headers: {
          'sec-fetch-site': 'cross-site',
          origin: 'http://127.0.0.1:3000',
          host: 'localhost:15500',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('allows cross-site from env var allowlisted origin', () => {
      vi.mocked(getEnvString).mockImplementation((_key: string, defaultValue?: string) => {
        if (_key === 'PROMPTFOO_CSRF_ALLOWED_ORIGINS') {
          return 'http://allowed.com';
        }
        return defaultValue ?? '';
      });
      const req = mockReq({
        headers: {
          'sec-fetch-site': 'cross-site',
          origin: 'http://allowed.com',
          host: 'localhost:15500',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('blocks cross-site with no origin header', () => {
      const req = mockReq({
        headers: {
          'sec-fetch-site': 'cross-site',
          host: 'localhost:15500',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // Path 2: No Sec-Fetch-Site, Origin present
  describe('with Origin header only (no Sec-Fetch-Site)', () => {
    it('allows POST when origin hostname matches host', () => {
      const req = mockReq({
        headers: {
          origin: 'http://localhost:5173',
          host: 'localhost:15500',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('blocks POST when origin hostname differs from host', () => {
      const req = mockReq({
        headers: {
          origin: 'http://evil.com',
          host: 'localhost:15500',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows localhost equivalence via Origin fallback', () => {
      const req = mockReq({
        headers: {
          origin: 'http://local.promptfoo.app:5173',
          host: 'localhost:15500',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // Path 3: No browser headers
  describe('non-browser clients (no Sec-Fetch-Site, no Origin)', () => {
    it('allows POST with no browser headers', () => {
      const req = mockReq({
        headers: { host: 'localhost:15500' },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // Other mutating methods
  describe('other mutating methods', () => {
    it.each(['DELETE', 'PUT', 'PATCH'])('blocks cross-site %s from evil.com', (method) => {
      const req = mockReq({
        method,
        headers: {
          'sec-fetch-site': 'cross-site',
          origin: 'http://evil.com',
          host: 'localhost:15500',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // x-forwarded-host is NOT trusted (attacker-controllable)
  describe('x-forwarded-host', () => {
    it('ignores x-forwarded-host and uses Host header for origin comparison', () => {
      const req = mockReq({
        headers: {
          origin: 'http://evil.com',
          host: 'localhost:15500',
          'x-forwarded-host': 'evil.com',
        },
      });
      const res = mockRes();
      csrfProtection(req, res, next);
      // Should block: origin (evil.com) !== host (localhost), even though
      // x-forwarded-host matches origin. The header is attacker-controllable.
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('browser CORS origin checks', () => {
    it('allows localhost aliases used by the web UI and dev server', () => {
      expect(isAllowedBrowserOrigin('http://127.0.0.1:5173', 'localhost:15500')).toBe(true);
      expect(isAllowedBrowserOrigin('http://local.promptfoo.app:5173', 'localhost:15500')).toBe(
        true,
      );
    });

    it('allows origins listed in PROMPTFOO_CSRF_ALLOWED_ORIGINS', () => {
      vi.mocked(getEnvString).mockImplementation((_key: string, defaultValue?: string) => {
        if (_key === 'PROMPTFOO_CSRF_ALLOWED_ORIGINS') {
          return 'https://trusted.example';
        }
        return defaultValue ?? '';
      });

      expect(isAllowedBrowserOrigin('https://trusted.example', 'localhost:15500')).toBe(true);
    });

    it('does not treat same-host cross-origin reads as CORS trusted by default', () => {
      expect(isAllowedBrowserOrigin('https://app.example.com:8443', 'app.example.com:15500')).toBe(
        true,
      );
      expect(isAllowedCorsOrigin('https://app.example.com:8443', 'app.example.com:15500')).toBe(
        false,
      );
    });

    it('does not emit CORS headers for untrusted cross-origin browser reads', () => {
      const callback = vi.fn();
      corsOptionsDelegate(
        mockReq({
          method: 'GET',
          headers: { origin: 'https://evil.example', host: 'localhost:15500' },
        }),
        callback,
      );

      expect(callback).toHaveBeenCalledWith(null, { origin: false });
      expect(logger.warn).toHaveBeenCalledWith(
        '[CORS] Cross-origin browser access was not allowlisted',
        expect.objectContaining({
          origin: 'https://evil.example',
          host: 'localhost:15500',
          help: expect.stringContaining('PROMPTFOO_CSRF_ALLOWED_ORIGINS'),
        }),
      );
    });

    it('emits CORS headers for trusted localhost aliases', () => {
      const callback = vi.fn();
      corsOptionsDelegate(
        mockReq({
          method: 'GET',
          headers: { origin: 'http://127.0.0.1:5173', host: 'localhost:15500' },
        }),
        callback,
      );

      expect(callback).toHaveBeenCalledWith(null, { origin: 'http://127.0.0.1:5173' });
    });

    it('keeps no-origin clients out of CORS handling', () => {
      const callback = vi.fn();
      corsOptionsDelegate(
        mockReq({ method: 'GET', headers: { host: 'localhost:15500' } }),
        callback,
      );

      expect(callback).toHaveBeenCalledWith(null, { origin: false });
    });

    it('restricts Socket.IO CORS to no-origin, local-origin, or allowlisted callers', () => {
      expect(isAllowedSocketIoCorsOrigin(undefined)).toBe(true);
      expect(isAllowedSocketIoCorsOrigin('http://localhost:5173')).toBe(true);
      expect(isAllowedSocketIoCorsOrigin('https://evil.example')).toBe(false);
    });

    it('logs guidance when Socket.IO receives an untrusted browser origin', () => {
      const callback = vi.fn();

      socketIoCorsOrigin('https://evil.example', callback);

      expect(callback).toHaveBeenCalledWith(null, false);
      expect(logger.warn).toHaveBeenCalledWith(
        '[CORS] Socket.IO browser origin was not allowlisted',
        expect.objectContaining({
          origin: 'https://evil.example',
          help: expect.stringContaining('PROMPTFOO_CSRF_ALLOWED_ORIGINS'),
        }),
      );
    });
  });
});
