import { Hono } from 'hono';
import { NONCE, secureHeaders } from 'hono/secure-headers';
import { describe, expect, it } from 'vitest';

describe('MCP Hono dependency security', () => {
  it('preserves reserved request keys without inherited query or header properties', async () => {
    const app = new Hono();

    app.get('/items/:name', (context) => {
      const query = context.req.query();
      const headers = context.req.header();

      return context.json({
        queryHasNullPrototype: Object.getPrototypeOf(query) === null,
        headersHaveNullPrototype: Object.getPrototypeOf(headers) === null,
        constructorQuery: query.constructor,
        prototypeQuery: query.__proto__,
        constructorHeader: headers.constructor,
        routeParameter: context.req.param('name'),
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
