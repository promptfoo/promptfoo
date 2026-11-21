/**
 * Cloudflare Pages middleware that exposes the visitor's country code
 * to client-side JS via a cookie (used by consent.js for GDPR geo-targeting).
 * Only sets the cookie on HTML responses to preserve CDN cacheability
 * for static assets. Always refreshes the country to handle travel/VPN changes.
 */
interface CFContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: CFContext): Promise<Response> {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }
  const country = context.request.headers.get('CF-IPCountry') || '';
  if (/^[A-Z]{2}$/.test(country)) {
    response.headers.append(
      'Set-Cookie',
      `pf_country=${country};Path=/;SameSite=Lax;Secure;Max-Age=86400`,
    );
  } else if (/(?:^|;\s*)pf_country=/.test(context.request.headers.get('Cookie') ?? '')) {
    // Never apply a previous visit's automatic grants when location is unknown.
    response.headers.append('Set-Cookie', 'pf_country=;Path=/;SameSite=Lax;Secure;Max-Age=0');
  }
  return response;
}
