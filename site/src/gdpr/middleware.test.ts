import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../functions/_middleware';

function makeContext(opts: { contentType?: string; cfCountry?: string; cookies?: string }) {
  const responseHeaders = new Headers();
  if (opts.contentType) {
    responseHeaders.set('Content-Type', opts.contentType);
  }
  const response = new Response('', { headers: responseHeaders });

  const requestHeaders = new Headers();
  if (opts.cfCountry) {
    requestHeaders.set('CF-IPCountry', opts.cfCountry);
  }
  if (opts.cookies) {
    requestHeaders.set('Cookie', opts.cookies);
  }

  return {
    request: new Request('https://example.com/', { headers: requestHeaders }),
    next: vi.fn().mockResolvedValue(response),
  };
}

describe('_middleware', () => {
  it('sets pf_country cookie on HTML responses', async () => {
    const ctx = makeContext({ contentType: 'text/html; charset=utf-8', cfCountry: 'DE' });
    const res = await onRequest(ctx);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('pf_country=DE');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=86400');
  });

  it('does not set cookie on non-HTML responses', async () => {
    const ctx = makeContext({ contentType: 'application/javascript', cfCountry: 'DE' });
    const res = await onRequest(ctx);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('does not set cookie on CSS responses', async () => {
    const ctx = makeContext({ contentType: 'text/css', cfCountry: 'DE' });
    const res = await onRequest(ctx);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('does not set cookie on image responses', async () => {
    const ctx = makeContext({ contentType: 'image/png', cfCountry: 'US' });
    const res = await onRequest(ctx);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('does not set cookie when CF-IPCountry header is missing', async () => {
    const ctx = makeContext({ contentType: 'text/html' });
    const res = await onRequest(ctx);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('always refreshes country cookie to handle travel/VPN', async () => {
    const ctx = makeContext({
      contentType: 'text/html',
      cfCountry: 'FR',
      cookies: 'pf_country=US',
    });
    const res = await onRequest(ctx);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('pf_country=FR');
  });

  it('passes through response from next()', async () => {
    const ctx = makeContext({ contentType: 'text/html', cfCountry: 'GB' });
    const res = await onRequest(ctx);
    expect(ctx.next).toHaveBeenCalledOnce();
    expect(res).toBeInstanceOf(Response);
  });
});
