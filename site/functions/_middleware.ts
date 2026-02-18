/**
 * Cloudflare Pages middleware that exposes the visitor's country code
 * to client-side JS via a cookie (used by consent.js for GDPR geo-targeting).
 * Only sets the cookie on HTML responses when not already present,
 * to preserve CDN cacheability.
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
  // Skip if the browser already has the cookie (avoid redundant Set-Cookie)
  const cookies = context.request.headers.get('Cookie') || '';
  if (cookies.includes('pf_country=')) {
    return response;
  }
  const country = context.request.headers.get('CF-IPCountry') || '';
  if (country) {
    response.headers.append(
      'Set-Cookie',
      `pf_country=${country};Path=/;SameSite=Lax;Secure;Max-Age=86400`,
    );
  }
  return response;
}
