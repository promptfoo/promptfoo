/**
 * True for the redirect statuses the fetch layer follows hop-by-hop
 * (301/302/303 downgrade to GET with the body dropped; 307/308 preserve
 * method and body). Shared by the guarded redirect loop and the fetch
 * logging path so both agree on which responses are redirects.
 */
export function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
