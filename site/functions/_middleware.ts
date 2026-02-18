/**
 * Cloudflare Pages middleware that exposes the visitor's country code
 * to client-side JS via a cookie (used by consent.js for GDPR geo-targeting).
 */
export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  const country = context.request.headers.get('CF-IPCountry') || '';
  if (country) {
    response.headers.append(
      'Set-Cookie',
      `pf_country=${country};Path=/;SameSite=Lax;Max-Age=86400`,
    );
  }
  return response;
};
