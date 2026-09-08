import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { NONCE, secureHeaders } from 'hono/secure-headers';
import { describe, expect, it } from 'vitest';

describe('MCP Hono dependency security', () => {
  // CVE-2026-69207 / GHSA-8j4g-w8fx-2239: with the default (unset) `allowHeaders`,
  // `hono/cors` reflected the attacker-controlled `Access-Control-Request-Headers`
  // preflight header by splitting it on `/\s*,\s*/`. A long whitespace run with no
  // comma forces the engine to rescan the tail from every offset, so a single
  // unauthenticated preflight burns CPU quadratic in the header length. Fixed in
  // hono 4.12.34.
  it('parses delimiter-free whitespace in CORS preflight headers without quadratic blowup', async () => {
    const app = new Hono();

    app.use('*', cors());
    app.get('/', (context) => context.text('ok'));

    // No comma anywhere, so every offset in the run is a fresh backtracking start.
    // The run has to be interior: `Headers` strips leading and trailing whitespace.
    const padded = `x-promptfoo-probe${' '.repeat(60_000)}x-promptfoo-tail`;
    const started = performance.now();
    const response = await app.request('http://localhost/', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': padded,
      },
    });
    const elapsedMs = performance.now() - started;

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain('x-promptfoo-probe');
    // 4.12.32 needs ~2s for this input and scales quadratically; the patched parser
    // is sub-millisecond. The bound is loose enough for a slow CI runner.
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it('preserves reserved request keys without inherited query or header properties', async () => {
    const app = new Hono();

    app.get('/items/:constructor', (context) => {
      const query = context.req.query();
      const headers = context.req.header();
      const parameters = context.req.param();

      return context.json({
        queryHasNullPrototype: Object.getPrototypeOf(query) === null,
        headersHaveNullPrototype: Object.getPrototypeOf(headers) === null,
        constructorQuery: query.constructor,
        prototypeQuery: query.__proto__,
        constructorHeader: headers.constructor,
        routeParameter: parameters.constructor,
        routeParameterIsOwn: Object.hasOwn(parameters, 'constructor'),
      });
    });

    const response = await app.request(
      'http://localhost/items/constructor?constructor=controlled&__proto__=polluted',
      {
        headers: { constructor: 'header-value' },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      queryHasNullPrototype: true,
      headersHaveNullPrototype: true,
      constructorQuery: 'controlled',
      prototypeQuery: 'polluted',
      constructorHeader: 'header-value',
      routeParameter: 'constructor',
      routeParameterIsOwn: true,
    });
  });

  it('keeps enforced and report-only content-security policies isolated', async () => {
    const app = new Hono();

    app.use(
      '*',
      secureHeaders({
        contentSecurityPolicy: { defaultSrc: ["'self'"] },
        contentSecurityPolicyReportOnly: { scriptSrc: ["'self'", NONCE] },
      }),
    );
    app.get('/', (context) => context.text('ok'));

    const response = await app.request('http://localhost/');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe("default-src 'self'");
    expect(response.headers.get('content-security-policy-report-only')).toMatch(
      /^script-src 'self' 'nonce-[a-zA-Z0-9+/]+=*'$/,
    );
  });
});
